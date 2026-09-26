"""Tests for the debug audio->data conversion (no composition)."""

from accompanist.generate import debug_convert


def _twinkle():
    seq = [(60, 1), (60, 1), (67, 1), (67, 1), (69, 1), (69, 1), (67, 2)]
    notes = []
    t = 0.0
    for p, d in seq:
        notes.append({"hz": p, "start": t, "duration": d})
        t += d
    return {"melody": notes, "key": "C", "mode": "major", "tempo": 110}


def test_debug_reports_parsed_notes():
    report = debug_convert(_twinkle())
    assert report["ok"] is True
    assert report["note_count"] == 7
    assert len(report["parsed_notes"]) == 7
    # Timing and pitch preserved from input.
    assert report["parsed_notes"][0] == {"pitch": 60, "start": 0.0, "duration": 1.0}
    assert report["pitch_range"] == {"min": 60, "max": 69}
    assert report["time_span_beats"] == 8.0


def test_debug_reports_declared_and_detected_key():
    report = debug_convert(_twinkle())
    assert report["declared_key"] == "C"
    assert report["declared_mode"] == "major"
    # Detection runs but may differ from declared (that's the point of debug).
    assert "detected_key" in report
    assert "detected_mode" in report


def test_debug_segments_into_bars():
    report = debug_convert(_twinkle())
    assert report["num_bars"] == 2
    # Bar 1 holds the first 4 beats; pitch classes present are C(0) and G(7).
    assert report["bars"][0]["pitch_classes"] == [0, 7]


def test_debug_empty_melody_reports_not_ok():
    report = debug_convert({"melody": []})
    assert report["ok"] is False
    assert "error" in report


def test_debug_does_not_modify_input():
    data = _twinkle()
    before = [dict(n) for n in data["melody"]]
    debug_convert(data)
    assert data["melody"] == before  # input untouched
