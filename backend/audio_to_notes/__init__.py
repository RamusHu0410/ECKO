"""audio_to_notes: WAV -> monophonic note JSON.

Public API::

    from audio_to_notes import audio_to_notes
    result = audio_to_notes("recording.wav")
    # {"melody": [{"hz": 261.63, "start": 0.0, "duration": 0.5}, ...],
    #  "tempo": 100}

The result is directly serializable with ``json.dumps``.

Internally the work is split into two replaceable stages:

* :mod:`audio_to_notes.transcriber` - WAV -> raw note events (the model).
* :mod:`audio_to_notes.processor`   - raw events -> clean melody dicts.

This keeps the transcription model isolated so it can be swapped later
(e.g. for Spotify's Basic Pitch) without changing post-processing.
"""

from __future__ import annotations

import librosa
import numpy as np

from .processor import ProcessorConfig, midi_to_hz, process_events
from .transcriber import RawNoteEvent, transcribe

__all__ = [
    "audio_to_notes",
    "estimate_tempo",
    "midi_to_hz",
    "process_events",
    "transcribe",
    "RawNoteEvent",
    "ProcessorConfig",
]

# Below this many detected notes, beat tracking has too little to lock onto and
# is treated as unreliable -> tempo is reported as null rather than invented.
_MIN_NOTES_FOR_TEMPO = 4


def estimate_tempo(audio_path: str, num_notes: int) -> float | None:
    """Estimate tempo (BPM) from the audio, or ``None`` if unreliable.

    Tempo is secondary to note detection. We only report a value when beat
    tracking succeeds and there is enough note content to trust it; otherwise
    we return ``None`` rather than inventing a number.

    Args:
        audio_path: Path to the WAV file.
        num_notes: Number of notes detected, used as a reliability gate.

    Returns:
        Tempo in BPM rounded to the nearest integer, or ``None``.
    """
    if num_notes < _MIN_NOTES_FOR_TEMPO:
        return None

    try:
        y, sr = librosa.load(audio_path, sr=None, mono=True)
        if y.size == 0:
            return None
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    except Exception:
        return None

    tempo_val = float(np.atleast_1d(tempo)[0])
    if not np.isfinite(tempo_val) or tempo_val <= 0:
        return None
    return round(tempo_val)


def audio_to_notes(audio_path: str) -> dict:
    """Convert a monophonic WAV recording into a note JSON dict.

    Args:
        audio_path: Path to a ``.wav`` file with a single voice/instrument.

    Returns:
        ``{"melody": [{"hz", "start", "duration"}, ...], "tempo": int | None}``
        with original recording timing preserved. JSON-serializable.
    """
    raw_events = transcribe(audio_path)
    melody = process_events(raw_events)
    tempo = estimate_tempo(audio_path, num_notes=len(melody))
    return {"melody": melody, "tempo": tempo}
