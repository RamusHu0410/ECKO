"""Auth-related endpoints (Auth0 identity milestone).

GET /api/me
    Requires a valid Auth0 bearer token. On first call for a given Auth0
    identity, the application user is auto-created (Phase 5).
"""

from flask import Blueprint, jsonify

from app.auth import require_auth, get_current_user

bp = Blueprint("auth_api", __name__, url_prefix="/api")


@bp.route("/me", methods=["GET"])
@require_auth()
def me():
    user = get_current_user()
    return jsonify(
        {
            "auth0_id": user.auth0_id,
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "joined_at": user.created_at.isoformat() if user.created_at else None,
        }
    )
