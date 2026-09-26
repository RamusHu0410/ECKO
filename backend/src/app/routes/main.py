import os
import time
from math import isfinite

import numpy as np
from flask import Blueprint, jsonify, current_app, request, has_app_context

from ..audio.handoff import sensible_tempo, to_engine_melody
from ..audio.intake import AudioInputError, unique_upload_name
from ..audio.processor import analyze_audio_file, clean_wav

bp = Blueprint("main", __name__)


def _json_safe(value):
    """Convert NumPy values and non-finite floats into JSON-compatible data."""
    if isinstance(value, np.ndarray):
        return [_json_safe(item) for item in value.tolist()]
    if isinstance(value, np.generic):
        return _json_safe(value.item())
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, float) and not isfinite(value):
        return None
    return value


def allowed_file(filename):
    """Check if file has allowed extension."""
    if not has_app_context():
        return (
            "." in filename
            and not filename.startswith(".")
            and filename.rsplit(".", 1)[1].lower() == "wav"
        )
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower()
        in current_app.config["UPLOAD_EXTENSIONS"]
    )


@bp.route("/")
def index():
    print("[ROUTE] GET / - Index endpoint called")
    return jsonify(
        {
            "status": "ok",
            "message": "ECKO Backend Running",
            "environment": current_app.config.get("ENV", "unknown"),
        }
    )


@bp.route("/health")
def health():
    print("[ROUTE] GET /health - Health check called")
    # Add DB check here if needed: db.session.execute(text('SELECT 1'))
    return jsonify({"status": "healthy"}), 200


@bp.route("/upload", methods=["POST"])
def upload_wav():
    """Receive a hummed .wav from the frontend, save it, and find its notes.

    201 → the saved file's name (send it back to /talk/song and /talk/notes), plus:
        melody          notes ready for POST /accompaniment/generate: hz (MIDI note), start and
                        duration in beats at ``tempo`` (send ``tempo`` along with it)
        tempo, key, mode
        melody_seconds  the same notes in seconds, on the recording's own time axis
        tuning_cents    how far off A440 the hum was (already corrected in the notes)
        warnings        problems with the recording, in words for the user
        clean_filename  the filtered copy of the recording
        audio_analysis  the full analysis (pitch track, segments, ...)
    400 → the file isn't a usable recording: {error}
    500 → the analysis itself failed: {error, details}
    """
    request_start = time.time()
    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "No file part in request"}), 400
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify(
            {
                "error": "Invalid file type. Only .wav files are allowed.",
                "allowed_extensions": current_app.config["UPLOAD_EXTENSIONS"],
            }
        ), 400

    upload_folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_folder, exist_ok=True)
    filename = unique_upload_name(file.filename)
    filepath = os.path.join(upload_folder, filename)
    try:
        file.save(filepath)
    except OSError as exc:
        current_app.logger.exception("Saving the upload failed")
        return jsonify({"error": "File upload failed", "details": str(exc)}), 500
    file_size = os.path.getsize(filepath)

    proc_start = time.time()
    target_sr = current_app.config.get("AUDIO_TARGET_SR", 22050)
    try:
        hum = analyze_audio_file(filepath, target_sr=target_sr, keep_analysis=True)
        clean_path = clean_wav(filepath, target_sr=target_sr)
    except AudioInputError as exc:
        _discard(filepath)
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001 - a bug, not a bad file: say so plainly
        current_app.logger.exception("Audio processing failed")
        _discard(filepath)
        return jsonify({"error": "Audio processing failed", "details": str(exc)}), 500

    tempo = sensible_tempo(hum["tempo"])
    current_app.logger.info(
        "upload %s: %d notes, %.1f BPM, %s %s, %+d cents, warnings=%s",
        filename, len(hum["melody"]), tempo, hum["key"], hum["mode"], hum["tuning_cents"], hum["warnings"],
    )
    response_data = {
        "status": "success",
        "message": "File uploaded and processed successfully",
        "filename": filename,
        "clean_filename": os.path.basename(clean_path),
        "size_bytes": file_size,
        "size_mb": round(file_size / (1024 * 1024), 2),
        "saved_path": filepath,
        "melody": to_engine_melody(hum["melody"], tempo),
        "tempo": tempo,
        "key": hum["key"],
        "mode": hum["mode"],
        "melody_seconds": hum["melody"],
        "tuning_cents": hum["tuning_cents"],
        "warnings": hum["warnings"],
        "audio_analysis": hum["analysis"],
        "processing_time_seconds": round(time.time() - proc_start, 3),
        "total_request_time_seconds": round(time.time() - request_start, 3),
    }
    # Audio libraries return NumPy scalars (notably ``numpy.bool`` from pitch voicing), which
    # Flask's JSON provider can't serialize.
    return jsonify(_json_safe(response_data)), 201


def _discard(path):
    try:
        os.remove(path)
    except OSError:
        pass


@bp.route("/piece", methods=["GET"])
def send_new_music():
    return ""
