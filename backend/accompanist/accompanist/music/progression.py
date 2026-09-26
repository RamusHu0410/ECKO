"""Generate a chord progression from a melody (one chord per bar).

With rules enabled (default), the progression is chosen by a Viterbi dynamic
program that maximizes melody-fit plus transition quality across the whole
sequence, so chord choices are context-aware (see progression_rules).
"""

from __future__ import annotations

from copy import copy

from accompanist.models.chord import Chord
from accompanist.music.chord_candidates import get_candidates
from accompanist.music.chord_scoring import score_chord, _chord_pitch_classes
from accompanist.music.chord_selection import choose_best_chord, _root_pc
from accompanist.music.progression_rules import transition_score
from accompanist.music.segmentation import segment_by_bar, DEFAULT_BEATS_PER_BAR


def _melody_fit(chord: Chord, pitches: list[int], key: str, mode: str) -> float:
    """Melody-fit score for a chord in one bar (higher = better fit).

    Adds small tie-breakers (root-in-melody, coverage) as fractional bonuses so
    they never outweigh a full rule/fit point.
    """
    if not pitches:
        # No melody constraint this bar; slight bias toward the tonic (degree
        # handled by transition rules) — return neutral fit.
        return 0.0
    melody_pcs = {n % 12 for n in pitches}
    base = score_chord(chord, pitches, key, mode)
    root_in_melody = 1 if _root_pc(chord) in melody_pcs else 0
    coverage = len(melody_pcs & _chord_pitch_classes(chord))
    return base + 0.3 * root_in_melody + 0.1 * coverage


def generate_progression(
    melody_notes: list[dict],
    key: str = "C",
    mode: str = "major",
    beats_per_bar: float = DEFAULT_BEATS_PER_BAR,
    num_bars: int | None = None,
    use_rules: bool = True,
) -> list[Chord]:
    """Build a chord progression: one chord per bar.

    Args:
        melody_notes: Notes as dicts with "pitch"/"start"/"duration".
        key: Tonic of the surrounding key.
        mode: "major" or "minor".
        beats_per_bar: Bar length in quarter lengths.
        num_bars: Force this many bars/chords (else inferred).
        use_rules: If True, apply progression rules (repeat penalty, common
            transitions, cadence) via a Viterbi DP. If False, pick each bar's
            best chord greedily and independently.

    Returns:
        A list of Chord objects, one per bar, with start/duration spanning each
        bar.
    """
    segments = segment_by_bar(melody_notes, beats_per_bar, num_bars)

    if use_rules:
        chords = _viterbi(segments, key, mode)
    else:
        chords = [
            choose_best_chord([n["pitch"] for n in seg], key, mode)
            if seg else _tonic_chord(key, mode)
            for seg in segments
        ]

    progression: list[Chord] = []
    for i, chord in enumerate(chords):
        chord = copy(chord)
        chord.start = i * beats_per_bar
        chord.duration = beats_per_bar
        progression.append(chord)
    return progression


def _viterbi(segments: list[list[dict]], key: str, mode: str) -> list[Chord]:
    """Best chord path maximizing melody-fit + transition scores."""
    candidates = get_candidates(key, mode)
    n = len(segments)
    if n == 0:
        return []

    pitches_per_bar = [[note["pitch"] for note in seg] for seg in segments]

    # best[i][c] = (best cumulative score ending in candidate c at bar i,
    #               backpointer to candidate index at bar i-1)
    fit0 = [_melody_fit(c, pitches_per_bar[0], key, mode) for c in candidates]
    best = [(fit0[c], -1) for c in range(len(candidates))]

    back: list[list[int]] = [[-1] * len(candidates)]

    for i in range(1, n):
        new_best = []
        bp_row = []
        for cj, cur in enumerate(candidates):
            fit = _melody_fit(cur, pitches_per_bar[i], key, mode)
            is_final = i == n - 1
            best_prev_score = None
            best_prev_idx = -1
            for ci, prev in enumerate(candidates):
                trans = transition_score(prev, cur, key, mode, is_final=is_final)
                total = best[ci][0] + trans + fit
                if best_prev_score is None or total > best_prev_score:
                    best_prev_score = total
                    best_prev_idx = ci
            new_best.append((best_prev_score, best_prev_idx))
            bp_row.append(best_prev_idx)
        best = new_best
        back.append(bp_row)

    # Find best final state.
    final_idx = max(range(len(candidates)), key=lambda c: best[c][0])

    # Backtrack.
    path_indices = [0] * n
    path_indices[n - 1] = final_idx
    for i in range(n - 1, 0, -1):
        path_indices[i - 1] = back[i][path_indices[i]]

    return [candidates[idx] for idx in path_indices]


def _tonic_chord(key: str, mode: str) -> Chord:
    quality = "minor" if mode == "minor" else "major"
    return Chord(root=key, quality=quality)
