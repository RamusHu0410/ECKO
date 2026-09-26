"""Transcription backend: WAV -> raw monophonic note events.

This module isolates the transcription model behind a small, stable interface
so the model can be swapped later (e.g. for Spotify's Basic Pitch) without
touching the post-processing code in :mod:`processor`.

Design note
-----------
The original plan called for ``basic-pitch`` from Spotify. On this machine
(CPython 3.14) Basic Pitch is not installable: its ``tensorflow-macos``
dependency ships no ``cp314`` wheels. Because the task is explicitly
*monophonic*, we use librosa's pYIN pitch tracker instead. pYIN is a
well-established, reliable monophonic F0 estimator and is a better fit for a
single-voice signal than a polyphonic ML model.

The public surface here is deliberately tiny:

    transcribe(audio_path) -> list[RawNoteEvent]

Each event carries a start time, end time, MIDI pitch, and a confidence in
``[0, 1]``. Confidence is retained (rather than discarded) so the processor can
resolve overlaps by reliability and so future callers can expose it.
"""

from __future__ import annotations

from dataclasses import dataclass

import librosa
import numpy as np

# --- Tunables -------------------------------------------------------------
# pYIN search range. C1 (~32.7 Hz) to C7 (~2093 Hz) comfortably covers voice
# and most melodic instruments while keeping the search space sane.
_FMIN_HZ = librosa.note_to_hz("C1")
_FMAX_HZ = librosa.note_to_hz("C7")

# Analysis resolution. hop_length / sr sets the time grid; ~11.6 ms at 22050 Hz.
_FRAME_LENGTH = 2048
_HOP_LENGTH = 256

# A frame counts as "sounding" only if pYIN marks it voiced AND the voiced
# probability clears this floor. Filters out breath/background noise frames.
_VOICED_PROB_FLOOR = 0.5

# Segmentation: start a new note when the pitch jumps by more than this many
# semitones between consecutive voiced frames.
_SEMITONE_SPLIT = 0.75


@dataclass
class RawNoteEvent:
    """A single detected note before any cleaning.

    Attributes:
        start: Onset time in seconds.
        end: Offset time in seconds.
        midi: MIDI pitch number (may be fractional; the processor rounds it).
        confidence: Mean detection confidence in ``[0, 1]``.
    """

    start: float
    end: float
    midi: float
    confidence: float

    @property
    def duration(self) -> float:
        return self.end - self.start


def transcribe(audio_path: str) -> list[RawNoteEvent]:
    """Run monophonic transcription on a WAV file.

    Args:
        audio_path: Path to a ``.wav`` file containing a single voice.

    Returns:
        Raw note events in chronological order. May be empty for silence.
    """
    # Mono load; librosa resamples to its default sr and averages channels.
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    if y.size == 0:
        return []

    f0, voiced_flag, voiced_prob = librosa.pyin(
        y,
        fmin=float(_FMIN_HZ),
        fmax=float(_FMAX_HZ),
        sr=sr,
        frame_length=_FRAME_LENGTH,
        hop_length=_HOP_LENGTH,
    )

    times = librosa.times_like(f0, sr=sr, hop_length=_HOP_LENGTH)
    frame_dt = _HOP_LENGTH / sr

    # A frame is usable only if voiced, above the probability floor, and has a
    # finite pitch estimate.
    usable = (
        voiced_flag
        & (voiced_prob >= _VOICED_PROB_FLOOR)
        & np.isfinite(f0)
    )

    midi = np.full(f0.shape, np.nan, dtype=float)
    finite = np.isfinite(f0)
    midi[finite] = librosa.hz_to_midi(f0[finite])

    return _segment_frames(midi, voiced_prob, usable, times, frame_dt)


def _segment_frames(
    midi: np.ndarray,
    voiced_prob: np.ndarray,
    usable: np.ndarray,
    times: np.ndarray,
    frame_dt: float,
) -> list[RawNoteEvent]:
    """Group consecutive usable frames of stable pitch into note events.

    A note runs while frames stay usable and the pitch stays within
    ``_SEMITONE_SPLIT`` of the note's running mean. Any gap of unusable frames
    (silence/noise) ends the current note.
    """
    events: list[RawNoteEvent] = []

    seg_start_idx: int | None = None
    seg_midis: list[float] = []
    seg_probs: list[float] = []

    def flush(end_idx: int) -> None:
        if seg_start_idx is None or not seg_midis:
            return
        start_t = float(times[seg_start_idx])
        # End at the trailing edge of the last frame in the segment.
        end_t = float(times[end_idx]) + frame_dt
        events.append(
            RawNoteEvent(
                start=start_t,
                end=end_t,
                midi=float(np.median(seg_midis)),
                confidence=float(np.mean(seg_probs)),
            )
        )

    last_idx = 0
    for i in range(len(midi)):
        if not usable[i]:
            flush(last_idx)
            seg_start_idx = None
            seg_midis = []
            seg_probs = []
            continue

        if seg_start_idx is None:
            seg_start_idx = i
            seg_midis = [midi[i]]
            seg_probs = [voiced_prob[i]]
        else:
            running_mean = float(np.mean(seg_midis))
            if abs(midi[i] - running_mean) > _SEMITONE_SPLIT:
                # Pitch changed: close the old note, open a new one.
                flush(last_idx)
                seg_start_idx = i
                seg_midis = [midi[i]]
                seg_probs = [voiced_prob[i]]
            else:
                seg_midis.append(midi[i])
                seg_probs.append(voiced_prob[i])
        last_idx = i

    flush(last_idx)
    return events
