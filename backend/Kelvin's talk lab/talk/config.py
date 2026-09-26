"""Reads the lab's settings and secrets from the gitignored .env file next to this package."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

LAB_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Config:
    gemini_api_key: str
    elevenlabs_api_key: str
    gemini_model: str
    gemini_thinking: str
    voice_id: str
    tts_model: str
    stt_model: str
    music_mode: str
    backend_url: str
    port: int

    def public(self) -> dict:
        """Everything safe to show on the test page: model names, never keys."""
        return {
            "gemini_model": self.gemini_model,
            "gemini_thinking": self.gemini_thinking,
            "tts_model": self.tts_model,
            "stt_model": self.stt_model,
            "voice_id": self.voice_id,
            "music_mode": self.music_mode,
            "keys_present": {
                "gemini": bool(self.gemini_api_key),
                "elevenlabs": bool(self.elevenlabs_api_key),
            },
        }


def load_config() -> Config:
    load_dotenv(LAB_DIR / ".env")
    env = os.environ.get
    music_mode = env("MUSIC_MODE", "mock").strip().lower()
    return Config(
        gemini_api_key=env("GEMINI_API_KEY", "").strip(),
        elevenlabs_api_key=env("ELEVENLABS_API_KEY", "").strip(),
        gemini_model=env("GEMINI_MODEL", "gemini-3.1-flash-lite"),
        gemini_thinking=env("GEMINI_THINKING", "minimal"),
        voice_id=env("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb"),
        tts_model=env("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5"),
        stt_model=env("ELEVENLABS_STT_MODEL", "scribe_v2"),
        music_mode="backend" if music_mode == "backend" else "mock",
        backend_url=env("BACKEND_URL", "http://localhost:8000").rstrip("/"),
        port=int(env("TALK_LAB_PORT", "5190")),
    )
