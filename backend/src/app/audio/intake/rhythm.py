"""The clean notes (in seconds) → the tempo, the key, and the notes in beats on the beat grid.

The first note is beat 0. Starts and ends snap to sixteenths, or to eighth-note triplets where
those fit clearly better; dotted lengths come out of the sixteenth grid on their own.
"""

import math
from dataclasses import dataclass
from fractions import Fraction

import numpy as np

from .cleanup import Note
from .config import CLEANUP

TEMPO_RANGE = (60.0, 180.0)
TEMPO_STEP = 0.25
PREFERRED_TEMPO = 100.0  # between two tempos that fit as well (double or half), the nearer one wins
MIN_NOTES_FOR_TEMPO = 3  # with fewer notes there's no rhythm to read: PREFERRED_TEMPO is used
PREFERENCE_WEIGHT = 0.15
TRIPLET_FITS = 0.04  # a triplet position is used when the note is this close to it (in beats)...
SIXTEENTH_MISSES = 0.06  # ...and this far from the nearest sixteenth
TRIPLET_CONTINUES = 0.1  # right after a triplet note, a triplet position this close is used (they come in threes)


@dataclass
class BeatNote:
    pitch: int
    start_beats: float
    duration_beats: float
    velocity: int


def detect_tempo(notes: list[Note]) -> float:
    """The tempo (BPM, one decimal) at which the note starts read most simply. Several tempos fit
    any tune (quarter notes at 120 are dotted eighths at 90), so a start on the beat scores best, then
    on an eighth, a sixteenth, and a triplet last; a mild preference for moderate tempos breaks ties."""
    if len(notes) < MIN_NOTES_FOR_TEMPO:
        return PREFERRED_TEMPO
    onsets = np.array([n.start for n in notes[1:]]) - notes[0].start
    candidates = np.arange(TEMPO_RANGE[0], TEMPO_RANGE[1] + TEMPO_STEP, TEMPO_STEP)
    costs = [_grid_miss(onsets, tempo) + PREFERENCE_WEIGHT * math.log2(tempo / PREFERRED_TEMPO) ** 2 for tempo in candidates]
    return round(float(candidates[int(np.argmin(costs))]), 1)


def quantize(notes: list[Note], tempo: float) -> list[BeatNote]:
    """The notes in beats from the first note, snapped to the grid, one at a time and never overlapping."""
    first = notes[0].start
    out: list[BeatNote] = []
    for note in notes:
        in_triplet = bool(out) and _step(out[-1].start_beats) == 1 / 3
        start = snap((note.start - first) * tempo / 60, in_triplet)
        end = snap((note.end - first) * tempo / 60, _step(start) == 1 / 3)
        if out and start <= out[-1].start_beats:
            start = out[-1].start_beats + _step(out[-1].start_beats)
        end = max(end, start + _step(start))
        out.append(BeatNote(note.pitch, start, end - start, note.velocity))
    for current, following in zip(out, out[1:]):  # a note ends where the next begins, at the latest
        current.duration_beats = min(current.duration_beats, following.start_beats - current.start_beats)
    out = _without_slivers(out, CLEANUP.min_note_ms / 1000 * tempo / 60)
    for note in out:
        note.start_beats, note.duration_beats = round(note.start_beats, 6), round(note.duration_beats, 6)
    return out


def _without_slivers(notes: list[BeatNote], shortest: float) -> list[BeatNote]:
    """Snapping two neighbours to different grids (a triplet, then a sixteenth) can squeeze a note
    below the shortest allowed; it joins the note before it (or, if it's first, the one after)."""
    kept: list[BeatNote] = []
    for note in notes:
        if note.duration_beats >= shortest - 1e-9:
            kept.append(note)
        elif kept:
            kept[-1].duration_beats = note.start_beats + note.duration_beats - kept[-1].start_beats
        elif len(notes) > 1:
            notes[1].duration_beats += notes[1].start_beats - note.start_beats
            notes[1].start_beats = note.start_beats
    return kept


def snap(beats: float, in_triplet: bool = False) -> float:
    """The nearest sixteenth, or triplet eighth where that clearly fits (or a triplet is under way)."""
    sixteenth = round(beats * 4) / 4
    triplet = round(beats * 3) / 3
    clearly = abs(beats - triplet) < TRIPLET_FITS and abs(beats - sixteenth) > SIXTEENTH_MISSES
    if clearly or (in_triplet and abs(beats - triplet) < TRIPLET_CONTINUES):
        return triplet
    return sixteenth


def detect_key(notes: list[BeatNote]) -> str:
    """The key, named the music21 way: "D minor", "B- major" (music21 writes flats as -)."""
    from music21 import note as m21_note, stream

    melody = stream.Stream()
    for n in notes:
        melody.append(m21_note.Note(n.pitch, quarterLength=Fraction(n.duration_beats).limit_denominator(12)))  # triplets exactly
    key = melody.analyze("key")
    return f"{key.tonic.name} {key.mode}"


# (spacing in beats, how much a start there costs): the simpler the position, the cheaper
GRIDS = ((1, 0.0), (1 / 2, 0.1), (1 / 4, 0.25), (1 / 3, 0.3))
TIMING_SLOP_S = 0.05  # how far off the grid a hummed (and detected) start typically is


def _grid_miss(onsets: np.ndarray, tempo: float) -> float:
    """How well the onsets (seconds from the first note) read at this tempo: for each, how far it is
    from a grid position, in seconds (so a slow tempo's long beats don't hide sloppy fits), plus what
    that position costs, on whichever grid suits it best; averaged."""
    beats = onsets * tempo / 60
    seconds_per_beat = 60 / tempo
    per_grid = [np.abs(beats / step - np.round(beats / step)) * step * seconds_per_beat / TIMING_SLOP_S + cost for step, cost in GRIDS]
    return float(np.mean(np.min(per_grid, axis=0)))


def _step(beat: float) -> float:
    """The grid step at this position: a triplet eighth on a triplet, else a sixteenth."""
    return 1 / 3 if abs(beat * 4 - round(beat * 4)) > 1e-6 else 0.25
