"""Public user profile endpoints (Phase F): any signed-in user can see anyone's profile."""

from flask import Blueprint, jsonify

from app.auth import require_auth
from app.extensions import db
from app.models import Post, Recording, User

bp = Blueprint("users_api", __name__, url_prefix="/api/users")


@bp.route("/<username>", methods=["GET"])
@require_auth()
def get_profile(username):
    user = db.session.query(User).filter_by(username=username).one_or_none()
    if user is None:
        return jsonify({"error": "User not found."}), 404

    recording_count = db.session.query(Recording).filter_by(user_id=user.id).count()
    post_count = db.session.query(Post).filter_by(user_id=user.id).count()

    profile = user.to_public_dict()
    profile.update({"recording_count": recording_count, "post_count": post_count})
    # Note: email is intentionally not exposed.
    return jsonify(profile)
