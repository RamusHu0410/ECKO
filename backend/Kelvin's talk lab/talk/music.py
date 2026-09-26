"""What the settings mean for the song engine, and the optional call that makes the song.

Mock by default: it builds the exact request the main backend would get, without sending it.
With MUSIC_MODE=backend it sends it to the main Flask app's POST /accompaniment/generate.
"""

from dataclasses import dataclass

import requests

from .settings import SongSettings

# The backend knows piano, pop, cinematic and classical (GET /accompaniment/styles)
BACKEND_STYLE_FOR = {
    "rock": "pop",
    "pop": "pop",
    "dance": "pop",
    "jazz": "piano",
    "lullaby": "piano",
    "lo-fi": "piano",
    "ballad": "piano",
    "piano": "piano",
    "cinematic": "cinematic",
    "orchestral": "cinematic",
    "epic": "cinematic",
    "classical": "classical",
}
DEFAULT_BACKEND_STYLE = "pop"
TIMEOUT_SECONDS = 60

# A short demo tune until the hum's own melody is passed in. The backend's "hz" field
# holds MIDI note numbers (60 = middle C), and start/duration are in beats.
DEMO_MELODY = [
    (60, 0, 1), (60, 1, 1), (67, 2, 1), (67, 3, 1), (69, 4, 1), (69, 5, 1), (67, 6, 2),
    (65, 8, 1), (65, 9, 1), (64, 10, 1), (64, 11, 1), (62, 12, 1), (62, 13, 1), (60, 14, 2),
]


@dataclass
class Song:
    mode: str  # mock | backend
    request: dict
    audio: bytes | None = None
    error: str | None = None


def backend_request(settings: SongSettings, melody=DEMO_MELODY) -> dict:
    """The body for POST /accompaniment/generate that matches these settings."""
    shift = round((settings.pitch - 0.5) * 24)  # up to an octave lower or higher
    body = {
        "melody": [{"hz": pitch + shift, "start": start, "duration": length} for pitch, start, length in melody],
        "tempo": round(70 + settings.speed * 80),  # 70 to 150 BPM, 110 in the middle
        "style": BACKEND_STYLE_FOR.get(settings.style or "", DEFAULT_BACKEND_STYLE),
        "format": "wav",
    }
    if settings.emotion < 0.4:
        body["mode"] = "minor"
    elif settings.emotion > 0.6:
        body["mode"] = "major"
    return body  # in between, the backend picks the mode from the melody


class MusicMaker:
    def __init__(self, mode: str, backend_url: str, post=requests.post):
        self.mode = mode
        self._url = f"{backend_url}/accompaniment/generate"
        self._post = post

    def make(self, settings: SongSettings) -> Song:
        body = backend_request(settings)
        if self.mode != "backend":
            return Song("mock", body)
        try:
            response = self._post(self._url, json=body, timeout=TIMEOUT_SECONDS)
        except requests.RequestException as exc:
            return Song("backend", body, error=f"The backend isn't answering at {self._url} ({type(exc).__name__}).")
        if response.status_code != 200:
            return Song("backend", body, error=f"The backend said {response.status_code}: {response.text[:200]}")
        return Song("backend", body, audio=response.content)
