"""Melody data models."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Note:
    """A single note.

    Attributes:
        hz: Frequency of the note in hertz.
        start: Start time of the note in seconds (or beats).
        duration: Length of the note in seconds (or beats).
    """

    hz: float
    start: float
    duration: float

    def __repr__(self) -> str:
        return f"hz={self.hz} start={self.start} duration={self.duration}"


@dataclass
class Melody:
    """A melody: an ordered collection of notes with musical context.

    Attributes:
        notes: The notes that make up the melody.
        key: The tonal key (e.g. "C", "A#").
        mode: The mode (e.g. "major", "minor").
        tempo: Tempo in beats per minute.
    """

    notes: list[Note] = field(default_factory=list)
    key: str = "C"
    mode: str = "major"
    tempo: float = 120.0

    @classmethod
    def from_dict(cls, data: dict) -> "Melody":
        """Build a Melody from a JSON-style dict.

        Expects a "melody" list of note dicts (hz/start/duration) plus
        optional "key", "mode", and "tempo" fields.
        """
        notes = [
            Note(hz=n["hz"], start=n["start"], duration=n["duration"])
            for n in data.get("melody", [])
        ]
        return cls(
            notes=notes,
            key=data.get("key", "C"),
            mode=data.get("mode", "major"),
            tempo=data.get("tempo", 120.0),
        )
