"""Shared stand-ins for Gemini and ElevenLabs, so the offline tests never touch the network."""

from pathlib import Path

import pytest

from server import create_app
from talk.commands import Adjustment, Command
from talk.config import load_config
from talk.music import MusicMaker
from talk.pipeline import Pipeline
from talk.services import Services

FIXTURES = Path(__file__).parent / "fixtures"
FASTER = Command(
    intent="adjust",
    adjustments=[Adjustment(setting="speed", direction="up", amount="moderate")],
    reply="A little quicker now!",
)


class FakeGemini:
    """Answers every command with the prepared Command and remembers what it was asked."""

    def __init__(self, command: Command = FASTER, error: Exception | None = None):
        self.command = command
        self.error = error
        self.calls = []

    def __call__(self, text, settings):
        self.calls.append((text, settings))
        if self.error:
            raise self.error
        return self.command


class FakeEars:
    """Pretends to transcribe: returns the prepared words."""

    def __init__(self, words: str = "make it faster", error: Exception | None = None):
        self.words = words
        self.error = error
        self.calls = []

    def __call__(self, audio, filename):
        self.calls.append((audio, filename))
        if self.error:
            raise self.error
        return self.words


def fake_voice(text):
    yield b"ID3-first-chunk"
    yield b"-rest-of-the-mp3"


def failing_post(*_args, **_kwargs):
    raise AssertionError("the song engine must not be called in mock mode")


@pytest.fixture
def gemini():
    return FakeGemini()


@pytest.fixture
def ears():
    return FakeEars()


def build_client(gemini, ears, speak=fake_voice):
    services = Services(
        pipeline=Pipeline(gemini, ears),
        speak=speak,
        music=MusicMaker("mock", "http://localhost:8000", post=failing_post),
        about={"gemini_model": "fake", "keys_present": {"gemini": True, "elevenlabs": True}},
    )
    return create_app(services).test_client()


@pytest.fixture
def client(gemini, ears):
    return build_client(gemini, ears)


@pytest.fixture(scope="session")
def config():
    return load_config()


@pytest.fixture(scope="session")
def gemini_key(config):
    if not config.gemini_api_key:
        pytest.skip("GEMINI_API_KEY is not in .env")
    return config.gemini_api_key


@pytest.fixture(scope="session")
def elevenlabs_key(config):
    if not config.elevenlabs_api_key:
        pytest.skip("ELEVENLABS_API_KEY is not in .env")
    return config.elevenlabs_api_key
