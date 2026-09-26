"""Makes the song from the user's own hum, with the song settings translated for the engine.

The hum is the WAV that POST /upload saved. analyze_audio_file turns it into notes (MIDI pitch,
start and length in seconds) plus a tempo; the accompanist engine wants note times in beats and
a few options. This file is the thin translation between the two:

    speed   0 → 1   tempo from half to one and a half times the hum's (0.5 keeps it as hummed)
    pitch   0 → 1   the tune moves down or up to an octave (0.5 keeps it as hummed)
    emotion 0 → 1   below 0.4 minor, above 0.6 major, in between the hum's own mode
    style           a genre word from talk mode, mapped to one of the engine's styles
    extras          an instrument named in talk mode (strings, sax, guitar…) plays the song

The instruments come from the soundfont FluidSynth uses (ECKO_SOUNDFONT in backend/.env).
FluidSynth renders very quietly, so the finished song is brought up to a normal volume.
"""

import io
import os
import tempfile
from functools import lru_cache

import numpy as np
import soundfile
from accompanist.generate import generate_accompaniment

from ..audio.processor import analyze_audio_file
from .settings import SongSettings

ENGINE_STYLE_FOR = {
    "pop": "pop",
    "rock": "pop",
    "dance": "pop",
    "jazz": "jazz",
    "swing": "jazz",
    "blues": "jazz",
    "piano": "piano",
    "lullaby": "piano",
    "lo-fi": "piano",
    "ballad": "piano",
    "classical": "classical",
    "cinematic": "cinematic",
    "orchestral": "cinematic",
    "epic": "cinematic",
    "folk": "asian_folk",
    "asian folk": "asian_folk",
}
UNKNOWN_STYLE = "pop"  # a genre the engine doesn't know still gets a lively backing

ENGINE_INSTRUMENT_FOR = {
    "piano": "piano",
    "guitar": "guitar",
    "acoustic guitar": "guitar_steel",
    "electric guitar": "guitar_clean",
    "jazz guitar": "guitar_jazz",
    "electric piano": "electric_piano",
    "keys": "electric_piano",
    "strings": "strings",
    "violin": "strings",
    "sax": "sax",
    "saxophone": "sax",
}
INSTRUMENT_FOR_STYLE = {"rock": "guitar_clean", "jazz": "guitar_jazz", "lo-fi": "electric_piano", "orchestral": "strings"}

PEAK_LEVEL = 0.9  # the loudest moment of the song, where 1.0 is full scale
FALLBACK_HUM_TEMPO = 100.0  # when the hum's tempo can't be measured
SENSIBLE_TEMPO = (40.0, 220.0)
OCTAVE = 12


def make_song(hum_path: str, settings: SongSettings) -> bytes:
    """The song as WAV bytes. Raises ValueError if the hum has no tune, SongError if it can't be heard."""
    analysis = _analyze(hum_path, os.stat(hum_path).st_mtime_ns)
    if not analysis["melody"]:
        raise ValueError("No tune was found in that hum. Try humming a little louder.")
    request = engine_request(analysis, settings)
    melody = {"melody": request.pop("melody"), "tempo": request["tempo"]}
    with tempfile.TemporaryDirectory() as folder:
        result = generate_accompaniment(melody, os.path.join(folder, "song.mid"), render_wav=True, **request)
        if not result.wav_path:
            raise SongError("The song couldn't be turned into audio. " + " ".join(result.warnings))
        return _at_normal_volume(result.wav_path)


def engine_request(analysis: dict, settings: SongSettings) -> dict:
    """The generate_accompaniment arguments for this hum with these settings."""
    hum_tempo = analysis.get("tempo") or 0.0
    if not SENSIBLE_TEMPO[0] <= hum_tempo <= SENSIBLE_TEMPO[1]:
        hum_tempo = FALLBACK_HUM_TEMPO
    beats_per_second = hum_tempo / 60
    shift = round((settings.pitch - 0.5) * 2 * OCTAVE)
    request = {
        "melody": [
            {
                "hz": min(127.0, max(0.0, note["hz"] + shift)),  # the engine's "hz" holds MIDI note numbers
                "start": note["start"] * beats_per_second,
                "duration": note["duration"] * beats_per_second,
            }
            for note in analysis["melody"]
        ],
        "tempo": round(hum_tempo * (0.5 + settings.speed), 1),
        "instrument": _instrument(settings),
    }
    if settings.style:
        request["style"] = ENGINE_STYLE_FOR.get(settings.style, UNKNOWN_STYLE)
    if settings.emotion < 0.4:
        request["mode"] = "minor"
    elif settings.emotion > 0.6:
        request["mode"] = "major"
    return request


def song_notes(hum_path: str, settings: SongSettings) -> dict:
    """For the notes graph: the notes heard in the hum, and the ones the song's tune plays."""
    return notes_from(_analyze(hum_path, os.stat(hum_path).st_mtime_ns), settings)


def notes_from(analysis: dict, settings: SongSettings) -> dict:
    """Both lists as MIDI pitch with start and length in seconds, so they share one time axis."""
    request = engine_request(analysis, settings)
    seconds_per_beat = 60 / request["tempo"]
    return {
        "sung": [_note(n["hz"], n["start"], n["duration"]) for n in analysis["melody"]],
        "played": [_note(n["hz"], n["start"] * seconds_per_beat, n["duration"] * seconds_per_beat) for n in request["melody"]],
    }


class SongError(Exception):
    """The engine made the song but couldn't render it to audio (usually FluidSynth is missing)."""


def _note(midi: float, start: float, duration: float) -> dict:
    return {"midi": round(midi, 2), "start": round(start, 3), "duration": round(duration, 3)}


def _instrument(settings: SongSettings) -> str:
    named = [ENGINE_INSTRUMENT_FOR[extra] for extra in settings.extras if extra in ENGINE_INSTRUMENT_FOR]
    if named:
        return named[-1]  # the most recently asked for
    return INSTRUMENT_FOR_STYLE.get(settings.style or "", "piano")


def _at_normal_volume(wav_path: str) -> bytes:
    samples, rate = soundfile.read(wav_path)
    peak = np.abs(samples).max()
    if peak > 0:
        samples = samples * (PEAK_LEVEL / peak)
    wav = io.BytesIO()
    soundfile.write(wav, samples, rate, format="WAV", subtype="PCM_16")
    return wav.getvalue()


@lru_cache(maxsize=4)
def _analyze(hum_path: str, _changed_at: int) -> dict:
    """The hum's notes and tempo. Remakes reuse it; a new hum (a new change time) is analysed again."""
    return analyze_audio_file(hum_path)
