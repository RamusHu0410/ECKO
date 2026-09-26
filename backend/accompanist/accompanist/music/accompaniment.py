"""Render chord progressions into MIDI accompaniment.

Supports two styles:
  * "block"  - all chord tones sound together for the whole bar.
  * "broken" - a broken-chord (arpeggio) pattern: root, fifth, third, fifth.
"""

from __future__ import annotations

import pretty_midi

from accompanist.models.chord import Chord
from accompanist.music.chord_to_midi import chord_pitches
from accompanist.music.styles import STYLES
from accompanist.music.voice_leading import lead_voices

DEFAULT_PROGRAM = 0       # Acoustic Grand Piano
DEFAULT_VELOCITY = 80
# Broken-chord order expressed as indices into the [root, third, fifth] triad.
# root, fifth, third, fifth  ->  e.g. C: C G E G
BROKEN_PATTERN = [0, 2, 1, 2]


def _seconds_per_beat(tempo: float) -> float:
    return 60.0 / tempo


def render_accompaniment(
    chords: list[Chord],
    path: str,
    *,
    style: str = "broken",
    tempo: float = 120.0,
    beats_per_bar: float = 4.0,
    octave: int = 3,
    melody_notes: list[dict] | None = None,
    program: int = DEFAULT_PROGRAM,
    velocity: int = DEFAULT_VELOCITY,
) -> str:
    """Render a chord progression (optionally with melody) to a MIDI file.

    Chord `start`/`duration` are interpreted in beats (quarter lengths). If a
    chord has no timing set, bars are laid out sequentially using
    `beats_per_bar`.

    Args:
        chords: The progression.
        path: Output .mid path.
        style: "block" or "broken".
        tempo: BPM (also written to the MIDI header).
        beats_per_bar: Bar length in beats, used for fallback layout and for
            splitting broken-chord patterns.
        octave: Root octave for the chord voicing.
        melody_notes: Optional melody dicts (pitch/start/duration in beats) to
            include on a separate track.
        program: GM program for the accompaniment instrument.
        velocity: Note velocity.

    Returns:
        The output path.
    """
    spb = _seconds_per_beat(tempo)
    pm = pretty_midi.PrettyMIDI(initial_tempo=float(tempo))
    acc = pretty_midi.Instrument(program=program)

    # For named styles, pre-compute voicings. Classical uses voice leading so
    # chords connect smoothly; others use plain root-position voicings.
    style_fn = STYLES.get(style)
    voicings: list[list[int]] | None = None
    if style_fn is not None:
        if style == "classical":
            voicings = lead_voices(chords, octave=octave)
        else:
            voicings = [chord_pitches(c, octave) for c in chords]

    for i, chord in enumerate(chords):
        # Determine bar timing in beats.
        start_beat = chord.start if chord.duration else i * beats_per_bar
        dur_beats = chord.duration or beats_per_bar

        if style_fn is not None:
            pitches = voicings[i]
            for pitch, ev_start, ev_dur, vel in style_fn(
                pitches, start_beat, dur_beats, velocity
            ):
                acc.notes.append(
                    pretty_midi.Note(
                        velocity=max(1, min(127, vel)),
                        pitch=int(pitch),
                        start=ev_start * spb,
                        end=(ev_start + ev_dur) * spb,
                    )
                )
        else:
            pitches = chord_pitches(chord, octave)
            if style == "block":
                _add_block(acc, pitches, start_beat, dur_beats, spb, velocity)
            else:  # "broken"
                _add_broken(acc, pitches, start_beat, dur_beats, spb, velocity)

    pm.instruments.append(acc)

    if melody_notes:
        mel = pretty_midi.Instrument(program=program)
        for n in melody_notes:
            start = n["start"] * spb
            end = start + n["duration"] * spb
            mel.notes.append(
                pretty_midi.Note(
                    velocity=DEFAULT_VELOCITY + 20,
                    pitch=int(n["pitch"]),
                    start=start,
                    end=end,
                )
            )
        pm.instruments.append(mel)

    pm.write(path)
    return path


def _add_block(inst, pitches, start_beat, dur_beats, spb, velocity):
    start = start_beat * spb
    end = (start_beat + dur_beats) * spb
    for p in pitches:
        inst.notes.append(
            pretty_midi.Note(velocity=velocity, pitch=p, start=start, end=end)
        )


def _add_broken(inst, pitches, start_beat, dur_beats, spb, velocity):
    """Broken-chord pattern: root, fifth, third, fifth across the bar."""
    steps = len(BROKEN_PATTERN)
    step_beats = dur_beats / steps
    for k, idx in enumerate(BROKEN_PATTERN):
        # idx points into [root, third, fifth]; clamp for non-triads.
        pitch = pitches[idx % len(pitches)]
        note_start = (start_beat + k * step_beats) * spb
        note_end = note_start + step_beats * spb
        inst.notes.append(
            pretty_midi.Note(
                velocity=velocity, pitch=pitch, start=note_start, end=note_end
            )
        )
