"""Tests for the audio_to_notes module.

Two layers:

1. Pure-function tests on the processor (deterministic, no audio model): these
   pin down filtering of short notes, sorting, overlap resolution, MIDI->Hz,
   timing preservation, and the exact output schema.

2. End-to-end tests on synthesized WAVs (sine tones): these confirm the real
   librosa-backed pipeline detects pitch, order, timing, and silence correctly.

Timing/frequency checks use tolerances, never exact float equality.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from audio_to_notes import audio_to_notes, midi_to_hz, process_events
from audio_to_notes.processor import ProcessorConfig
from audio_to_notes.transcriber import RawNoteEvent

SR = 22050


# --------------------------------------------------------------------------
# Audio synthesis helpers
# --------------------------------------------------------------------------
def _midi_to_hz(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def _tone(freq: float, dur: float, sr: int = SR, amp: float = 0.5) -> np.ndarray:
    """A sine tone with short raised-cosine fades to avoid click artifacts."""
    n = int(round(dur * sr))
    t = np.arange(n) / sr
    wave = amp * np.sin(2 * np.pi * freq * t)
    fade = min(int(0.01 * sr), n // 2)
    if fade > 0:
        ramp = 0.5 * (1 - np.cos(np.linspace(0, math.pi, fade)))
        wave[:fade] *= ramp
        wave[-fade:] *= ramp[::-1]
    return wave.astype(np.float32)


def _silence(dur: float, sr: int = SR) -> np.ndarray:
    return np.zeros(int(round(dur * sr)), dtype=np.float32)


def _write(path: Path, segments: list[np.ndarray], sr: int = SR) -> str:
    sf.write(str(path), np.concatenate(segments), sr)
    return str(path)


# C4 = MIDI 60, E4 = 64, G4 = 67
C4, E4, G4 = 60, 64, 67


# --------------------------------------------------------------------------
# Processor unit tests (deterministic; verification points 6, 7, 8, plus MIDI->Hz)
# --------------------------------------------------------------------------
def test_midi_to_hz_reference_values():
    assert midi_to_hz(69) == pytest.approx(440.0, abs=0.01)
    assert midi_to_hz(60) == pytest.approx(261.63, abs=0.01)
    assert midi_to_hz(61) == pytest.approx(277.18, abs=0.01)
    assert midi_to_hz(64) == pytest.approx(329.63, abs=0.01)


def test_short_detections_removed():
    events = [
        RawNoteEvent(start=0.0, end=0.02, midi=60, confidence=0.9),  # 20 ms -> drop
        RawNoteEvent(start=0.5, end=1.0, midi=64, confidence=0.9),  # 500 ms -> keep
    ]
    melody = process_events(events)
    assert len(melody) == 1
    assert melody[0]["hz"] == pytest.approx(_midi_to_hz(64), abs=0.5)


def test_events_sorted_by_start():
    events = [
        RawNoteEvent(start=1.0, end=1.5, midi=67, confidence=0.9),
        RawNoteEvent(start=0.0, end=0.5, midi=60, confidence=0.9),
        RawNoteEvent(start=0.5, end=1.0, midi=64, confidence=0.9),
    ]
    melody = process_events(events)
    starts = [n["start"] for n in melody]
    assert starts == sorted(starts)
    assert [n["hz"] for n in melody] == [
        pytest.approx(_midi_to_hz(m), abs=0.5) for m in (60, 64, 67)
    ]


def test_overlaps_resolved_no_simultaneous_notes():
    # Two overlapping notes; the higher-confidence one should win the overlap.
    events = [
        RawNoteEvent(start=0.0, end=0.8, midi=60, confidence=0.6),
        RawNoteEvent(start=0.4, end=1.2, midi=64, confidence=0.95),
    ]
    melody = process_events(events)
    # No note may start before the previous one ends.
    for a, b in zip(melody, melody[1:]):
        assert b["start"] >= a["start"] + a["duration"] - 1e-6


def test_timing_preserved_not_shifted_to_zero():
    events = [RawNoteEvent(start=1.0, end=1.5, midi=60, confidence=0.9)]
    melody = process_events(events)
    assert melody[0]["start"] == pytest.approx(1.0, abs=1e-6)
    assert melody[0]["duration"] == pytest.approx(0.5, abs=1e-6)


def test_output_schema_and_json_serializable():
    events = [RawNoteEvent(start=0.0, end=0.5, midi=60, confidence=0.9)]
    melody = process_events(events)
    note = melody[0]
    assert set(note.keys()) == {"hz", "start", "duration"}
    assert all(isinstance(note[k], float) for k in note)
    # Whole dict must serialize cleanly.
    result = {"melody": melody, "tempo": 100}
    json.dumps(result)


def test_configurable_min_duration():
    events = [RawNoteEvent(start=0.0, end=0.08, midi=60, confidence=0.9)]  # 80 ms
    assert len(process_events(events)) == 1  # default 50 ms -> kept
    strict = ProcessorConfig(min_note_duration_s=0.1)  # 100 ms -> dropped
    assert len(process_events(events, strict)) == 0


# --------------------------------------------------------------------------
# End-to-end tests on synthesized audio
# --------------------------------------------------------------------------
def test_ascending_melody_order_and_pitch(tmp_path):
    """C4 -> E4 -> G4, each 0.5s, no gaps."""
    path = _write(
        tmp_path / "ceg.wav",
        [
            _tone(_midi_to_hz(C4), 0.5),
            _tone(_midi_to_hz(E4), 0.5),
            _tone(_midi_to_hz(G4), 0.5),
        ],
    )
    result = audio_to_notes(path)
    melody = result["melody"]
    assert len(melody) == 3, melody

    expected = [_midi_to_hz(C4), _midi_to_hz(E4), _midi_to_hz(G4)]
    for note, exp_hz in zip(melody, expected):
        # Within a quarter tone (~3%) is plenty to confirm the right pitch class.
        assert note["hz"] == pytest.approx(exp_hz, rel=0.03), (note, exp_hz)

    # Strictly ascending frequencies == correct order.
    freqs = [n["hz"] for n in melody]
    assert freqs == sorted(freqs)


def test_varied_durations(tmp_path):
    """C4 (0.5s) -> E4 (0.5s) -> G4 (1.0s)."""
    path = _write(
        tmp_path / "durations.wav",
        [
            _tone(_midi_to_hz(C4), 0.5),
            _tone(_midi_to_hz(E4), 0.5),
            _tone(_midi_to_hz(G4), 1.0),
        ],
    )
    melody = audio_to_notes(path)["melody"]
    assert len(melody) == 3, melody
    durations = [n["duration"] for n in melody]
    assert durations[0] == pytest.approx(0.5, abs=0.12)
    assert durations[1] == pytest.approx(0.5, abs=0.12)
    assert durations[2] == pytest.approx(1.0, abs=0.15)
    # The last note is clearly the longest.
    assert durations[2] > durations[0] + 0.2


def test_leading_silence_preserved(tmp_path):
    """1s of silence then C4 (0.5s): first note starts near 1.0, not 0."""
    path = _write(
        tmp_path / "silence.wav",
        [_silence(1.0), _tone(_midi_to_hz(C4), 0.5)],
    )
    melody = audio_to_notes(path)["melody"]
    assert len(melody) >= 1, melody
    assert melody[0]["start"] == pytest.approx(1.0, abs=0.15)


def test_silence_between_notes_not_a_note(tmp_path):
    """C4, gap, E4: exactly two notes, gap doesn't become one."""
    path = _write(
        tmp_path / "gap.wav",
        [
            _tone(_midi_to_hz(C4), 0.5),
            _silence(0.4),
            _tone(_midi_to_hz(E4), 0.5),
        ],
    )
    melody = audio_to_notes(path)["melody"]
    assert len(melody) == 2, melody
    # Gap is real: second note starts well after the first ends.
    first_end = melody[0]["start"] + melody[0]["duration"]
    assert melody[1]["start"] > first_end + 0.2


def test_pure_silence_produces_no_notes(tmp_path):
    path = _write(tmp_path / "empty.wav", [_silence(1.5)])
    result = audio_to_notes(path)
    assert result["melody"] == []
    assert result["tempo"] is None  # too few notes -> not invented


def test_low_amplitude_noise_does_not_create_notes(tmp_path):
    """Quiet white noise only: should yield no confident notes."""
    rng = np.random.default_rng(0)
    noise = (0.01 * rng.standard_normal(int(1.5 * SR))).astype(np.float32)
    path = _write(tmp_path / "noise.wav", [noise])
    melody = audio_to_notes(path)["melody"]
    assert melody == [], melody


def test_no_simultaneous_notes_end_to_end(tmp_path):
    path = _write(
        tmp_path / "chain.wav",
        [
            _tone(_midi_to_hz(C4), 0.5),
            _tone(_midi_to_hz(E4), 0.5),
            _tone(_midi_to_hz(G4), 0.5),
        ],
    )
    melody = audio_to_notes(path)["melody"]
    for a, b in zip(melody, melody[1:]):
        assert b["start"] >= a["start"] + a["duration"] - 1e-6, (a, b)


def test_full_result_schema_and_serializable(tmp_path):
    path = _write(
        tmp_path / "schema.wav",
        [
            _tone(_midi_to_hz(C4), 0.5),
            _tone(_midi_to_hz(E4), 0.5),
            _tone(_midi_to_hz(G4), 0.5),
        ],
    )
    result = audio_to_notes(path)
    assert set(result.keys()) == {"melody", "tempo"}
    assert isinstance(result["melody"], list)
    assert result["tempo"] is None or isinstance(result["tempo"], (int, float))
    for note in result["melody"]:
        assert set(note.keys()) == {"hz", "start", "duration"}
    # Round-trips through JSON unchanged.
    assert json.loads(json.dumps(result)) == result


def test_tempo_is_int_or_none(tmp_path):
    """Tempo is either a sensible number or None, never garbage."""
    segments = []
    for _ in range(8):
        segments.append(_tone(_midi_to_hz(C4), 0.5))
        segments.append(_silence(0.05))
    path = _write(tmp_path / "tempo.wav", segments)
    tempo = audio_to_notes(path)["tempo"]
    assert tempo is None or (isinstance(tempo, (int, float)) and tempo > 0)
