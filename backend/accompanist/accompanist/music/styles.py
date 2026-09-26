"""Accompaniment styles: each style is a MIDI pattern generator.

A style takes a chord's voicing (list of MIDI pitches, root first) plus the
bar's start/duration in beats, and returns a list of
(pitch, start_beat, duration_beats, velocity) note events.
"""

from __future__ import annotations

from typing import Callable

# A note event within a bar: pitch, start (beats), duration (beats), velocity.
NoteEvent = tuple[int, float, float, int]
StyleFn = Callable[[list[int], float, float, int], list[NoteEvent]]


def _root_third_fifth(pitches: list[int]) -> tuple[int, int, int]:
    """Return (root, third, fifth), tolerant of non-triads."""
    root = pitches[0]
    third = pitches[1] if len(pitches) > 1 else pitches[0]
    fifth = pitches[2] if len(pitches) > 2 else pitches[-1]
    return root, third, fifth


def piano_style(pitches, start, dur, velocity) -> list[NoteEvent]:
    """Piano: bass -> chord -> chord (3 subdivisions).

    Beat 1: bass root (low). Beats 2-3: the full chord stabbed twice.
    """
    root, third, fifth = _root_third_fifth(pitches)
    bass = root - 12
    step = dur / 3
    events = [(bass, start, step, velocity)]
    for k in (1, 2):
        for p in pitches:
            events.append((p, start + k * step, step, velocity - 10))
    return events


def pop_style(pitches, start, dur, velocity) -> list[NoteEvent]:
    """Pop: bass -> chord -> chord -> chord (4 subdivisions)."""
    root, third, fifth = _root_third_fifth(pitches)
    bass = root - 12
    step = dur / 4
    events = [(bass, start, step, velocity)]
    for k in (1, 2, 3):
        for p in pitches:
            events.append((p, start + k * step, step, velocity - 10))
    return events


def cinematic_style(pitches, start, dur, velocity) -> list[NoteEvent]:
    """Cinematic: low bass + wide, sustained chord held for the whole bar."""
    root, third, fifth = _root_third_fifth(pitches)
    events: list[NoteEvent] = []
    # Low sustained bass, an octave below root.
    events.append((root - 12, start, dur, velocity))
    # Wide voicing: spread the chord tones with the fifth an octave up.
    wide = [root, third, fifth, fifth + 12]
    for p in wide:
        events.append((p, start, dur, velocity - 15))
    return events


def classical_style(pitches, start, dur, velocity) -> list[NoteEvent]:
    """Classical: broken chords (root, fifth, third, fifth) with voice leading.

    The `pitches` passed in should already be voice-led (see voice_leading).
    """
    root, third, fifth = _root_third_fifth(pitches)
    pattern = [root, fifth, third, fifth]
    step = dur / len(pattern)
    return [
        (p, start + k * step, step, velocity)
        for k, p in enumerate(pattern)
    ]


STYLES: dict[str, StyleFn] = {
    "piano": piano_style,
    "pop": pop_style,
    "cinematic": cinematic_style,
    "classical": classical_style,
}
