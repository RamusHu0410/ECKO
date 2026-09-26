"""Regression tests for the Flask application routes."""

from io import BytesIO

import numpy as np

from app.routes import main as main_routes


def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "healthy"}


def test_index_endpoint(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_upload_rejects_non_wav_files(client):
    response = client.post(
        "/upload",
        data={"file": (BytesIO(b"not audio"), "recording.mp3")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid file type. Only .wav files are allowed."


def test_upload_serializes_numpy_boolean_analysis(client, monkeypatch):
    """Regression test for NumPy bool values causing upload responses to 500."""

    class FakeProcessor:
        def __init__(self, **_kwargs):
            pass

        def process_audio(self, _filepath):
            return {
                "pitch": {"voiced_flag": [np.bool_(True), np.bool_(False)]},
                "segments": [],
                "non_finite": np.float64("nan"),
            }

    monkeypatch.setattr(main_routes, "AudioProcessor", FakeProcessor)

    response = client.post(
        "/upload",
        data={"file": (BytesIO(b"RIFFfakeWAVE"), "recording.wav")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 201
    analysis = response.get_json()["audio_analysis"]
    assert analysis["pitch"]["voiced_flag"] == [True, False]
    assert analysis["non_finite"] is None


def test_upload_returns_melody_for_the_accompanist(client, monkeypatch):
    """The notes extracted from a hum must be ready to hand straight to
    POST /accompaniment/generate (hz/start/duration), so the frontend can
    chain upload -> adjust -> generate without re-deriving anything."""

    class FakeProcessor:
        def __init__(self, **_kwargs):
            pass

        def process_audio(self, _filepath):
            return {
                "segments": [{"start": 0.0, "end": 1.0, "duration": 1.0}],
                "pitch": {
                    "times": [0.0, 0.5, 1.0],
                    "frequencies": [440.0, 440.0, 440.0],
                    "voiced_flag": [True, True, True],
                },
            }

    monkeypatch.setattr(main_routes, "AudioProcessor", FakeProcessor)

    upload = client.post(
        "/upload",
        data={"file": (BytesIO(b"RIFFfakeWAVE"), "recording.wav")},
        content_type="multipart/form-data",
    )
    assert upload.status_code == 201
    melody = upload.get_json()["melody"]
    assert melody and all({"hz", "start", "duration"} <= note.keys() for note in melody)

    generated = client.post(
        "/accompaniment/generate",
        json={"melody": melody, "style": "classical", "format": "json"},
    )
    assert generated.status_code == 200
    assert generated.get_json()["status"] == "success"


def test_accompaniment_rejects_missing_melody(client):
    response = client.post("/accompaniment/generate", json={})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Request must be JSON with a 'melody' array."
