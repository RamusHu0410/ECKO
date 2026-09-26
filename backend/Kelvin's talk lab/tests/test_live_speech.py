"""Real ElevenLabs speech to text and text to speech, using recordings made without a mic.

Needs ELEVENLABS_API_KEY in .env (the full voice turn also needs GEMINI_API_KEY).
The recordings in tests/fixtures come from scripts/make_fixtures.py.
"""

import time

import pytest
from conftest import FIXTURES

from talk.intent import Interpreter
from talk.pipeline import Pipeline
from talk.settings import SongSettings
from talk.stt import Transcriber
from talk.tts import Speaker

pytestmark = pytest.mark.live

FIRST_AUDIO_LIMIT_SECONDS = 2.0


@pytest.fixture(scope="module")
def ears(elevenlabs_key, config):
    return Transcriber(elevenlabs_key, config.stt_model)


@pytest.fixture(scope="module")
def voice(elevenlabs_key, config):
    return Speaker(elevenlabs_key, config.voice_id, config.tts_model)


@pytest.mark.parametrize(
    ("recording", "words"),
    [
        ("make_it_faster.wav", ["faster"]),
        ("turn_this_into_rock.m4a", ["rock"]),
        ("bit_slower_and_lower.wav", ["slower", "lower"]),
        ("weather_tomorrow.m4a", ["weather", "tomorrow"]),
        ("mas_rapido.m4a", ["rápido"]),
    ],
)
def test_speech_to_text(ears, recording, words):
    heard = ears.transcribe((FIXTURES / recording).read_bytes(), recording).lower()
    for word in words:
        assert word in heard, f"{recording}: heard {heard!r}"


def test_silence_is_heard_as_nothing(ears):
    # an empty transcript makes the pipeline answer "I couldn't hear you" without asking Gemini
    heard = ears.transcribe((FIXTURES / "silence.wav").read_bytes(), "silence.wav")
    assert not any(character.isalpha() for character in heard), f"heard {heard!r}"


def test_reply_starts_streaming_quickly(voice):
    started = time.perf_counter()
    chunks = voice.stream("Sure! I made it a little faster and a bit brighter. How does that sound?")
    first = next(chunks)
    first_seconds = time.perf_counter() - started
    audio = first + b"".join(chunks)
    assert first_seconds < FIRST_AUDIO_LIMIT_SECONDS, f"first audio after {first_seconds:.2f}s"
    assert audio[:3] == b"ID3" or (audio[0] == 0xFF and audio[1] & 0xE0 == 0xE0), "not an MP3"
    assert len(audio) > 20_000


def test_full_voice_turn(ears, gemini_key, config):
    pipeline = Pipeline(Interpreter(gemini_key, config.gemini_model, config.gemini_thinking).understand, ears.transcribe)
    recording = (FIXTURES / "bit_slower_and_lower.wav").read_bytes()
    turn = pipeline.from_audio(recording, "talk.wav", SongSettings())
    assert turn.intent == "adjust", turn
    assert turn.settings.speed < 0.5 and turn.settings.pitch < 0.5, turn
    assert set(turn.timings) == {"transcribe_ms", "understand_ms", "total_ms"}
