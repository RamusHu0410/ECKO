"""Tests for chord->MIDI (Phase 13), progression->MIDI (14), accompaniment (15)."""

import shutil

import pretty_midi
import pytest

from accompanist.models.chord import Chord
from accompanist.music.chord_to_midi import chord_pitches, pitch_names
from accompanist.music.accompaniment import render_accompaniment, BROKEN_PATTERN
from accompanist.music.progression import generate_progression

_HAS_FLUIDSYNTH = shutil.which("fluidsynth") is not None


# ---------------------------------------------------------------------------
# Phase 13 — chord to MIDI pitches
# ---------------------------------------------------------------------------

def test_c_major_voicing():
    assert pitch_names(Chord("C", "major")) == ["C3", "E3", "G3"]
    assert chord_pitches(Chord("C", "major")) == [48, 52, 55]


def test_other_triads_ascending():
    # Each voicing should be strictly ascending.
    for chord in [Chord("F", "major"), Chord("G", "major"), Chord("A", "minor")]:
        p = chord_pitches(chord)
        assert p == sorted(p)
        assert len(p) == 3


# ---------------------------------------------------------------------------
# Phase 13/15 — broken-chord pattern
# ---------------------------------------------------------------------------

def test_broken_pattern_is_root_fifth_third_fifth():
    # C -> C G E G, F -> F C A C, G -> G D B D
    expected = {
        "C": ["C3", "G3", "E3", "G3"],
        "F": ["F3", "C4", "A3", "C4"],
        "G": ["G3", "D4", "B3", "D4"],
    }
    from music21 import pitch as m21pitch

    for root, want in expected.items():
        tri = chord_pitches(Chord(root, "major"))
        seq = [tri[i] for i in BROKEN_PATTERN]
        names = [m21pitch.Pitch(midi=m).nameWithOctave for m in seq]
        assert names == want


# ---------------------------------------------------------------------------
# Phase 13 — single chord to MIDI file
# ---------------------------------------------------------------------------

def test_single_chord_block_midi(tmp_path):
    out = tmp_path / "cmaj.mid"
    render_accompaniment([Chord("C", "major", 0, 4)], str(out), style="block",
                         tempo=120)
    pm = pretty_midi.PrettyMIDI(str(out))
    notes = pm.instruments[0].notes
    assert sorted(n.pitch for n in notes) == [48, 52, 55]
    # Block chord: all three start together.
    assert all(abs(n.start - notes[0].start) < 1e-6 for n in notes)


# ---------------------------------------------------------------------------
# Phase 14 — progression to MIDI
# ---------------------------------------------------------------------------

def test_progression_block_midi(tmp_path):
    prog = [
        Chord("C", "major", 0, 4),
        Chord("F", "major", 4, 4),
        Chord("G", "major", 8, 4),
        Chord("C", "major", 12, 4),
    ]
    out = tmp_path / "prog.mid"
    render_accompaniment(prog, str(out), style="block", tempo=120)
    pm = pretty_midi.PrettyMIDI(str(out))
    # 4 chords * 3 tones.
    assert len(pm.instruments[0].notes) == 12


# ---------------------------------------------------------------------------
# Phase 15 — melody + broken-chord accompaniment
# ---------------------------------------------------------------------------

def _eight_bar_melody():
    bar_notes = {
        0: [60, 64, 67, 72], 1: [65, 69, 72, 69], 2: [67, 71, 74, 67],
        3: [72, 67, 64, 60], 4: [69, 72, 76, 69], 5: [65, 69, 72, 65],
        6: [67, 71, 74, 71], 7: [60, 64, 67, 60],
    }
    melody = []
    for bar, ps in bar_notes.items():
        for beat, p in enumerate(ps):
            melody.append({"pitch": p, "start": bar * 4 + beat, "duration": 1.0})
    return melody


def test_accompaniment_has_melody_and_broken_chords(tmp_path):
    melody = _eight_bar_melody()
    prog = generate_progression(melody, "C", "major")
    out = tmp_path / "acc.mid"
    render_accompaniment(prog, str(out), style="broken", tempo=120,
                         melody_notes=melody)
    pm = pretty_midi.PrettyMIDI(str(out))
    assert len(pm.instruments) == 2
    # 8 bars * 4 broken notes.
    assert len(pm.instruments[0].notes) == 32
    # melody notes preserved.
    assert len(pm.instruments[1].notes) == 32


@pytest.mark.skipif(not _HAS_FLUIDSYNTH, reason="fluidsynth not available")
def test_accompaniment_renders_to_wav(tmp_path):
    from accompanist.audio.render import render_midi, find_soundfont
    try:
        find_soundfont()
    except FileNotFoundError:
        pytest.skip("no soundfont available")

    melody = _eight_bar_melody()
    prog = generate_progression(melody, "C", "major")
    mid = tmp_path / "acc.mid"
    wav = tmp_path / "acc.wav"
    render_accompaniment(prog, str(mid), style="broken", tempo=120,
                         melody_notes=melody)
    render_midi(str(mid), str(wav))
    assert wav.is_file() and wav.stat().st_size > 0
