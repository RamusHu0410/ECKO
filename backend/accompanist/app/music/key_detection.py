"""Detect the musical key of a MIDI file using music21."""

from __future__ import annotations

from pathlib import Path

from music21 import key as m21key

from app.music.midi_reader import read_midi


def detect_key(midi_path: str) -> m21key.Key:
    """Detect the key of a MIDI file.

    Uses music21's Krumhansl-Schmuckler key-finding algorithm over the whole
    score.

    Args:
        midi_path: Path to a .mid file.

    Returns:
        A music21 Key object (e.g. str(result) == "C major" or "A minor").

    Raises:
        FileNotFoundError: if the MIDI file does not exist.
    """
    if not Path(midi_path).is_file():
        raise FileNotFoundError(f"MIDI file not found: {midi_path}")

    score = read_midi(midi_path)
    return score.analyze("key")
