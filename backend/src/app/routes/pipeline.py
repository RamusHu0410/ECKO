"""The new song pipeline over HTTP: a hum -> intake (app/audio/intake) -> orchestral arrangement
(app/audio/arrange) -> a 24-bit WAV. It runs next to the existing flow (/upload + /talk/song),
which is unchanged.

POST /pipeline/song         what the page calls: the same body as /talk/song, {hum, settings}
                            (the hum /upload saved, and the page's song settings), and the same
                            answer: the song as WAV, or JSON {error, code} (400 the recording has no
                            usable tune, 404 the hum is gone, 503 the song couldn't be made). The
                            hum's melody is transcribed once and reused, so a settings change only
                            re-arranges it.
POST /pipeline/notes        the same body as /talk/notes, and its answer: for the notes graph, the
                            notes intake heard (sung), the ones the song's tune plays (played),
                            and the hum's pitch as it was sung (contour), in seconds on the hum's
                            time axis
POST /pipeline              make a song from a hum, in one request (about 1-5 s):
                            JSON {hum: <filename /upload returned>, style?}   the hum /upload saved
                            or multipart {file, style?}                      a recording sent directly
    201 -> {run_id, song_url, duration_seconds, style, fell_back, warnings}
    400 -> the recording can't give a tune: {error, code, step}  (codes: no_tune, silent,
           too_short, too_long, unreadable, empty, ...; error is written for the user)
    404 -> the named hum isn't on the server any more: {error, code: "hum_gone"}
    503 -> the song couldn't be made on this server (e.g. FluidSynth is missing): {error, code, step}
GET  /pipeline/<run_id>/song   the finished song (audio/wav)
GET  /pipeline/styles          the styles, the default, and the other words that map to them

The browser calls /api/pipeline...; Vite (and Vercel) forward it here without the /api prefix.
"""

import os
import re
import tempfile
from functools import lru_cache
from pathlib import Path

from flask import Blueprint, Response, current_app, jsonify, request, send_file
from werkzeug.utils import secure_filename

from ..audio.arrange import ArrangeSettings, ExtraPart, arranged_melody
from ..audio.arrange.melody import load_melody
from ..audio.arrange.config import DEFAULT_STYLE, STYLE_ALIASES, STYLES
from ..audio.errors import PipelineError
from ..audio.pipeline import melody_run_for, new_run_dir, rerun, run_pipeline
from ..talk.settings import DRUMS, SongSettings
from ..talk.song import BACKGROUND_VOLUME, LOW, OTHER_NAMES, PROGRAMS

bp = Blueprint("pipeline", __name__, url_prefix="/pipeline")

RUN_ID = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{32}$")
HUM_GONE = "That hum isn't on the server any more. Hum again."
# Refusals caused by the recording itself (the user can fix them by humming again): 400.
# Anything else went wrong on our side: 503.
RECORDING_CODES = {"no_tune", "silent", "too_short", "too_long", "unreadable", "empty", "not_found", "input_changed"}
UNSET_STYLE = "cinematic"  # when the page hasn't picked a style: the orchestra at its fullest
LEAD_VOLUME = {"soft": 80, "loud": 127}  # "normal" keeps the style's own balance


@bp.post("/song")
def song_for_page():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("hum"), str):
        return jsonify({"error": "Send JSON with the hum's filename from /upload.", "code": "bad_request"}), 400
    hum_path = os.path.join(current_app.config["UPLOAD_FOLDER"], secure_filename(data["hum"]))
    if not os.path.isfile(hum_path):
        return jsonify({"error": HUM_GONE, "code": "hum_gone"}), 404
    try:
        style, settings = settings_from_page(data.get("settings"))
    except ValueError as exc:
        return jsonify({"error": str(exc), "code": "bad_settings"}), 400

    runs = current_app.config["RUNS_DIR"]
    try:
        melody_run, _intake_warnings = melody_run_for(hum_path, runs)
        result = rerun(melody_run, style, "transform", run_dir=str(new_run_dir(runs)), settings=settings)
    except PipelineError as exc:
        return _failure(exc)
    current_app.logger.info("pipeline song %s: %s, %.1f s%s", result.run_id, style, result.duration_seconds,
                            f", warnings {result.warnings}" if result.warnings else "")
    return Response(Path(result.final_wav_path).read_bytes(), mimetype="audio/wav",
                    headers={"Cache-Control": "no-store", "X-Run-Id": result.run_id})


@bp.post("/notes")
def notes_for_page():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("hum"), str):
        return jsonify({"error": "Send JSON with the hum's filename from /upload.", "code": "bad_request"}), 400
    hum_path = os.path.join(current_app.config["UPLOAD_FOLDER"], secure_filename(data["hum"]))
    if not os.path.isfile(hum_path):
        return jsonify({"error": HUM_GONE, "code": "hum_gone"}), 404
    try:
        style, settings = settings_from_page(data.get("settings"))
        melody_run, _ = melody_run_for(hum_path, current_app.config["RUNS_DIR"])
    except ValueError as exc:
        return jsonify({"error": str(exc), "code": "bad_settings"}), 400
    except PipelineError as exc:
        return _failure(exc)
    heard = load_melody(melody_run / "melody.json")
    played, _, _ = arranged_melody(heard, style, settings)
    contour = _contour(hum_path, os.stat(hum_path).st_mtime_ns)
    # intake trimmed the silence before the hum, and its first note is beat 0: put both tunes where
    # the singing starts
    first = contour["segments"][0]["start"] if contour.get("segments") else 0.0
    return jsonify({"sung": _seconds(heard, first), "played": _seconds(played, first), "contour": contour})


def _seconds(melody, first: float) -> list[dict]:
    spb = melody.seconds_per_beat
    return [{"midi": n.pitch, "start": round(first + n.start_beats * spb, 3), "duration": round(n.duration_beats * spb, 3)}
            for n in melody.notes]


@lru_cache(maxsize=32)
def _contour(hum_path: str, _changed_at: int) -> dict:
    """The hum's pitch frame by frame, for drawing (the pitch tracker in app/audio/processor.py).
    Settings changes redraw the graph, so it's kept per recording."""
    from ..audio.processor import analyze_audio_file

    return analyze_audio_file(hum_path).get("contour") or {"step": 0.0, "segments": []}


def settings_from_page(page: dict | None) -> tuple[str, ArrangeSettings]:
    """The page's song settings (the same ones /talk/song takes: app/talk/settings.py) in the
    arrangement's terms. Raises ValueError when they aren't usable."""
    song = SongSettings.from_dict(page)
    lead = next((part for part in song.instruments if part.role == "lead"), None)
    parts = []
    for part in song.instruments:
        if part is lead:
            continue
        name = OTHER_NAMES.get(part.name, part.name)
        if name == DRUMS:
            parts.append(ExtraPart(0, "drums", BACKGROUND_VOLUME[part.level], part.section))
        elif name in PROGRAMS:
            parts.append(ExtraPart(PROGRAMS[name], "bass" if name in LOW else "chords", BACKGROUND_VOLUME[part.level], part.section))
    lead_name = OTHER_NAMES.get(lead.name, lead.name) if lead else None
    return song.style or UNSET_STYLE, ArrangeSettings(
        tempo_scale=round(0.5 + song.speed, 3),  # the same as talk mode: from half to one and a half times
        transpose=round((song.pitch - 0.5) * 24),  # down or up to an octave
        mode="minor" if song.emotion < 0.4 else "major" if song.emotion > 0.6 else None,
        lead=PROGRAMS.get(lead_name) if lead_name and lead_name != DRUMS else None,
        lead_volume=LEAD_VOLUME.get(lead.level) if lead else None,
        parts=tuple(parts),
        energy=song.energy,
    )


def _failure(exc: PipelineError):
    status = 400 if exc.code in RECORDING_CODES else 503
    if status == 503:
        current_app.logger.error("pipeline failed at %s (%s): %s", exc.step, exc.code, exc.__cause__ or exc)
    return jsonify({"error": exc.message, "code": exc.code, "step": exc.step}), status


@bp.post("")
def make_song():
    style = None
    if request.files.get("file") is not None:
        upload = request.files["file"]
        style = request.form.get("style")
        suffix = Path(secure_filename(upload.filename or "")).suffix or ".wav"
        # Kept only while intake copies it into the run folder, then deleted.
        with tempfile.TemporaryDirectory() as scratch:
            hum_path = os.path.join(scratch, "hum" + suffix)
            upload.save(hum_path)
            return _run(hum_path, style)

    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("hum"), str):
        return jsonify({"error": "Send JSON {hum, style} with the name /upload returned, or a file.", "code": "bad_request"}), 400
    style = data.get("style")
    # secure_filename keeps it inside the upload folder
    hum_path = os.path.join(current_app.config["UPLOAD_FOLDER"], secure_filename(data["hum"]))
    if not os.path.isfile(hum_path):
        return jsonify({"error": HUM_GONE, "code": "hum_gone"}), 404
    return _run(hum_path, style)


def _run(hum_path: str, style):
    if style is not None and not isinstance(style, str):
        return jsonify({"error": "style must be a word, like cinematic.", "code": "bad_request"}), 400
    try:
        result = run_pipeline(hum_path, style or DEFAULT_STYLE, run_dir=str(new_run_dir(current_app.config["RUNS_DIR"])))
    except PipelineError as exc:
        return _failure(exc)
    return jsonify({
        "run_id": result.run_id,
        "song_url": f"/pipeline/{result.run_id}/song",
        "duration_seconds": result.duration_seconds,
        "style": result.render.style if result.render else None,
        "fell_back": result.fell_back,
        "warnings": result.warnings,
    }), 201


@bp.get("/<run_id>/song")
def song(run_id):
    if not RUN_ID.fullmatch(run_id):
        return jsonify({"error": "Unknown song.", "code": "unknown_song"}), 404
    path = Path(current_app.config["RUNS_DIR"]) / run_id / "final.wav"
    if not path.is_file():
        return jsonify({"error": "Unknown song.", "code": "unknown_song"}), 404
    return send_file(path, mimetype="audio/wav", conditional=True)


@bp.get("/styles")
def styles():
    return jsonify({"styles": sorted(STYLES), "default": DEFAULT_STYLE, "aliases": STYLE_ALIASES})
