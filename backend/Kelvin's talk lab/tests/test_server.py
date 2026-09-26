"""The web layer, through Flask's test client, with fake Gemini, speech and song engine. No network."""

import io
import json

from conftest import FIXTURES, build_client


def test_page_and_status(client):
    assert b"ECKO talk lab" in client.get("/").data
    status = client.get("/api/status").get_json()
    assert status["keys_present"] == {"gemini": True, "elevenlabs": True}
    assert "key" not in json.dumps(status).lower().replace("keys_present", "")


def test_typed_command_round_trip(client, gemini):
    response = client.post("/api/command", json={"text": "faster", "settings": {"emotion": 0.2, "speed": 0.5, "pitch": 0.5}})
    turn = response.get_json()
    assert response.status_code == 200
    assert turn["settings"]["speed"] == 0.7 and turn["settings"]["emotion"] == 0.2
    assert turn["changed"] == ["speed"]
    assert turn["speech_url"].startswith("/api/speech/")
    assert gemini.calls[0][1].emotion == 0.2  # the current settings reached Gemini


def test_spoken_reply_streams(client):
    turn = client.post("/api/command", json={"text": "faster"}).get_json()
    speech = client.get(turn["speech_url"])
    assert speech.status_code == 200
    assert speech.mimetype == "audio/mpeg"
    assert speech.data == b"ID3-first-chunk-rest-of-the-mp3"


def test_unknown_speech_id(client):
    assert client.get("/api/speech/not-a-real-id").status_code == 404


def test_voice_command_with_a_real_recording(client, ears):
    recording = (FIXTURES / "turn_this_into_rock.m4a").read_bytes()
    state = json.dumps({"settings": {"speed": 0.4}, "previous": None})
    response = client.post(
        "/api/voice",
        data={"audio": (io.BytesIO(recording), "talk.m4a"), "state": state},
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    assert ears.calls == [(recording, "talk.m4a")]
    assert response.get_json()["heard"] == "make it faster"


def test_voice_undo_uses_the_previous_version(client, gemini):
    from talk.commands import Command

    gemini.command = Command(intent="undo", reply="Back it goes.")
    state = json.dumps({"settings": {"speed": 0.9, "style": "rock"}, "previous": {"speed": 0.5}})
    response = client.post("/api/voice", data={"audio": (io.BytesIO(b"x"), "talk.webm"), "state": state}, content_type="multipart/form-data")
    turn = response.get_json()
    assert turn["intent"] == "undo"
    assert turn["settings"] == {"emotion": 0.5, "speed": 0.5, "pitch": 0.5, "style": None, "extras": []}


def test_bad_requests_get_a_clear_message(client):
    assert client.post("/api/command", json={"nope": 1}).status_code == 400
    bad_settings = client.post("/api/command", json={"text": "faster", "settings": {"speed": "fast"}})
    assert bad_settings.status_code == 400 and "speed" in bad_settings.get_json()["error"]
    assert client.post("/api/voice", data={}, content_type="multipart/form-data").status_code == 400
    broken_state = client.post("/api/voice", data={"audio": (io.BytesIO(b"x"), "a.webm"), "state": "{"}, content_type="multipart/form-data")
    assert broken_state.status_code == 400


def test_recordings_over_the_limit_are_refused(client):
    huge = io.BytesIO(b"0" * (6 * 1024 * 1024))
    response = client.post("/api/voice", data={"audio": (huge, "talk.webm")}, content_type="multipart/form-data")
    assert response.status_code == 413


def test_music_is_mocked_by_default(client):
    # the client fixture's song engine raises if anything is sent, so this also proves nothing was
    song = client.post("/api/music", json={"settings": {"speed": 1.0, "emotion": 0.1, "style": "jazz"}}).get_json()
    assert song["mode"] == "mock" and song["audio_url"] is None
    assert song["request"]["tempo"] == 150 and song["request"]["mode"] == "minor" and song["request"]["style"] == "piano"


def test_voice_failure_is_a_503_not_a_crash(gemini, ears):
    def broken_voice(_text):
        raise ConnectionError("ElevenLabs is down")
        yield b""  # makes this a generator, like the real one

    client = build_client(gemini, ears, speak=broken_voice)
    turn = client.post("/api/command", json={"text": "faster"}).get_json()
    response = client.get(turn["speech_url"])
    assert response.status_code == 503
    assert "voice" in response.get_json()["error"]


def test_missing_voice_key_is_a_503_too(gemini, ears):
    def no_key(_text):
        raise RuntimeError("ELEVENLABS_API_KEY is missing")

    client = build_client(gemini, ears, speak=no_key)
    turn = client.post("/api/command", json={"text": "faster"}).get_json()
    assert client.get(turn["speech_url"]).status_code == 503
