"""Talk mode's routes, mounted at /talk (see app/__init__.py). The work itself lives in app/talk/.

POST /talk/voice          the recording + current settings (+ the gnome's character) → what was heard,
                          new settings, reply id
GET  /talk/speech/<id>    that reply, spoken and streamed as MP3
POST /talk/song           the hum saved by /upload + settings → the song as WAV
POST /talk/notes          the same → the notes heard in the hum, the notes the song plays, and the
                          hum's pitch frame by frame for the notes graph (JSON)
"""

import json
import os
import time

from flask import Blueprint, Response, current_app, jsonify, request
from werkzeug.utils import secure_filename

from ..talk.characters import Character, character
from ..talk.config import load_config
from ..talk.services import Services, build_services
from ..talk.settings import SongSettings
from ..talk.song import SongError, make_song, song_notes
from ..talk.tts import AUDIO_MIME

bp = Blueprint("talk", __name__)
HUM_GONE = "That hum isn't on the server any more. Hum again."


def _services() -> Services:
    """Built on first use, so the app starts (and its tests run) without the API keys."""
    if "talk" not in current_app.extensions:
        current_app.extensions["talk"] = build_services(load_config())
    return current_app.extensions["talk"]


@bp.post("/voice")
def voice():
    audio = request.files.get("audio")
    if audio is None:
        raise ValueError("Send the recording in a form field called audio.")
    current, previous, gnome = _read_state(json.loads(request.form.get("state") or "{}"))
    services = _services()
    turn = services.pipeline.from_audio(audio.read(), audio.filename or "talk.webm", current, previous, gnome.personality)
    # the reply is spoken later, in this character's voice
    return jsonify({**turn.to_dict(), "speech_id": services.replies.put((turn.reply, gnome.voice_id))})


@bp.get("/speech/<reply_id>")
def speech(reply_id):
    services = _services()
    saved = services.replies.get(reply_id)
    if saved is None:
        return _error("That reply has expired. Say it again.", 404)
    text, voice_id = saved
    started = time.perf_counter()
    try:
        chunks = iter(services.speak(text, voice_id))
        first = next(chunks, b"")  # fail here, before any audio is sent, if the voice service is down
    except Exception as exc:
        current_app.logger.exception("text to speech failed")
        return _error(f"The voice isn't available right now ({type(exc).__name__}).", 503)
    current_app.logger.info("talk: first speech audio after %d ms", (time.perf_counter() - started) * 1000)
    return Response(_first_then_rest(first, chunks), mimetype=AUDIO_MIME, headers={"Cache-Control": "no-store"})


@bp.post("/song")
def song():
    data = request.get_json(silent=True)
    hum_path = _saved_hum(data)
    if hum_path is None:
        return _error(HUM_GONE, 404)
    try:
        wav = make_song(hum_path, SongSettings.from_dict(data.get("settings")))
    except SongError as exc:
        return _error(str(exc), 503)
    return Response(wav, mimetype="audio/wav", headers={"Cache-Control": "no-store"})


@bp.post("/notes")
def notes():
    data = request.get_json(silent=True)
    hum_path = _saved_hum(data)
    if hum_path is None:
        return _error(HUM_GONE, 404)
    return jsonify(song_notes(hum_path, SongSettings.from_dict(data.get("settings"))))


@bp.errorhandler(ValueError)
def bad_request(exc):
    return _error(str(exc) or "That request didn't make sense.", 400)


def _saved_hum(data) -> str | None:
    """Where /upload saved the hum named in the request, or None if it's not there."""
    if not isinstance(data, dict) or not isinstance(data.get("hum"), str):
        raise ValueError("Send JSON with the hum's filename from /upload.")
    hum_path = os.path.join(current_app.config["UPLOAD_FOLDER"], secure_filename(data["hum"]))  # can't leave the folder
    return hum_path if os.path.isfile(hum_path) else None


def _read_state(data) -> tuple[SongSettings, SongSettings | None, Character]:
    """The settings the page has now, the version before them (so "undo" can be spoken), and the
    gnome's character (ECKO when none or an unknown one is named)."""
    if not isinstance(data, dict):
        raise ValueError("state must be an object")
    previous = data.get("previous")
    current = SongSettings.from_dict(data.get("settings"))
    return current, SongSettings.from_dict(previous) if previous else None, character(data.get("character"))


def _first_then_rest(first: bytes, rest):
    yield first
    yield from rest


def _error(message: str, status: int):
    return jsonify({"error": message}), status
