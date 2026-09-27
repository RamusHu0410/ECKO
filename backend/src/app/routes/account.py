"""The signed-in user's account and saved recordings (Auth0-protected).

GET  /api/me                        -> { id, auth0_id, created_at } (creates the user on first sight)
POST /api/recordings                -> multipart upload: `file` (the FINAL output audio,
                                       never the raw hum) + optional `title`, `style`
GET  /api/recordings                -> the user's recordings, newest first
GET  /api/recordings/<id>/file      -> streams the audio, if the recording is the user's

Every recordings query is filtered by the current user. Someone else's recording
answers 404, exactly like one that doesn't exist, so ids can't be probed.
"""

import uuid

from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

from app.auth import get_current_user, require_auth
from app.extensions import db
from app.models import Recording
from app.storage import get_storage, recording_key

bp = Blueprint("account_api", __name__, url_prefix="/api")

# The formats a finished song may be saved in, and the type each is served back with.
AUDIO_TYPES = {
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
    "ogg": "audio/ogg",
    "webm": "audio/webm",
    "m4a": "audio/mp4",
    "flac": "audio/flac",
}
TITLE_MAX = Recording.title.type.length
STYLE_MAX = Recording.style.type.length


@bp.errorhandler(RequestEntityTooLarge)
def _too_large(_exc):
    limit_mb = (current_app.config.get("MAX_CONTENT_LENGTH") or 0) // (1024 * 1024)
    return jsonify({"error": f"The file is too large (the limit is {limit_mb} MB)."}), 413


@bp.route("/me", methods=["GET"])
@require_auth()
def me():
    return jsonify(get_current_user().to_dict())


@bp.route("/recordings", methods=["POST"])
@require_auth()
def create_recording():
    user = get_current_user()

    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return jsonify({"error": "Send the audio as a multipart form field named 'file'."}), 400
    extension = upload.filename.rsplit(".", 1)[-1].lower() if "." in upload.filename else ""
    if extension not in AUDIO_TYPES:
        return jsonify(
            {"error": f"Unsupported file type '.{extension}'.", "allowed": sorted(AUDIO_TYPES)}
        ), 400

    title = (request.form.get("title") or "").strip() or None
    style = (request.form.get("style") or "").strip() or None
    if title and len(title) > TITLE_MAX:
        return jsonify({"error": f"'title' can be at most {TITLE_MAX} characters."}), 400
    if style and len(style) > STYLE_MAX:
        return jsonify({"error": f"'style' can be at most {STYLE_MAX} characters."}), 400

    # The id is chosen here so the file can be saved under it before the row exists.
    recording_id = uuid.uuid4()
    key = recording_key(user.id, recording_id, extension)
    storage = get_storage()
    if storage.save(upload.stream, key) == 0:
        storage.delete(key)
        return jsonify({"error": "The file is empty."}), 400

    recording = Recording(
        id=recording_id,
        user_id=user.id,
        file_path=key,
        title=title,
        style=style,
        duration_seconds=_duration_seconds(storage.local_path(key)),
    )
    try:
        db.session.add(recording)
        db.session.commit()
    except Exception:
        db.session.rollback()
        storage.delete(key)  # no row points at it, so don't keep it
        raise
    return jsonify(recording.to_dict()), 201


@bp.route("/recordings", methods=["GET"])
@require_auth()
def list_recordings():
    user = get_current_user()
    rows = db.session.execute(
        db.select(Recording)
        .filter_by(user_id=user.id)
        .order_by(Recording.created_at.desc())
    ).scalars()
    return jsonify([row.to_dict() for row in rows])


@bp.route("/recordings/<uuid:recording_id>/file", methods=["GET"])
@require_auth()
def recording_file(recording_id):
    user = get_current_user()
    recording = db.session.execute(
        db.select(Recording).filter_by(id=recording_id, user_id=user.id)
    ).scalar_one_or_none()
    if recording is None:
        return jsonify({"error": "Recording not found."}), 404

    extension = recording.file_path.rsplit(".", 1)[-1]
    response = get_storage().send(recording.file_path, mimetype=AUDIO_TYPES.get(extension))
    if response is None:
        current_app.logger.error("Recording %s has no file at %s", recording.id, recording.file_path)
        return jsonify({"error": "The recording's file is missing."}), 404
    return response


def _duration_seconds(path):
    """The audio's length, or None for a format libsndfile can't read (webm, m4a)."""
    try:
        import soundfile

        return round(soundfile.info(str(path)).duration, 3)
    except Exception:  # noqa: BLE001 - unknown length is fine, it's an optional column
        return None
