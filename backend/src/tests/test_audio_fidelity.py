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
)

SR = 22050


def _tone(freq_hz, seconds, sr=SR, amplitude=0.8):
    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False)
    return (amplitude * np.sin(2 * np.pi * freq_hz * t)).astype(np.float32)


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
