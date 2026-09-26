"""How settings become a song engine request, and the mock/backend switch. No network."""

from types import SimpleNamespace

import pytest
import requests
from conftest import failing_post

from talk.music import BACKEND_STYLE_FOR, DEMO_MELODY, MusicMaker, backend_request
from talk.settings import SongSettings

BACKEND_STYLES = {"piano", "pop", "cinematic", "classical"}  # GET /accompaniment/styles


def test_middle_settings_make_a_plain_request():
    body = backend_request(SongSettings())
    assert body["tempo"] == 110 and body["style"] == "pop" and body["format"] == "wav"
    assert "mode" not in body  # the backend picks it from the melody
    assert [note["hz"] for note in body["melody"]] == [pitch for pitch, _, _ in DEMO_MELODY]


@pytest.mark.parametrize(("pitch", "shift"), [(0.0, -12), (0.25, -6), (0.5, 0), (1.0, 12)])
def test_pitch_moves_the_tune(pitch, shift):
    first_note = backend_request(SongSettings(pitch=pitch))["melody"][0]["hz"]
    assert first_note == DEMO_MELODY[0][0] + shift


@pytest.mark.parametrize(("emotion", "mode"), [(0.1, "minor"), (0.39, "minor"), (0.5, None), (0.61, "major")])
def test_emotion_picks_minor_or_major(emotion, mode):
    assert backend_request(SongSettings(emotion=emotion)).get("mode") == mode


def test_every_genre_maps_to_a_style_the_backend_knows():
    assert set(BACKEND_STYLE_FOR.values()) <= BACKEND_STYLES
    assert backend_request(SongSettings(style="polka"))["style"] == "pop"


def test_mock_mode_never_calls_the_backend():
    song = MusicMaker("mock", "http://localhost:8000", post=failing_post).make(SongSettings(speed=0.0))
    assert song.mode == "mock" and song.audio is None and song.request["tempo"] == 70


def test_backend_mode_sends_the_request():
    sent = []

    def fake_post(url, json, timeout):
        sent.append((url, json))
        return SimpleNamespace(status_code=200, content=b"RIFF-wav", text="")

    song = MusicMaker("backend", "http://localhost:8000", post=fake_post).make(SongSettings(style="rock"))
    assert sent[0][0] == "http://localhost:8000/accompaniment/generate"
    assert sent[0][1]["style"] == "pop"
    assert song.audio == b"RIFF-wav" and song.error is None


def test_backend_problems_become_messages():
    def no_fluidsynth(url, json, timeout):
        return SimpleNamespace(status_code=503, content=b"", text='{"error": "WAV rendering unavailable"}')

    def offline(url, json, timeout):
        raise requests.ConnectionError("refused")

    assert "503" in MusicMaker("backend", "http://x", post=no_fluidsynth).make(SongSettings()).error
    assert "isn't answering" in MusicMaker("backend", "http://x", post=offline).make(SongSettings()).error
