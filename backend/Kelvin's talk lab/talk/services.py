"""Builds the real services from the .env settings. A missing key gives a clear message, not a crash."""

from collections.abc import Callable, Iterable
from dataclasses import dataclass

from .config import Config
from .intent import Interpreter
from .music import MusicMaker
from .pipeline import Pipeline
from .stt import Transcriber
from .tts import Speaker


@dataclass
class Services:
    pipeline: Pipeline
    speak: Callable[[str], Iterable[bytes]]
    music: MusicMaker
    about: dict  # model names and modes for the test page, never keys


def build_services(config: Config) -> Services:
    if config.gemini_api_key:
        understand = Interpreter(config.gemini_api_key, config.gemini_model, config.gemini_thinking).understand
    else:
        understand = _missing("GEMINI_API_KEY")
    if config.elevenlabs_api_key:
        transcribe = Transcriber(config.elevenlabs_api_key, config.stt_model).transcribe
        speak = Speaker(config.elevenlabs_api_key, config.voice_id, config.tts_model).stream
    else:
        transcribe = speak = _missing("ELEVENLABS_API_KEY")
    return Services(Pipeline(understand, transcribe), speak, MusicMaker(config.music_mode, config.backend_url), config.public())


def _missing(key_name: str):
    def fail(*_args):
        raise RuntimeError(f"{key_name} is missing. Add it to the lab's .env file and restart the server.")

    return fail
