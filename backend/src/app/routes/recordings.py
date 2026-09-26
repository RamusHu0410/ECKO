"""Recording endpoints (Phase C).

A recording ties a generated accompaniment (melody JSON + MIDI/WAV files) to
an authenticated user. Generation reuses the existing `accompanist` engine.
"""

import os
import uuid

from flask import Blueprint, current_app, jsonify, request, send_file

from accompanist.generate import generate_accompaniment
from accompanist.music.styles import STYLES

from app.auth import require_auth, get_current_user
from app.extensions import db
from app.models import Recording

bp = Blueprint("recordings_api", __name__, url_prefix="/api/recordings")


def _recordings_dir():
    folder = current_app.config["RECORDINGS_FOLDER"]
    os.makedirs(folder, exist_ok=True)
    return folder


@bp.route("", methods=["POST"])
@require_auth("write:recordings")
def create_recording():
    """Generate an accompaniment from a melody and save it for the user.

    Body:
        {
          "title": "My first melody",
          "melody": [ {"hz": 60, "start": 0, "duration": 1}, ... ],
          "key": "C", "mode": "major", "tempo": 100, "style": "piano"
        }
    """
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    melody = data.get("melody")
    if not melody:
        return jsonify({"error": "'melody' array is required."}), 400

    title = (data.get("title") or "Untitled").strip()
    style = data.get("style", "classical")
    if style not in STYLES:
        return jsonify(
            {"error": f"Unknown style '{style}'.", "available_styles": sorted(STYLES.keys())}
        ), 400

    melody_input = {
        "melody": melody,
        "key": data.get("key", "C"),
        "mode": data.get("mode", "major"),
        "tempo": data.get("tempo", 120),
    }

    stem = uuid.uuid4().hex[:12]
    out_dir = _recordings_dir()
    midi_path = os.path.join(out_dir, f"{stem}.mid")

    try:
        result = generate_accompaniment(
            melody_input,
            midi_path,
            style=style,
            key=data.get("key"),
            mode=data.get("mode"),
            tempo=data.get("tempo"),
            render_wav=True,
        )
    except (ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("Recording generation failed")
        return jsonify({"error": "Generation failed", "details": str(exc)}), 500

    recording = Recording(
        user_id=user.id,
        title=title,
        original_melody_json=melody,
        melody_midi_path=result.midi_path,
        audio_path=result.wav_path,
        key=result.key,
        mode=result.mode,
        tempo=int(data.get("tempo") or 120),
        style=style,
        is_public=bool(data.get("is_public", True)),
    )
    db.session.add(recording)
    db.session.commit()

    body = recording.to_detail_dict()
    body["warnings"] = result.warnings
    return jsonify(body), 201


@bp.route("/me", methods=["GET"])
@require_auth("read:recordings")
def my_recordings():
    user = get_current_user()
    rows = (
        db.session.query(Recording)
        .filter_by(user_id=user.id)
        .order_by(Recording.created_at.desc())
        .all()
    )
    return jsonify([r.to_summary_dict() for r in rows])


def _get_owned_or_public(recording_id):
    """Return (recording, error_response). Enforces private-recording access."""
    recording = db.session.get(Recording, recording_id)
    if recording is None:
        return None, (jsonify({"error": "Recording not found."}), 404)
    if not recording.is_public:
        user = get_current_user()
        if recording.user_id != user.id:
            # Don't leak existence of private recordings.
            return None, (jsonify({"error": "Recording not found."}), 404)
    return recording, None


@bp.route("/<int:recording_id>", methods=["GET"])
@require_auth("read:recordings")
def get_recording(recording_id):
    recording, err = _get_owned_or_public(recording_id)
    if err:
        return err
    return jsonify(recording.to_detail_dict())


@bp.route("/<int:recording_id>", methods=["DELETE"])
@require_auth("delete:recordings")
def delete_recording(recording_id):
    user = get_current_user()
    recording = db.session.get(Recording, recording_id)
    if recording is None:
        return jsonify({"error": "Recording not found."}), 404
    if recording.user_id != user.id:
        return jsonify({"error": "You can only delete your own recordings."}), 403

    # Best-effort cleanup of generated files.
    for path in (recording.melody_midi_path, recording.audio_path):
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except OSError:
            current_app.logger.warning("Could not remove file: %s", path)

    db.session.delete(recording)
    db.session.commit()
    return jsonify({"status": "deleted", "id": recording_id})


@bp.route("/<int:recording_id>/audio", methods=["GET"])
@require_auth("read:recordings")
def recording_audio(recording_id):
    recording, err = _get_owned_or_public(recording_id)
    if err:
        return err
    if not recording.audio_path or not os.path.exists(recording.audio_path):
        return jsonify({"error": "Audio not available for this recording."}), 404
    return send_file(recording.audio_path, mimetype="audio/wav")


@bp.route("/<int:recording_id>/midi", methods=["GET"])
@require_auth("read:recordings")
def recording_midi(recording_id):
    recording, err = _get_owned_or_public(recording_id)
    if err:
        return err
    if not recording.melody_midi_path or not os.path.exists(recording.melody_midi_path):
        return jsonify({"error": "MIDI not available for this recording."}), 404
    return send_file(recording.melody_midi_path, mimetype="audio/midi")
