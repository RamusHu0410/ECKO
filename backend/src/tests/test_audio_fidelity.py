"""Fidelity tests for the audio capture/parsing pipeline.

These don't just check that the processor runs — they check it recovers what
was actually put into the WAV file: known frequencies land as the right notes,
note count and timing survive round-tripping, and loud/quiet or silent input
doesn't get corrupted into false pitches.
"""

import wave

import numpy as np
import pytest

from src.app.audio.processor import (
    AudioProcessor,
    extract_notes,
    analyze_audio_file,
    _build_melody,
)

SR = 22050


def _tone(freq_hz, seconds, sr=SR, amplitude=0.8):
    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False)
    return (amplitude * np.sin(2 * np.pi * freq_hz * t)).astype(np.float32)


def _vibrato_tone(freq_hz, seconds, sr=SR, amplitude=0.8, vibrato_rate_hz=5.5, vibrato_extent_hz=15.0):
    """A hum wavers in pitch (vibrato) and loudness (tremolo) rather than
    holding a perfectly steady tone. Instantaneous frequency oscillates
    around ``freq_hz`` by +/- ``vibrato_extent_hz`` at ``vibrato_rate_hz``."""
    n = int(sr * seconds)
    t = np.linspace(0, seconds, n, endpoint=False)
    instantaneous_freq = freq_hz + vibrato_extent_hz * np.sin(2 * np.pi * vibrato_rate_hz * t)
    phase = 2 * np.pi * np.cumsum(instantaneous_freq) / sr
    tremolo = 1.0 - 0.15 * np.sin(2 * np.pi * (vibrato_rate_hz * 0.9) * t)
    return (amplitude * tremolo * np.sin(phase)).astype(np.float32)


def _silence(seconds, sr=SR):
    return np.zeros(int(sr * seconds), dtype=np.float32)


def _write_wav(path, audio, sr=SR):
    pcm = np.clip(audio, -1.0, 1.0)
    pcm16 = (pcm * 32767).astype(np.int16)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm16.tobytes())


def _write_tone_sequence(path, notes, sr=SR, gap=0.15):
    """notes: list of (freq_hz, duration_s). Silence gaps separate each note
    so segment detection can tell them apart."""
    chunks = []
    for freq, dur in notes:
        chunks.append(_tone(freq, dur, sr=sr))
        chunks.append(_silence(gap, sr=sr))
    audio = np.concatenate(chunks)
    _write_wav(path, audio, sr=sr)
    return audio


class TestPitchFidelity:
    """A known frequency in => the same frequency (within tolerance) out."""

    @pytest.mark.parametrize(
        "freq_hz",
        [220.0, 261.63, 440.0, 523.25],  # A3, C4, A4, C5
    )
    def test_single_tone_pitch_is_recovered(self, tmp_path, freq_hz):
        path = tmp_path / "tone.wav"
        _write_wav(path, _tone(freq_hz, 1.5))

        processor = AudioProcessor(target_sr=SR)
        audio, sr = processor.load_wav(str(path))
        pitch = processor.extract_pitch(audio, sr)

        assert pitch["voiced_frames"] > 0, "a clean sine tone should be detected as voiced"
        # PYIN on a pure tone should be accurate to well within a semitone (~3%).
        assert pitch["median_hz"] == pytest.approx(freq_hz, rel=0.03)

    def test_silence_produces_no_false_pitch(self, tmp_path):
        path = tmp_path / "silence.wav"
        _write_wav(path, _silence(1.0))

        processor = AudioProcessor(target_sr=SR)
        audio, sr = processor.load_wav(str(path))
        pitch = processor.extract_pitch(audio, sr)

        assert pitch["voiced_frames"] == 0, "silence must not be reported as a pitched note"


class TestMelodyFidelity:
    """A known sequence of notes in => the same number/order/pitch of notes out."""

    def test_note_count_and_order_survive(self, tmp_path):
        path = tmp_path / "melody.wav"
        sequence = [(261.63, 0.4), (329.63, 0.4), (392.00, 0.4)]  # C4, E4, G4
        _write_tone_sequence(path, sequence)

        notes = extract_notes(str(path), target_sr=SR, min_note_duration=0.05)

        assert len(notes) == len(sequence), (
            f"expected {len(sequence)} distinct notes, got {len(notes)}: {notes}"
        )
        for note, (expected_freq, _duration) in zip(notes, sequence):
            assert note["pitch_hz"] == pytest.approx(expected_freq, rel=0.05)

    def test_note_timing_is_not_shifted_or_dropped(self, tmp_path):
        path = tmp_path / "timing.wav"
        sequence = [(440.0, 0.3), (440.0, 0.3)]
        gap = 0.2
        audio = _write_tone_sequence(path, sequence, gap=gap)
        total_duration = len(audio) / SR

        notes = extract_notes(str(path), target_sr=SR, min_note_duration=0.05, merge_gap=0.0)

        assert len(notes) == 2, "equal-pitch notes separated by silence must stay separate notes"
        assert notes[0]["end"] <= notes[1]["start"], "notes must not overlap"
        gap_between = notes[1]["start"] - notes[0]["end"]
        assert gap_between > 0, "the silent gap between notes must not be swallowed"
        assert gap_between == pytest.approx(gap, abs=0.15)
        for note in notes:
            assert 0.0 <= note["start"] < note["end"] <= total_duration + 0.05

    def test_melody_midi_conversion_matches_known_note(self, tmp_path):
        path = tmp_path / "a4.wav"
        _write_wav(path, np.concatenate([_tone(440.0, 0.6), _silence(0.1)]))

        result = analyze_audio_file(str(path))
        melody = result["melody"]

        assert len(melody) == 1
        # A4 = MIDI note 69
        assert melody[0]["hz"] == pytest.approx(69.0, abs=0.5)


class TestRealNoteFiltering:
    """A loud segment isn't necessarily a sung note (mic pop, breath catch,
    attack transient). Regression: an earlier version of this filter dropped
    the note at index 0 unconditionally, on the assumption every recording
    starts with an artifact. That assumption was wrong far more often than
    right — most recordings start right on the user's real first note — and
    unconditionally discarding it corrupted melody, key, and chord detection.
    The filter must judge each segment on its own acoustic evidence (how much
    of it is confidently voiced/pitched), regardless of its position."""

    def _pop_then_melody(self, tmp_path, name="pop_melody.wav"):
        path = tmp_path / name
        # A mic pop/attack transient needs to be loud and long enough to
        # register as its own segment at all (a too-brief blip just gets
        # smoothed away by detect_sound_segments' analysis window) — a burst
        # of noise a bit longer than one analysis frame does the job. Being
        # noise (not a tone), PYIN should mark it mostly unvoiced.
        pop = 0.9 * (
            2 * np.random.default_rng(0).random(int(SR * 0.12)).astype(np.float32) - 1
        )
        sequence = [(261.63, 0.4), (329.63, 0.4)]  # C4, E4
        note1 = _tone(sequence[0][0], sequence[0][1])
        note2 = _tone(sequence[1][0], sequence[1][1])
        combined = np.concatenate([pop, _silence(0.3), note1, _silence(0.2), note2])
        _write_wav(path, combined)
        return path, sequence

    def test_a_leading_pop_is_filtered_by_being_unpitched_not_by_position(self, tmp_path):
        path, sequence = self._pop_then_melody(tmp_path)
        notes = extract_notes(str(path), target_sr=SR, min_note_duration=0.02)

        assert len(notes) == len(sequence)
        for note, (expected_freq, _duration) in zip(notes, sequence):
            assert note["pitch_hz"] == pytest.approx(expected_freq, rel=0.06)

    def test_a_real_first_note_is_kept_when_there_is_no_pop(self, tmp_path):
        """The regression case: a clean hum with no leading artifact at all
        must keep every one of its real notes, including the first."""
        path = tmp_path / "no_pop_melody.wav"
        sequence = [(261.63, 0.4), (329.63, 0.4), (392.00, 0.4)]  # C4, E4, G4
        _write_tone_sequence(path, sequence)

        notes = extract_notes(str(path), target_sr=SR, min_note_duration=0.05)

        assert len(notes) == len(sequence), (
            f"a real first note must survive when there's no artifact to drop, got {notes}"
        )
        assert notes[0]["pitch_hz"] == pytest.approx(sequence[0][0], rel=0.05)

    def test_extract_notes_keeps_a_single_real_note(self, tmp_path):
        path = tmp_path / "single_note.wav"
        _write_wav(path, _tone(440.0, 0.6))

        notes = extract_notes(str(path), target_sr=SR, min_note_duration=0.02)

        assert len(notes) == 1
        assert notes[0]["pitch_hz"] == pytest.approx(440.0, rel=0.05)

    def test_build_melody_drops_an_unpitched_segment_wherever_it_is(self):
        """A synthetic 'noise' segment (voiced_flag False throughout) must be
        excluded regardless of whether it's first, middle, or last."""
        analysis = {
            "segments": [
                {"start": 0.0, "end": 0.1, "duration": 0.1},  # noise burst
                {"start": 0.3, "end": 0.7, "duration": 0.4},  # real note
                {"start": 0.9, "end": 1.0, "duration": 0.1},  # another noise burst
            ],
            "pitch": {
                "times": [0.05, 0.5, 0.95],
                "frequencies": [999.0, 261.63, 999.0],
                "voiced_flag": [False, True, False],
            },
        }
        melody = _build_melody(analysis)
        assert len(melody) == 1
        assert melody[0]["start"] == pytest.approx(0.3)

    def test_build_melody_keeps_a_single_real_segment(self):
        analysis = {
            "segments": [{"start": 0.0, "end": 0.4, "duration": 0.4}],
            "pitch": {
                "times": [0.1, 0.2, 0.3],
                "frequencies": [261.63, 261.63, 261.63],
                "voiced_flag": [True, True, True],
            },
        }
        melody = _build_melody(analysis)
        assert len(melody) == 1

    def test_build_melody_keeps_all_real_notes_with_no_artifact(self):
        """The regression case for the production path: nothing should ever
        be dropped just for being first when every segment is genuinely
        voiced."""
        analysis = {
            "segments": [
                {"start": 0.0, "end": 0.4, "duration": 0.4},
                {"start": 0.5, "end": 0.9, "duration": 0.4},
            ],
            "pitch": {
                "times": [0.1, 0.2, 0.6, 0.7],
                "frequencies": [261.63, 261.63, 329.63, 329.63],
                "voiced_flag": [True, True, True, True],
            },
        }
        melody = _build_melody(analysis)
        assert len(melody) == 2
        assert melody[0]["start"] == pytest.approx(0.0)


class TestVibratoFidelity:
    """A hummed note wavers in pitch and loudness (vibrato/tremolo) instead of
    holding perfectly steady. The pipeline should still recover the intended
    center pitch as one note, not fragment it or drift off-key."""

    def test_vibrato_tone_center_pitch_is_recovered(self, tmp_path):
        path = tmp_path / "vibrato.wav"
        _write_wav(path, _vibrato_tone(440.0, 1.5))

        processor = AudioProcessor(target_sr=SR)
        audio, sr = processor.load_wav(str(path))
        pitch = processor.extract_pitch(audio, sr)

        assert pitch["voiced_frames"] > 0
        # Vibrato swings the instantaneous frequency by +/-15Hz around 440Hz;
        # the tracked median should still center near the sung note, not one
        # of the swing extremes, and definitely not a different note.
        assert pitch["median_hz"] == pytest.approx(440.0, rel=0.05)
        # PYIN must actually be following the wobble, not flatlining on one
        # frame's estimate (which would indicate it lost the pitch track).
        voiced_values = np.array(pitch["frequencies"])[pitch["voiced_flag"]]
        assert np.std(voiced_values) > 1.0

    def test_vibrato_note_is_not_fragmented_into_multiple_notes(self, tmp_path):
        """A single wavering hum must extract as one note, not several short
        ones split apart by the pitch wobble or tremolo dips."""
        path = tmp_path / "vibrato_note.wav"
        audio = np.concatenate([_vibrato_tone(392.0, 1.2), _silence(0.1)])
        _write_wav(path, audio)

        notes = extract_notes(str(path), target_sr=SR, min_note_duration=0.05)

        assert len(notes) == 1, f"a single sustained hum should be one note, got {notes}"
        assert notes[0]["pitch_hz"] == pytest.approx(392.0, rel=0.05)

    def test_vibrato_sequence_still_distinguishes_notes(self, tmp_path):
        """Two different hummed notes, each with vibrato, should still be told
        apart and land on the right pitches despite the inconsistency."""
        path = tmp_path / "vibrato_melody.wav"
        chunks = [
            _vibrato_tone(261.63, 0.6),  # C4
            _silence(0.15),
            _vibrato_tone(392.00, 0.6),  # G4
            _silence(0.15),
        ]
        _write_wav(path, np.concatenate(chunks))

        notes = extract_notes(str(path), target_sr=SR, min_note_duration=0.05)

        assert len(notes) == 2
        assert notes[0]["pitch_hz"] == pytest.approx(261.63, rel=0.06)
        assert notes[1]["pitch_hz"] == pytest.approx(392.00, rel=0.06)

    def test_wide_vibrato_in_background_noise_is_not_biased_off_pitch(self, tmp_path):
        """A wide, uneven vibrato (a shaky hum) plus mic background noise is
        the harshest realistic case: a wide pitch swing recorded on a noisy
        mic. A too-wide pitch-analysis window averages several vibrato
        swings together and skews the recovered pitch off the sung note
        entirely (regression: median drifted to ~466Hz for a 440Hz center
        with a +/-100Hz wobble). It must still land within a semitone."""
        path = tmp_path / "wide_vibrato_noise.wav"
        rng = np.random.default_rng(42)
        tone = _vibrato_tone(
            440.0, 1.5, amplitude=0.5, vibrato_rate_hz=6.0, vibrato_extent_hz=100.0
        )
        noise = 0.15 * rng.standard_normal(tone.shape).astype(np.float32)
        _write_wav(path, tone + noise)

        processor = AudioProcessor(target_sr=SR)
        audio, sr = processor.load_wav(str(path))
        pitch = processor.extract_pitch(audio, sr)

        assert pitch["voiced_frames"] > 0
        # A semitone at 440Hz is ~26Hz; a wide-but-real vibrato must not be
        # mistaken for a different note.
        assert pitch["median_hz"] == pytest.approx(440.0, rel=0.05)


class TestNoiseReduction:
    """reduce_noise() runs ahead of segmentation/pitch/volume/spectral
    extraction. It must measurably clean up noisy input, and — just as
    important — leave a clean recording untouched instead of introducing
    its own artifacts (regression: an early version merged/dropped notes
    in a perfectly clean hum by smoothing energy across silent gaps)."""

    def test_denoising_lowers_noise_floor_without_erasing_the_tone(self, tmp_path):
        """A realistic hum recording: brief silence before/after the note
        (mic lead-in/lead-out), noise throughout. The denoiser should learn
        the noise profile from those silent stretches and use it to quiet
        the background everywhere, while the note itself survives intact."""
        rng = np.random.default_rng(7)
        noise_amplitude = 0.01  # background hiss ~35dB below the hum, not comparable to it
        lead = noise_amplitude * rng.standard_normal(int(SR * 0.3)).astype(np.float32)
        tone = _tone(440.0, 1.0, amplitude=0.6) + noise_amplitude * rng.standard_normal(
            int(SR * 1.0)
        ).astype(np.float32)
        trail = noise_amplitude * rng.standard_normal(int(SR * 0.3)).astype(np.float32)
        noisy = np.concatenate([lead, tone, trail])

        processor = AudioProcessor(target_sr=SR)
        cleaned = processor.reduce_noise(noisy, SR)

        lead_samples = int(SR * 0.3)
        noise_before = np.sqrt(np.mean(noisy[:lead_samples] ** 2))
        noise_after = np.sqrt(np.mean(cleaned[:lead_samples] ** 2))
        assert noise_after < noise_before, "the lead-in noise floor should be measurably quieter"

        # The tone itself must survive: still a clean, voiced 440Hz signal.
        pitch = processor.extract_pitch(cleaned, SR)
        assert pitch["voiced_frames"] > 0
        assert pitch["median_hz"] == pytest.approx(440.0, rel=0.03)

    def test_denoising_does_not_corrupt_a_clean_recording(self, tmp_path):
        """Run a silence-separated melody (no added noise) through
        reduce_noise and check note count/pitch/order are identical to the
        undenoised extraction — denoising a clean hum must be a no-op in
        substance, not just "close enough"."""
        path = tmp_path / "clean_melody.wav"
        sequence = [(261.63, 0.4), (329.63, 0.4), (392.00, 0.4)]  # C4, E4, G4
        _write_tone_sequence(path, sequence)

        notes_denoised = extract_notes(str(path), target_sr=SR, min_note_duration=0.05)

        processor = AudioProcessor(target_sr=SR)
        result_raw = processor.process_audio(str(path), reduce_noise=False)

        assert len(notes_denoised) == len(sequence)
        raw_notes_count = len(
            [s for s in result_raw["segments"] if s["duration"] >= 0.05]
        )
        assert raw_notes_count == len(sequence)
        for note, (expected_freq, _duration) in zip(notes_denoised, sequence):
            assert note["pitch_hz"] == pytest.approx(expected_freq, rel=0.05)

    def test_silence_stays_silence_after_denoising(self, tmp_path):
        processor = AudioProcessor(target_sr=SR)
        cleaned = processor.reduce_noise(_silence(1.0), SR)
        assert np.max(np.abs(cleaned)) == pytest.approx(0.0, abs=1e-6)


class TestRobustnessAgainstCorruption:
    """The pipeline should degrade gracefully, not silently invent data."""

    def test_low_amplitude_signal_is_not_mistaken_for_silence_or_noise(self, tmp_path):
        path = tmp_path / "quiet.wav"
        _write_wav(path, _tone(440.0, 1.0, amplitude=0.05))

        processor = AudioProcessor(target_sr=SR)
        audio, sr = processor.load_wav(str(path))
        pitch = processor.extract_pitch(audio, sr)

        assert pitch["voiced_frames"] > 0
        assert pitch["median_hz"] == pytest.approx(440.0, rel=0.05)

    def test_clean_audio_round_trip_preserves_pitch(self, tmp_path):
        """clean_audio (bandpass + trim + normalize) must not distort the
        fundamental frequency it's supposed to make clearer."""
        path = tmp_path / "noisy.wav"
        rng = np.random.default_rng(0)
        tone = _tone(440.0, 1.0, amplitude=0.6)
        noise = 0.02 * rng.standard_normal(tone.shape).astype(np.float32)
        _write_wav(path, tone + noise)

        processor = AudioProcessor(target_sr=SR)
        audio, sr = processor.load_wav(str(path))
        cleaned = processor.clean_audio(audio, sr)
        pitch = processor.extract_pitch(cleaned, sr)

        assert pitch["voiced_frames"] > 0
        assert pitch["median_hz"] == pytest.approx(440.0, rel=0.03)

    def test_resampling_preserves_pitch(self, tmp_path):
        """Loading at a non-native sample rate (as the recorder's mic input
        would be) must resample without shifting the perceived pitch."""
        native_sr = 44100
        path = tmp_path / "native.wav"
        _write_wav(path, _tone(440.0, 1.0, sr=native_sr), sr=native_sr)

        processor = AudioProcessor(target_sr=22050)
        audio, sr = processor.load_wav(str(path))
        pitch = processor.extract_pitch(audio, sr)

        assert sr == 22050
        assert pitch["median_hz"] == pytest.approx(440.0, rel=0.03)
