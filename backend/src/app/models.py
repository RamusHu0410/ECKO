"""SQLAlchemy models for the ECKO application data (stored in TigerData/Postgres).

Architectural rule: Auth0 owns identity. We NEVER store passwords here.
Every application user is linked to an Auth0 identity through `auth0_id`
(the Auth0 "sub" claim, e.g. "auth0|abc123").
"""

from datetime import datetime, timezone

from sqlalchemy import UniqueConstraint

from app.extensions import db


def _utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    # Auth0 "sub" claim — the link between the authenticated person and app data.
    auth0_id = db.Column(db.String(255), unique=True, nullable=False, index=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(120))
    avatar_url = db.Column(db.String(512))
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)

    recordings = db.relationship(
        "Recording", back_populates="user", cascade="all, delete-orphan"
    )
    posts = db.relationship(
        "Post", back_populates="user", cascade="all, delete-orphan"
    )
    comments = db.relationship(
        "Comment", back_populates="user", cascade="all, delete-orphan"
    )
    likes = db.relationship(
        "PostLike", back_populates="user", cascade="all, delete-orphan"
    )

    def to_public_dict(self):
        return {
            "username": self.username,
            "display_name": self.display_name,
            "avatar_url": self.avatar_url,
            "joined_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<User {self.username} ({self.auth0_id})>"


class Recording(db.Model):
    __tablename__ = "recordings"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = db.Column(db.String(200), nullable=False)
    # The raw melody the user submitted, stored as JSON.
    original_melody_json = db.Column(db.JSON)
    melody_midi_path = db.Column(db.String(512))
    audio_path = db.Column(db.String(512))
    key = db.Column(db.String(8))
    mode = db.Column(db.String(16))
    tempo = db.Column(db.Integer)
    style = db.Column(db.String(32))
    is_public = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)

    user = db.relationship("User", back_populates="recordings")
    posts = db.relationship("Post", back_populates="recording")

    def to_summary_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "key": self.key,
            "mode": self.mode,
            "tempo": self.tempo,
            "style": self.style,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_detail_dict(self):
        data = self.to_summary_dict()
        data.update(
            {
                "user_id": self.user_id,
                "melody": self.original_melody_json,
                "is_public": self.is_public,
                "audio_url": f"/api/recordings/{self.id}/audio" if self.audio_path else None,
                "midi_url": f"/api/recordings/{self.id}/midi" if self.melody_midi_path else None,
            }
        )
        return data


class Post(db.Model):
    __tablename__ = "posts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Optional: a post may showcase a generated recording.
    recording_id = db.Column(
        db.Integer, db.ForeignKey("recordings.id", ondelete="SET NULL"), nullable=True
    )
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    user = db.relationship("User", back_populates="posts")
    recording = db.relationship("Recording", back_populates="posts")
    comments = db.relationship(
        "Comment", back_populates="post", cascade="all, delete-orphan"
    )
    likes = db.relationship(
        "PostLike", back_populates="post", cascade="all, delete-orphan"
    )

    def to_dict(self, include_comments=False):
        data = {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "author": self.user.to_public_dict() if self.user else None,
            "recording": None,
            "like_count": len(self.likes),
            "comment_count": len(self.comments),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if self.recording:
            data["recording"] = {
                "id": self.recording.id,
                "title": self.recording.title,
                "audio_url": f"/api/recordings/{self.recording.id}/audio"
                if self.recording.audio_path
                else None,
            }
        if include_comments:
            data["comments"] = [c.to_dict() for c in sorted(self.comments, key=lambda c: c.created_at)]
        return data


class Comment(db.Model):
    __tablename__ = "comments"

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(
        db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)

    post = db.relationship("Post", back_populates="comments")
    user = db.relationship("User", back_populates="comments")

    def to_dict(self):
        return {
            "id": self.id,
            "content": self.content,
            "author": self.user.to_public_dict() if self.user else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PostLike(db.Model):
    __tablename__ = "post_likes"
    __table_args__ = (
        # A user can't like the same post twice.
        UniqueConstraint("post_id", "user_id", name="uq_post_like"),
    )

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(
        db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)

    post = db.relationship("Post", back_populates="likes")
    user = db.relationship("User", back_populates="likes")
