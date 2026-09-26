"""Tests for the melody models."""

import json

from accompanist.models.melody import Melody, Note

TEST_JSON = """
{
  "melody": [
    {"hz": 60, "start": 0, "duration": 0.5},
    {"hz": 64, "start": 0.5, "duration": 0.5},
    {"hz": 67, "start": 1, "duration": 1}
  ],
  "key": "C",
  "mode": "major",
  "tempo": 100
}
"""


def test_melody_from_kingsley_json():
    data = json.loads(TEST_JSON)
    melody = Melody.from_dict(data)

    # Structure
    assert len(melody.notes) == 3
    assert all(isinstance(n, Note) for n in melody.notes)

    # Musical context
    assert melody.key == "C"
    assert melody.mode == "major"
    assert melody.tempo == 100

    # Notes parsed correctly
    assert melody.notes[0] == Note(hz=60, start=0, duration=0.5)
    assert melody.notes[1] == Note(hz=64, start=0.5, duration=0.5)
    assert melody.notes[2] == Note(hz=67, start=1, duration=1)
