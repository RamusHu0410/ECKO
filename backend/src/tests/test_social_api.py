"""The discussion hub (app/routes/posts.py) and public profiles (app/routes/users.py).

Same setup as test_account_api.py: in-memory SQLite, and the bearer "token" is the user's sub.
"""

import uuid

import pytest

from test_account_api import app, auth, client, upload  # noqa: F401 - fixtures


def post(client, sub, **body):
    return client.post("/api/posts", json=body, headers=auth(sub))


def test_post_with_own_recording_shares_its_audio(client):
    recording = upload(client, "auth0|alice", title="Cinematic").get_json()
    r = post(client, "auth0|alice", title="Listen", content="emotional", recording_id=recording["id"])
    assert r.status_code == 201, r.get_json()
    created = r.get_json()
    assert created["author"]["username"] == "auth0_alice"
    assert "auth0_id" not in created["author"] and "id" not in created["author"]
    assert created["recording"]["title"] == "Cinematic"

    # Bob can't open Alice's recording directly, but can play it through her post.
    assert client.get(recording["file_url"], headers=auth("auth0|bob")).status_code == 404
    r = client.get(created["recording"]["audio_url"], headers=auth("auth0|bob"))
    assert r.status_code == 200
    assert r.mimetype == "audio/wav"


def test_cannot_attach_someone_elses_recording(client):
    recording = upload(client, "auth0|alice").get_json()
    r = post(client, "auth0|bob", title="Steal", recording_id=recording["id"])
    assert r.status_code == 404  # like every other user's id: indistinguishable from missing
    assert post(client, "auth0|bob", title="Bad", recording_id="nope").status_code == 400


def test_post_without_recording_has_no_audio(client):
    created = post(client, "auth0|alice", title="Words only").get_json()
    assert created["recording"] is None
    assert client.get(f"/api/posts/{created['id']}/audio", headers=auth("auth0|alice")).status_code == 404


def test_post_needs_a_title(client):
    assert post(client, "auth0|alice", content="no title").status_code == 400


def test_like_is_idempotent_and_unique(client):
    post_id = post(client, "auth0|alice", title="hi").get_json()["id"]

    r1 = client.post(f"/api/posts/{post_id}/like", headers=auth("auth0|bob"))
    r2 = client.post(f"/api/posts/{post_id}/like", headers=auth("auth0|bob"))
    assert r1.get_json()["like_count"] == 1
    assert r2.get_json()["like_count"] == 1  # no double-like
    assert r2.get_json()["post_id"] == post_id

    client.delete(f"/api/posts/{post_id}/like", headers=auth("auth0|bob"))
    assert client.get(f"/api/posts/{post_id}", headers=auth("auth0|alice")).get_json()["like_count"] == 0


def test_comments_and_feed(client):
    post_id = post(client, "auth0|alice", title="post").get_json()["id"]
    r = client.post(f"/api/posts/{post_id}/comments", json={"content": "great transition"}, headers=auth("auth0|bob"))
    assert r.status_code == 201
    comment_id = r.get_json()["id"]

    detail = client.get(f"/api/posts/{post_id}", headers=auth("auth0|alice")).get_json()
    assert detail["comment_count"] == 1
    assert detail["comments"][0]["author"]["username"] == "auth0_bob"

    # Only the author can delete a comment.
    assert client.delete(f"/api/posts/{post_id}/comments/{comment_id}", headers=auth("auth0|alice")).status_code == 403
    assert client.delete(f"/api/posts/{post_id}/comments/{comment_id}", headers=auth("auth0|bob")).status_code == 200

    feed = client.get("/api/posts?search=post", headers=auth("auth0|alice")).get_json()
    assert feed["total"] == 1
    assert feed["posts"][0]["id"] == post_id


def test_only_the_author_deletes_a_post(client):
    post_id = post(client, "auth0|alice", title="mine").get_json()["id"]
    assert client.delete(f"/api/posts/{post_id}", headers=auth("auth0|bob")).status_code == 403
    r = client.delete(f"/api/posts/{post_id}", headers=auth("auth0|alice"))
    assert r.get_json() == {"status": "deleted", "id": post_id}
    assert client.get(f"/api/posts/{post_id}", headers=auth("auth0|alice")).status_code == 404


def test_unknown_post_is_404(client):
    missing = uuid.uuid4()
    assert client.get(f"/api/posts/{missing}", headers=auth("auth0|alice")).status_code == 404
    assert client.post(f"/api/posts/{missing}/like", headers=auth("auth0|alice")).status_code == 404


def test_profile_counts(client):
    upload(client, "auth0|carol")
    post(client, "auth0|carol", title="p1")
    me = client.get("/api/me", headers=auth("auth0|carol")).get_json()
    profile = client.get(f"/api/users/{me['username']}", headers=auth("auth0|bob")).get_json()
    assert profile["post_count"] == 1
    assert profile["recording_count"] == 1
    assert "email" not in profile and "auth0_id" not in profile


@pytest.mark.parametrize(
    "method, path",
    [("GET", "/api/posts"), ("POST", "/api/posts"), ("GET", f"/api/posts/{uuid.uuid4()}/audio"), ("GET", "/api/users/anyone")],
)
def test_unauthenticated_is_401(client, method, path):
    assert client.open(path, method=method).status_code == 401
