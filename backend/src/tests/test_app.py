"""Regression tests for the Flask application routes."""

import os
from io import BytesIO

import pytest
from talk_fakes import TUNE, write_hum



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


def _upload(client, data=b"RIFFfakeWAVE", name="recording.wav"):
    return client.post("/upload", data={"file": (BytesIO(data), name)}, content_type="multipart/form-data")


def test_upload_hands_the_accompanist_beats_from_intake(client, monkeypatch, tmp_path_factory):
    """/upload's melody comes from the pipeline's intake (app/audio/intake) and goes straight to
    /accompaniment/generate, which counts beats (MIDI note in "hz"). Here intake is the fixture
    melody: 8 bars of D minor at 92 BPM, starting D4 for a dotted quarter."""
    from app.audio import pipeline

    monkeypatch.setitem(pipeline.INTAKES, "intake", pipeline._fixture_transcribe)
    hum = tmp_path_factory.mktemp("hums") / "hum.wav"
    write_hum(hum)  # a real WAV, so it passes the upload's checks
    response = _upload(client, hum.read_bytes())
    assert response.status_code == 201
    reply = response.get_json()
    assert reply["tempo"] == 92.0 and (reply["key"], reply["mode"]) == ("D", "minor")
    assert reply["melody"][:2] == [{"hz": 62.0, "start": 0.0, "duration": 1.5}, {"hz": 64.0, "start": 1.5, "duration": 0.5}]
    assert reply["run_id"]


def test_a_real_hum_goes_from_upload_to_accompaniment(client, tmp_path_factory):
    """End to end with a real WAV: upload finds the tune, and its melody is accepted by the engine."""
    hum = tmp_path_factory.mktemp("hums") / "hum.wav"
    write_hum(hum)

    upload = _upload(client, hum.read_bytes())
    assert upload.status_code == 201
    reply = upload.get_json()
    assert [round(n["hz"]) for n in reply["melody"]] == [midi for midi, _ in TUNE]
    assert reply["key"] == "C" and reply["mode"] == "major"

    generated = client.post(
        "/accompaniment/generate",
        json={"melody": reply["melody"], "tempo": reply["tempo"], "style": "classical", "format": "json"},
    )
    assert generated.status_code == 200
    assert generated.get_json()["status"] == "success"


def test_uploads_never_overwrite_each_other(client, tmp_path_factory):
    """The browser names every hum recording.wav; two users must not share one file."""
    hum = tmp_path_factory.mktemp("hums") / "hum.wav"
    write_hum(hum)
    first, second = (_upload(client, hum.read_bytes()).get_json()["filename"] for _ in range(2))
    assert first != second
    assert first.startswith("recording-") and first.endswith(".wav")


@pytest.mark.parametrize(
    ("data", "said"),
    [(b"", "isn't a readable WAV"), (b"RIFF1234WAVEjunkjunk", "isn't a readable WAV"), ("short", "too short")],
)
def test_unusable_recordings_are_rejected_with_a_reason(client, app, tmp_path_factory, data, said):
    if data == "short":
        short = tmp_path_factory.mktemp("hums") / "short.wav"
        write_hum(short, tune=[(60, 0.05)])
        data = short.read_bytes()
    response = _upload(client, data)
    assert response.status_code == 400
    assert said in response.get_json()["error"]
    assert not os.listdir(app.config["UPLOAD_FOLDER"])  # nothing unusable is kept


def test_accompaniment_rejects_missing_melody(client):
    response = client.post("/accompaniment/generate", json={})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Request must be JSON with a 'melody' array."


@pytest.mark.parametrize(
    "melody",
    [[{"hz": 60, "start": 0}], [{"hz": "C4", "start": 0, "duration": 1}], [{"hz": 60, "start": 0, "duration": -1}], [{"hz": 300, "start": 0, "duration": 1}], "notes"],
)
def test_accompaniment_rejects_a_malformed_melody_with_400(client, melody):
    response = client.post("/accompaniment/generate", json={"melody": melody, "format": "json"})
    assert response.status_code == 400
    assert "melody" in response.get_json()["error"]
