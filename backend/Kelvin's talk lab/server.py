"""The talk lab's web server: the test page plus a small JSON API around the talk package.

Run it with:  .venv/bin/python server.py   then open http://localhost:5190
Only this file knows about Flask; everything it calls lives in talk/.
"""

import json
import logging
import time

from flask import Flask, Response, jsonify, request

from talk.config import load_config
from talk.services import Services, build_services
from talk.settings import SongSettings
from talk.store import ShortTermStore
from talk.tts import AUDIO_MIME

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 10 seconds of talking is far below this in any format

log = logging.getLogger("talk-lab")


def create_app(services: Services) -> Flask:
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
    replies = ShortTermStore(keep_at_most=200)
    songs = ShortTermStore(keep_at_most=5)

    def answer(turn):
        """The turn as JSON, plus the address the page plays the spoken reply from."""
        return jsonify({**turn.to_dict(), "speech_url": f"/api/speech/{replies.put(turn.reply)}"})

    @app.get("/")
    def page():
        return app.send_static_file("index.html")

    @app.get("/api/status")
    def status():
        return jsonify(services.about)

    @app.post("/api/command")
    def command():
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not isinstance(data.get("text"), str):
            raise ValueError("Send JSON with a text field.")
        current, previous = _read_state(data)
        return answer(services.pipeline.from_text(data["text"], current, previous))

    @app.post("/api/voice")
    def voice():
        audio = request.files.get("audio")
        if audio is None:
            raise ValueError("Send the recording in a form field called audio.")
        current, previous = _read_state(json.loads(request.form.get("state") or "{}"))
        return answer(services.pipeline.from_audio(audio.read(), audio.filename or "talk.webm", current, previous))

    @app.get("/api/speech/<reply_id>")
    def speech(reply_id):
        text = replies.get(reply_id)
        if text is None:
            return _error("That reply has expired. Send the command again.", 404)
        started = time.perf_counter()
        try:
            chunks = iter(services.speak(text))
            first = next(chunks, b"")  # fail here, before any audio is sent, if the voice service is down
        except Exception as exc:
            log.exception("text to speech failed")
            return _error(f"The voice isn't available right now ({type(exc).__name__}).", 503)
        log.info("first speech audio after %d ms", (time.perf_counter() - started) * 1000)
        return Response(_first_then_rest(first, chunks), mimetype=AUDIO_MIME, headers={"Cache-Control": "no-store"})

    @app.post("/api/music")
    def music():
        data = request.get_json(silent=True) or {}
        song = services.music.make(SongSettings.from_dict(data.get("settings")))
        audio_url = f"/api/music/{songs.put(song.audio)}" if song.audio else None
        return jsonify({"mode": song.mode, "request": song.request, "audio_url": audio_url, "error": song.error})

    @app.get("/api/music/<song_id>")
    def song_audio(song_id):
        audio = songs.get(song_id)
        if audio is None:
            return _error("That song has expired. Ask for it again.", 404)
        return Response(audio, mimetype="audio/wav")

    @app.errorhandler(ValueError)
    def bad_request(exc):
        return _error(str(exc) or "That request didn't make sense.", 400)

    @app.errorhandler(413)
    def too_large(_exc):
        return _error("That recording is too large. Talk for 10 seconds or less.", 413)

    return app


def _read_state(data: dict) -> tuple[SongSettings, SongSettings | None]:
    """The settings the page has now, and the version before them (for undo)."""
    if not isinstance(data, dict):
        raise ValueError("state must be an object")
    previous = data.get("previous")
    return SongSettings.from_dict(data.get("settings")), SongSettings.from_dict(previous) if previous else None


def _first_then_rest(first: bytes, rest):
    yield first
    yield from rest


def _error(message: str, status: int):
    return jsonify({"error": message}), status


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    config = load_config()
    print(f"Talk lab on http://localhost:{config.port}  (music: {config.music_mode})")
    create_app(build_services(config)).run(port=config.port, threaded=True)
