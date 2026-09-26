"""Post-processing: raw note events -> clean, JSON-ready melody dict.

Pipeline (in order):

    raw events
      -> drop too-short detections
      -> sort by start time
      -> resolve overlaps (monophonic: one note at a time)
      -> MIDI -> Hz
      -> build JSON-compatible dicts (timing preserved, NOT shifted to 0)

Transcription lives in :mod:`transcriber`; this module knows nothing about the
model, only about ``RawNoteEvent``-shaped data. That keeps the model swappable.
"""

from __future__ import annotations

from dataclasses import dataclass

from .transcriber import RawNoteEvent

# --- Tunables -------------------------------------------------------------
# Detections shorter than this are treated as noise/artifacts and discarded.
MIN_NOTE_DURATION_S = 0.05  # 50 ms

# Hz values are rounded to this many decimal places in the output.
HZ_DECIMALS = 2


@dataclass
class ProcessorConfig:
    """Knobs for post-processing, grouped so callers can override cleanly."""

    min_note_duration_s: float = MIN_NOTE_DURATION_S
    hz_decimals: int = HZ_DECIMALS


def midi_to_hz(midi_note: float) -> float:
    """Convert a MIDI pitch to frequency in Hz.

    Uses the standard equal-temperament formula with A4 (MIDI 69) = 440 Hz::

        hz = 440 * 2 ** ((midi_note - 69) / 12)
    """
    return 440.0 * 2.0 ** ((midi_note - 69) / 12.0)


def process_events(
    events: list[RawNoteEvent],
    config: ProcessorConfig | None = None,
) -> list[dict]:
    """Clean raw note events into an ordered list of melody-note dicts.

    Args:
        events: Raw detections from the transcriber.
        config: Optional overrides for thresholds.

    Returns:
        A list of ``{"hz", "start", "duration"}`` dicts, chronological,
        non-overlapping, with original recording timing preserved.
    """
    cfg = config or ProcessorConfig()

    # 1. Drop extremely short detections (noise / transcription artifacts).
    kept = [e for e in events if e.duration >= cfg.min_note_duration_s]

    # 2. Sort chronologically. Tie-break by longer, then more confident.
    kept.sort(key=lambda e: (e.start, -e.duration, -e.confidence))

    # 3. Resolve overlaps: the system is monophonic, so no two notes may sound
    #    at once. When events overlap, keep the more reliable one.
    kept = _resolve_overlaps(kept)

    # 4. Convert to output dicts (MIDI -> Hz, timing preserved).
    melody: list[dict] = []
    for e in kept:
        melody.append(
            {
                "hz": round(midi_to_hz(round(e.midi)), cfg.hz_decimals),
                "start": round(e.start, 4),
                "duration": round(e.duration, 4),
            }
        )
    return melody


def _resolve_overlaps(events: list[RawNoteEvent]) -> list[RawNoteEvent]:
    """Enforce one-note-at-a-time on start-sorted events.

    Strategy: sweep left to right keeping a "current" accepted note. If the
    next note starts before the current one ends, they overlap. Keep whichever
    is more reliable (higher confidence, then longer); if the incoming note is
    the survivor, its start is clamped so it begins where the previous note
    ends, avoiding a time gap being turned into an overlap.
    """
    if not events:
        return []

    result: list[RawNoteEvent] = [events[0]]
    for nxt in events[1:]:
        cur = result[-1]
        if nxt.start < cur.end:  # overlap
            cur_score = (cur.confidence, cur.duration)
            nxt_score = (nxt.confidence, nxt.duration)
            if nxt_score > cur_score:
                # Incoming note wins; drop the current, but clamp so it doesn't
                # overlap whatever came before it.
                result.pop()
                if result and nxt.start < result[-1].end:
                    nxt = RawNoteEvent(
                        start=result[-1].end,
                        end=max(nxt.end, result[-1].end),
                        midi=nxt.midi,
                        confidence=nxt.confidence,
                    )
                result.append(nxt)
            else:
                # Current note wins; trim the incoming note to start at the
                # current note's end. Keep it only if still long enough.
                trimmed_start = cur.end
                if nxt.end - trimmed_start > 0:
                    result.append(
                        RawNoteEvent(
                            start=trimmed_start,
                            end=nxt.end,
                            midi=nxt.midi,
                            confidence=nxt.confidence,
                        )
                    )
        else:
            result.append(nxt)
    return result
