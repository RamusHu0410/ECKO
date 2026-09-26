"""Talk mode's routes through Flask's test client, with fake Gemini and ElevenLabs. No network."""

import io
import json
import shutil

import numpy as np
import pytest
import soundfile
from talk_fakes import FakeGemini, fake_services, write_hum

from app.talk.commands import Command


@pytest.fixture
def gemini():
    return FakeGemini()


@pytest.fixture
def talk_client(app, gemini):
    app.extensions["talk"] = fake_services(gemini=gemini)
    return app.test_client()


def send_voice(client, state, audio=b"recording", name="talk.webm"):
    form = {"audio": (io.BytesIO(audio), name), "state": json.dumps(state)}
    return client.post("/talk/voice", data=form, content_type="multipart/form-data")


def test_voice_command_moves_the_settings(talk_client, gemini):
    response = send_voice(talk_client, {"settings": {"emotion": 0.2, "speed": 0.5, "pitch": 0.5}})
    turn = response.get_json()
    assert response.status_code == 200
    assert turn["heard"] == "make it faster"
    assert turn["settings"]["speed"] == 0.7 and turn["settings"]["emotion"] == 0.2
    assert turn["changed"] == ["speed"]
    assert gemini.calls[0][1].emotion == 0.2  # the current settings reached Gemini
    assert turn["speech_id"]


def test_spoken_reply_streams(talk_client):
    turn = send_voice(talk_client, {}).get_json()
    speech = talk_client.get(f"/talk/speech/{turn['speech_id']}")
    assert speech.status_code == 200
    assert speech.mimetype == "audio/mpeg"
    assert speech.data == b"ID3-first-chunk-rest-of-the-mp3"


def test_unknown_speech_id(talk_client):
    assert talk_client.get("/talk/speech/not-a-real-id").status_code == 404


def test_spoken_undo_goes_back_one_version(talk_client, gemini):
    gemini.command = Command(intent="undo", reply="Back it goes.")
    turn = send_voice(talk_client, {"settings": {"speed": 0.9, "style": "rock"}, "previous": {"speed": 0.5}}).get_json()
    assert turn["intent"] == "undo"
    assert turn["settings"] == {"emotion": 0.5, "speed": 0.5, "pitch": 0.5, "style": None, "extras": []}


def test_bad_voice_requests_get_a_clear_message(talk_client):
    assert talk_client.post("/talk/voice", data={}, content_type="multipart/form-data").status_code == 400
    bad_settings = send_voice(talk_client, {"settings": {"speed": "fast"}})
    assert bad_settings.status_code == 400 and "speed" in bad_settings.get_json()["error"]
    broken_state = talk_client.post(
        "/talk/voice", data={"audio": (io.BytesIO(b"x"), "a.webm"), "state": "{"}, content_type="multipart/form-data"
    )
    assert broken_state.status_code == 400


def test_voice_failure_is_a_503_not_a_crash(app):
    def no_key(_text):
        raise RuntimeError("ELEVENLABS_API_KEY is missing")

    app.extensions["talk"] = fake_services(speak=no_key)
    client = app.test_client()
    turn = send_voice(client, {}).get_json()
    response = client.get(f"/talk/speech/{turn['speech_id']}")
    assert response.status_code == 503 and "voice" in response.get_json()["error"]


def test_notes_of_the_uploaded_hum(app, talk_client):
    write_hum(f"{app.config['UPLOAD_FOLDER']}/recording.wav")
    notes = talk_client.post("/talk/notes", json={"hum": "recording.wav", "settings": {"pitch": 1.0}}).get_json()
    sung = [round(note["midi"]) for note in notes["sung"]]
    assert sung == [60, 62, 64, 60, 64, 65, 67]  # the tune write_hum hums: C D E C E F G
    assert [round(note["midi"]) for note in notes["played"]] == [pitch + 12 for pitch in sung]  # pitch at the top: an octave up
    assert talk_client.post("/talk/notes", json={"hum": "gone.wav"}).status_code == 404


def test_song_needs_a_hum_that_was_uploaded(talk_client):
    assert talk_client.post("/talk/song", json={}).status_code == 400
    assert talk_client.post("/talk/song", json={"hum": "recording.wav"}).status_code == 404
    assert talk_client.post("/talk/song", json={"hum": "../../pyproject.toml"}).status_code == 404  # stays in uploads


@pytest.mark.skipif(shutil.which("fluidsynth") is None, reason="needs FluidSynth to render audio (brew install fluid-synth)")
def test_song_is_made_from_the_uploaded_hum(app, talk_client):
    write_hum(f"{app.config['UPLOAD_FOLDER']}/recording.wav")
    first = talk_client.post("/talk/song", json={"hum": "recording.wav", "settings": {}})
    faster = talk_client.post("/talk/song", json={"hum": "recording.wav", "settings": {"speed": 1.0, "style": "jazz"}})
    for response in (first, faster):
        assert response.status_code == 200, response.get_data(as_text=True)
        assert response.mimetype == "audio/wav" and response.data[:4] == b"RIFF"
    assert len(faster.data) < len(first.data)  # the same tune at a faster tempo is shorter
    samples, _rate = soundfile.read(io.BytesIO(first.data))
    assert np.abs(samples).max() > 0.8  # brought up to a normal volume, not FluidSynth's whisper
