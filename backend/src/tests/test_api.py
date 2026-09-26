"""Integration tests for the Auth0 + TigerData app layer.

These run against an in-memory SQLite database and a stubbed Auth0 verifier,
so they need no live Tiger Cloud service or Auth0 tenant. They validate the
request wiring, ownership rules, and the like/comment constraints.
"""

import pytest

from app import create_app
from app.extensions import db


@pytest.fixture
def app(monkeypatch, tmp_path):
    # Stub Auth0 token verification: the "token" is treated as the sub claim,
    # and we grant all scopes so route logic (not auth plumbing) is exercised.
    import app.auth.dependencies as deps

    ALL_SCOPES = " ".join(
        [
            "read:profile",
            "write:profile",
            "read:recordings",
            "write:recordings",
            "delete:recordings",
            "read:posts",
            "write:posts",
            "delete:posts",
            "write:comments",
            "delete:comments",
        ]
    )

    def fake_verify(token, domain, audience, algorithms=("RS256",)):
        return {"sub": token, "scope": ALL_SCOPES, "nickname": token.split("|")[-1]}

    monkeypatch.setattr(deps, "verify_jwt", fake_verify)

    application = create_app("testing")
    application.config["AUTH0_DOMAIN"] = "test.auth0.com"
    application.config["AUTH0_API_AUDIENCE"] = "https://api.test"
    application.config["RECORDINGS_FOLDER"] = str(tmp_path / "recordings")  # not the real recordings/
    with application.app_context():
        db.create_all()
    return application


@pytest.fixture
def client(app):
    return app.test_client()


def auth(sub):
    return {"Authorization": f"Bearer {sub}"}


def test_me_requires_token(client):
    assert client.get("/api/me").status_code == 401


def test_me_autocreates_user(client):
    r = client.get("/api/me", headers=auth("auth0|alice"))
    assert r.status_code == 200
    assert r.get_json()["auth0_id"] == "auth0|alice"


def test_recording_and_post_flow(client):
    # Alice creates a recording
    body = {"title": "My first melody", "melody": [{"hz": 60, "start": 0, "duration": 1}],
            "key": "C", "mode": "major", "tempo": 100, "style": "piano"}
    r = client.post("/api/recordings", json=body, headers=auth("auth0|alice"))
    assert r.status_code == 201, r.get_json()
    rec_id = r.get_json()["id"]

    # Alice can post attaching her own recording
    r = client.post("/api/posts", json={"title": "Cinematic", "content": "emotional", "recording_id": rec_id},
                    headers=auth("auth0|alice"))
    assert r.status_code == 201
    post_id = r.get_json()["id"]

    # Bob cannot attach Alice's recording
    r = client.post("/api/posts", json={"title": "Steal", "recording_id": rec_id},
                    headers=auth("auth0|bob"))
    assert r.status_code == 403


def test_like_is_idempotent_and_unique(client):
    client.get("/api/me", headers=auth("auth0|alice"))
    r = client.post("/api/posts", json={"title": "hi"}, headers=auth("auth0|alice"))
    post_id = r.get_json()["id"]

    r1 = client.post(f"/api/posts/{post_id}/like", headers=auth("auth0|bob"))
    r2 = client.post(f"/api/posts/{post_id}/like", headers=auth("auth0|bob"))
    assert r1.get_json()["like_count"] == 1
    assert r2.get_json()["like_count"] == 1  # no double-like

    client.delete(f"/api/posts/{post_id}/like", headers=auth("auth0|bob"))
    r = client.get(f"/api/posts/{post_id}", headers=auth("auth0|alice"))
    assert r.get_json()["like_count"] == 0


def test_comment_and_feed(client):
    r = client.post("/api/posts", json={"title": "post"}, headers=auth("auth0|alice"))
    post_id = r.get_json()["id"]
    client.post(f"/api/posts/{post_id}/comments", json={"content": "great transition"},
                headers=auth("auth0|bob"))
    r = client.get(f"/api/posts/{post_id}", headers=auth("auth0|alice"))
    assert r.get_json()["comment_count"] == 1

    feed = client.get("/api/posts?search=post", headers=auth("auth0|alice")).get_json()
    assert feed["total"] >= 1


def test_profile_counts(client):
    client.post("/api/posts", json={"title": "p1"}, headers=auth("auth0|carol"))
    me = client.get("/api/me", headers=auth("auth0|carol")).get_json()
    prof = client.get(f"/api/users/{me['username']}", headers=auth("auth0|carol")).get_json()
    assert prof["post_count"] == 1
    assert "email" not in prof
