"""Full accompaniment generation pipeline (Phase 18 — the MVP engine).

Chains every stage:

    JSON -> Melody -> Key -> Segments -> Chord candidates -> Scoring ->
    Progression optimization -> Voice leading -> Style pattern -> MIDI -> WAV
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Optional

from accompanist.models.chord import Chord
from accompanist.models.melody import Melody
from accompanist.music.key_detection import detect_key_from_notes
from accompanist.music.progression import generate_progression
from accompanist.music.accompaniment import render_accompaniment
from accompanist.music.styles import STYLES

DEFAULT_BEATS_PER_BAR = 4.0


@dataclass
class AccompanimentResult:
    """The output of a generation run."""

    key: str
    mode: str
    melody_notes: list[dict]
    progression: list[Chord]
    midi_path: str
    wav_path: Optional[str] = None
    warnings: list[str] = field(default_factory=list)

    @property
    def progression_symbols(self) -> list[str]:
        return [c.symbol for c in self.progression]


def _melody_from_input(data) -> Melody:
    """Accept a JSON string, a dict, or a Melody and return a Melody."""
    if isinstance(data, Melody):
        return data
    if isinstance(data, str):
        data = json.loads(data)
    if isinstance(data, dict):
        return Melody.from_dict(data)
    raise TypeError(f"Unsupported melody input type: {type(data).__name__}")


def _melody_to_note_dicts(melody: Melody) -> list[dict]:
    """Convert a Melody's notes into pitch/start/duration dicts (in beats).

    The Melody stores time in the same units it was given (Kingsley's JSON uses
    beats), and `hz` actually holds MIDI pitch numbers throughout this project.
    """
    return [
        {"pitch": int(round(n.hz)), "start": float(n.start),
         "duration": float(n.duration)}
        for n in melody.notes
    ]


def generate_accompaniment(
    melody_input,
    midi_path: str = "accompaniment.mid",
    *,
    style: str = "classical",
    key: Optional[str] = None,
    mode: Optional[str] = None,
    tempo: Optional[float] = None,
    beats_per_bar: float = DEFAULT_BEATS_PER_BAR,
    include_melody: bool = True,
    render_wav: bool = False,
    wav_path: Optional[str] = None,
) -> AccompanimentResult:
    """Generate an accompaniment for a melody, end to end.

    Args:
        melody_input: A JSON string, a melody dict (Kingsley's format), or a
            Melody object.
        midi_path: Where to write the accompaniment MIDI.
        style: Accompaniment style ("piano", "pop", "cinematic", "classical").
        key: Override the detected key tonic (e.g. "C"). Auto-detected if None.
        mode: Override the detected mode ("major"/"minor"). Auto if None.
        tempo: Override tempo (BPM). Falls back to the melody's tempo.
        beats_per_bar: Bar length in beats.
        include_melody: Also write the melody on its own track.
        render_wav: If True, also render a WAV via FluidSynth.
        wav_path: WAV output path (defaults to midi_path with .wav).

    Returns:
        An AccompanimentResult describing what was produced.
    """
    warnings: list[str] = []

    if style not in STYLES:
        raise ValueError(
            f"Unknown style '{style}'. Choose from: {sorted(STYLES)}"
        )

    # 1. JSON -> Melody
    melody = _melody_from_input(melody_input)
    melody_notes = _melody_to_note_dicts(melody)
    if not melody_notes:
        raise ValueError("Melody has no notes.")

    # 2. Key detection (respect overrides / melody metadata; else auto-detect).
    resolved_key = key
    resolved_mode = mode
    if resolved_key is None or resolved_mode is None:
        detected = detect_key_from_notes(melody_notes)
        resolved_key = resolved_key or detected.tonic.name.replace("-", "b")
        resolved_mode = resolved_mode or detected.mode

    resolved_tempo = tempo or float(melody.tempo)

    # 3-7. Segments -> candidates -> scoring -> progression optimization.
    #      (voice leading is applied inside render for the classical style)
    progression = generate_progression(
        melody_notes,
        key=resolved_key,
        mode=resolved_mode,
        beats_per_bar=beats_per_bar,
    )

    # 8-9. Style pattern -> MIDI
    render_accompaniment(
        progression,
        midi_path,
        style=style,
        tempo=resolved_tempo,
        beats_per_bar=beats_per_bar,
        melody_notes=melody_notes if include_melody else None,
    )

    # 10. MIDI -> WAV (optional; requires FluidSynth + soundfont)
    out_wav = None
    if render_wav:
        out_wav = wav_path or (midi_path.rsplit(".", 1)[0] + ".wav")
        try:
            from accompanist.audio.render import render_midi

            render_midi(midi_path, out_wav)
        except Exception as exc:  # FluidSynth/soundfont not available
            warnings.append(f"WAV rendering skipped: {exc}")
            out_wav = None

    return AccompanimentResult(
        key=resolved_key,
        mode=resolved_mode,
        melody_notes=melody_notes,
        progression=progression,
        midi_path=midi_path,
        wav_path=out_wav,
        warnings=warnings,
    )
