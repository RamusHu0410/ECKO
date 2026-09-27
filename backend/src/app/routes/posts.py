"""Discussion hub endpoints (Phases D, E, G).

Posts, comments, and likes. A post can optionally showcase one of the
author's own recordings; attaching it shares it with everyone signed in, who
can then play it through GET /api/posts/<id>/audio. (The recording itself stays
private: /api/recordings/<id>/file is still owner-only.)

Any valid Auth0 token for the API may use these; no scopes are required.
"""

import uuid


from flask import Blueprint, jsonify, request

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.auth import require_auth, get_current_user
from app.extensions import db
from app.models import Comment, Post, PostLike, Recording
from app.routes.account import AUDIO_TYPES
from app.storage import get_storage

bp = Blueprint("posts_api", __name__, url_prefix="/api/posts")


def _clamp_pagination():
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        per_page = min(50, max(1, int(request.args.get("per_page", 20))))
    except (TypeError, ValueError):
        per_page = 20
    return page, per_page


@bp.route("", methods=["POST"])
@require_auth()
def create_post():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "'title' is required."}), 400
    content = data.get("content") or ""

    recording_id = data.get("recording_id")
    if recording_id is not None:
        try:
            recording_id = uuid.UUID(str(recording_id))
        except ValueError:
            return jsonify({"error": "'recording_id' must be a recording's id."}), 400
        # Only your OWN recording: someone else's answers 404, like everywhere else, so
        # nobody can find out which recording ids exist.
        recording = db.session.execute(
            db.select(Recording).filter_by(id=recording_id, user_id=user.id)
        ).scalar_one_or_none()
        if recording is None:
            return jsonify({"error": "Recording not found."}), 404

    post = Post(
        user_id=user.id,
        recording_id=recording_id,
        title=title,
        content=content,
    )
    db.session.add(post)
    db.session.commit()
    return jsonify(post.to_dict()), 201


@bp.route("", methods=["GET"])
@require_auth()
def list_posts():
    """Feed, newest first. Supports ?page=&per_page= and ?search=."""
    page, per_page = _clamp_pagination()
    query = db.session.query(Post)

    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Post.title.ilike(like), Post.content.ilike(like)))

    pagination = (
        query.order_by(Post.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
    )
    return jsonify(
        {
            "posts": [p.to_dict() for p in pagination.items],
            "page": page,
            "per_page": per_page,
            "total": pagination.total,
            "pages": pagination.pages,
        }
    )


@bp.route("/<uuid:post_id>", methods=["GET"])
@require_auth()
def get_post(post_id):
    post = db.session.get(Post, post_id)
    if post is None:
        return jsonify({"error": "Post not found."}), 404
    return jsonify(post.to_dict(include_comments=True))


@bp.route("/<uuid:post_id>/audio", methods=["GET"])
@require_auth()
def post_audio(post_id):
    """Streams the recording the post showcases. Any signed-in user may: the author shared it."""
    post = db.session.get(Post, post_id)
    if post is None:
        return jsonify({"error": "Post not found."}), 404
    if post.recording is None:
        return jsonify({"error": "This post has no recording."}), 404
    extension = post.recording.file_path.rsplit(".", 1)[-1]
    response = get_storage().send(post.recording.file_path, mimetype=AUDIO_TYPES.get(extension))
    if response is None:
        return jsonify({"error": "The recording's file is missing."}), 404
    return response


@bp.route("/<uuid:post_id>", methods=["DELETE"])
@require_auth()
def delete_post(post_id):
    user = get_current_user()
    post = db.session.get(Post, post_id)
    if post is None:
        return jsonify({"error": "Post not found."}), 404
    if post.user_id != user.id:
        return jsonify({"error": "You can only delete your own posts."}), 403
    db.session.delete(post)
    db.session.commit()
    return jsonify({"status": "deleted", "id": str(post_id)})


# ----------------------------- Comments --------------------------------

@bp.route("/<uuid:post_id>/comments", methods=["GET"])
@require_auth()
def list_comments(post_id):
    post = db.session.get(Post, post_id)
    if post is None:
        return jsonify({"error": "Post not found."}), 404
    comments = (
        db.session.query(Comment)
        .filter_by(post_id=post_id)
        .order_by(Comment.created_at.asc())
        .all()
    )
    return jsonify([c.to_dict() for c in comments])


@bp.route("/<uuid:post_id>/comments", methods=["POST"])
@require_auth()
def add_comment(post_id):
    user = get_current_user()
    post = db.session.get(Post, post_id)
    if post is None:
        return jsonify({"error": "Post not found."}), 404

    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "'content' is required."}), 400

    comment = Comment(post_id=post_id, user_id=user.id, content=content)
    db.session.add(comment)
    db.session.commit()
    return jsonify(comment.to_dict()), 201


@bp.route("/<uuid:post_id>/comments/<uuid:comment_id>", methods=["DELETE"])
@require_auth()
def delete_comment(post_id, comment_id):
    user = get_current_user()
    comment = db.session.get(Comment, comment_id)
    if comment is None or comment.post_id != post_id:
        return jsonify({"error": "Comment not found."}), 404
    if comment.user_id != user.id:
        return jsonify({"error": "You can only delete your own comments."}), 403
    db.session.delete(comment)
    db.session.commit()
    return jsonify({"status": "deleted", "id": str(comment_id)})


# ------------------------------- Likes ---------------------------------

@bp.route("/<uuid:post_id>/like", methods=["POST"])
@require_auth()
def like_post(post_id):
    user = get_current_user()
    post = db.session.get(Post, post_id)
    if post is None:
        return jsonify({"error": "Post not found."}), 404

    existing = (
        db.session.query(PostLike)
        .filter_by(post_id=post_id, user_id=user.id)
        .one_or_none()
    )
    if existing is not None:
        # Idempotent: already liked.
        return jsonify({"status": "liked", "post_id": str(post_id), "like_count": len(post.likes)})

    like = PostLike(post_id=post_id, user_id=user.id)
    db.session.add(like)
    try:
        db.session.commit()
    except IntegrityError:
        # UNIQUE(post_id, user_id) — raced with a concurrent like.
        db.session.rollback()

    count = db.session.query(PostLike).filter_by(post_id=post_id).count()
    return jsonify({"status": "liked", "post_id": str(post_id), "like_count": count})


@bp.route("/<uuid:post_id>/like", methods=["DELETE"])
@require_auth()
def unlike_post(post_id):
    user = get_current_user()
    like = (
        db.session.query(PostLike)
        .filter_by(post_id=post_id, user_id=user.id)
        .one_or_none()
    )
    if like is not None:
        db.session.delete(like)
        db.session.commit()
    count = db.session.query(PostLike).filter_by(post_id=post_id).count()
    return jsonify({"status": "unliked", "post_id": str(post_id), "like_count": count})
