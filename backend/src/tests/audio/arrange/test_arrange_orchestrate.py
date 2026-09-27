"""The multi-track arrangement: the right tracks and programs, in range and in key, shaped by phrase."""

import pytest
from music21 import converter

from app.audio.arrange import orchestrate as O
from app.audio.arrange.config import CONCERT_BASS_DRUM, CRASH, INSTRUMENT_RANGES, STYLES
from app.audio.arrange.melody import key_pitch_classes
from app.audio.arrange.transforms import fit_pitches
from app.audio.arrange.validate import validate_midi

D_MINOR = key_pitch_classes("D minor")


def arrange(melody, style="cinematic"):
    midi, warnings = O.orchestrate(melody, STYLES[style].orchestration)
    return {inst.name: inst for inst in midi.instruments}, midi, warnings


def bars_at(seconds, melody):
    return seconds / (melody.beats_per_bar * melody.seconds_per_beat)


def test_phrases_and_their_peaks(melody):
    assert O.find_phrases(melody) == [O.Phrase(0, 4, 1), O.Phrase(4, 8, 4)]  # the Bb, then the D5


@pytest.mark.parametrize("style", sorted(STYLES))
def test_five_tracks_with_the_style_programs(melody, style):
    tracks, midi, warnings = arrange(melody, style)
    preset = STYLES[style].orchestration
    assert [i.name for i in midi.instruments] == list(O.TRACKS)
    assert tracks["melody"].program == preset.lead
    assert tracks["strings_pad"].program == preset.pad
    assert tracks["bass"].program == preset.bass
    assert tracks["brass"].program == preset.brass
    assert tracks["percussion"].is_drum and not any(tracks[n].is_drum for n in O.TRACKS[:-1])
    assert all(tracks[n].notes for n in O.TRACKS)
    assert warnings == []


@pytest.mark.parametrize("style", sorted(STYLES))
def test_every_pitched_note_is_in_its_instruments_range(melody, style):
    tracks, _, _ = arrange(melody, style)
    for name in O.TRACKS[:-1]:
        low, high = INSTRUMENT_RANGES[tracks[name].program]
        assert all(low <= n.pitch <= high for n in tracks[name].notes), name


def test_melody_is_the_tune_moved_into_the_leads_range(melody):
    tracks, _, _ = arrange(melody)
    expected = fit_pitches([n.pitch for n in melody.notes], *INSTRUMENT_RANGES[STYLES["cinematic"].orchestration.lead])
    assert [n.pitch for n in tracks["melody"].notes] == expected
    spb = melody.seconds_per_beat
    assert [round(n.start / spb, 6) for n in tracks["melody"].notes] == [n.start_beats for n in melody.notes]


@pytest.mark.parametrize("style", sorted(STYLES))
def test_harmony_stays_in_key_for_every_styles_transformed_melody(melody, style):
    from app.audio.arrange.transforms import apply_operations

    tracks, _, _ = arrange(apply_operations(melody, STYLES[style].transforms), style)
    for name in ("strings_pad", "bass", "brass"):
        assert {n.pitch % 12 for n in tracks[name].notes} <= D_MINOR, name


def test_an_out_of_key_chord_is_replaced_by_the_best_fitting_one_in_key(melody):
    e_minor = O.ChordSpan(24.0, 4.0, (4, 7, 11))  # bar 7: G Bb A E in the melody
    fixed = O._in_key(e_minor, melody)
    assert set(fixed.pitch_classes) <= D_MINOR
    assert (fixed.start_beats, fixed.duration_beats) == (24.0, 4.0)
    assert fixed.pitch_classes in O.diatonic_triads("D minor")


def test_phrases_restart_at_each_section(melody):
    from app.audio.arrange.transforms import apply_operations

    built = apply_operations(melody, [("additive", {})])  # a 3-bar build-up, then the 8-bar tune
    assert [(p.start_bar, p.end_bar) for p in O.find_phrases(built)] == [(0, 3), (3, 7), (7, 11)]


def test_hits_land_on_downbeats_including_every_peak(melody):
    tracks, _, _ = arrange(melody)
    hits = [n for n in tracks["percussion"].notes if n.pitch in (CONCERT_BASS_DRUM, CRASH)]
    positions = [bars_at(n.start, melody) for n in hits]
    assert all(abs(p - round(p)) < 1e-6 for p in positions)
    crashes = {round(bars_at(n.start, melody)) for n in hits if n.pitch == CRASH}
    assert crashes == {1, 4, 7}  # both phrase peaks and the final bar


def test_brass_swells_rise_into_each_peak(melody):
    tracks, _, _ = arrange(melody)
    swells = [cc for cc in tracks["brass"].control_changes if cc.number == 11]
    bar = melody.beats_per_bar * melody.seconds_per_beat
    for peak in (1, 4, 7):
        ramp = [cc.value for cc in swells if (peak - 1) * bar - 1e-6 <= cc.time < peak * bar - 1e-6]
        assert ramp == sorted(ramp) and ramp[0] < 50 and ramp[-1] == 127, peak
        arrivals = [n for n in tracks["brass"].notes if abs(n.start - peak * bar) < 1e-6]
        assert arrivals, f"no brass chord on the downbeat of bar {peak}"


def test_dynamics_build_toward_the_peak(melody):
    tracks, _, _ = arrange(melody)
    pad = sorted(tracks["strings_pad"].notes, key=lambda n: n.start)
    bar = melody.beats_per_bar * melody.seconds_per_beat
    velocity_at = {round(n.start / bar): n.velocity for n in pad if abs(n.start / bar - round(n.start / bar)) < 1e-6}
    assert velocity_at[0] < velocity_at[1]  # into the first peak
    assert velocity_at[4] > velocity_at[7]  # easing off after the second


def test_written_arrangement_reads_in_music21_and_pretty_midi(melody, tmp_path):
    _, midi, _ = arrange(melody)
    path = tmp_path / "arrangement.mid"
    midi.write(str(path))
    validate_midi(path, min_tracks=5, music21=True)
    assert len(converter.parse(str(path)).parts) == 5


def test_harmony_falls_back_to_the_tonic_if_the_accompanist_fails(melody, monkeypatch):
    import accompanist.music.progression as progression

    def broken(*args, **kwargs):
        raise RuntimeError("boom")

    from app.audio.arrange import config

    monkeypatch.setattr(config, "HARMONY", "accompanist")
    monkeypatch.setattr(progression, "generate_progression", broken)
    chords, warnings = O.harmonize(melody)
    assert warnings and "tonic" in warnings[0]
    assert {c.pitch_classes for c in chords} == {(2, 5, 9)}  # D minor triad


def test_diatonic_triads_start_on_the_tonic():
    """music21 lists a minor scale from its relative major; the chords must start on the tonic."""
    from app.audio.arrange.debug import chord_name

    assert [chord_name(t) for t in O.diatonic_triads("D minor")] == ["Dm", "Edim", "F", "Gm", "Am", "Bb", "C"]
    assert [chord_name(t) for t in O.diatonic_triads("C major")] == ["C", "Dm", "Em", "F", "G", "Am", "Bdim"]


def test_builtin_harmony_opens_on_the_tonic_and_closes_with_a_cadence(melody):
    chords = O.builtin_progression(melody)
    assert chords[0].pitch_classes == (2, 5, 9)  # Dm
    assert chords[-1].pitch_classes == (2, 5, 9)
    assert chords[-2].root in (7, 9)  # iv or v before it
    assert sum(c.duration_beats for c in chords) == melody.bars * melody.beats_per_bar


def test_builtin_harmony_is_fast_on_a_long_melody(melody):
    import time

    long = melody.with_notes([n.__class__(n.pitch, n.start_beats + k * 32, n.duration_beats, n.velocity)
                              for k in range(12) for n in melody.notes])  # 96 bars
    began = time.monotonic()
    O.builtin_progression(long)
    assert time.monotonic() - began < 1.0


def test_the_accompanist_engine_is_still_an_option(melody, monkeypatch):
    from app.audio.arrange import config

    monkeypatch.setattr(config, "HARMONY", "accompanist")
    chords, warnings = O.harmonize(melody)
    assert warnings == [] and all(set(c.pitch_classes) <= D_MINOR for c in chords)
