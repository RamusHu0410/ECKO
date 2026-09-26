"""Real Auth0 token checks, end to end through GET /api/me.

test_api.py swaps verify_jwt out entirely; here nothing is stubbed except the network. Tokens are
signed with a throwaway RSA key, and the tenant's JWKS URL (fetched with urlopen) serves its
public half, so the signature, `kid`, algorithm, expiry, issuer and audience checks all run for real.
"""

import base64
import io
import json
import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from flask import Blueprint, jsonify
from jose import jwt

import app.auth.jwt as auth_jwt
from app import create_app
from app.auth import require_auth
from app.extensions import db

DOMAIN = "ecko-test.eu.auth0.com"
AUDIENCE = "https://api.ecko.test"
KID = "test-key-1"


def _private_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _pem(key) -> bytes:
    return key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())


def _b64url(number: int) -> str:
    return base64.urlsafe_b64encode(number.to_bytes((number.bit_length() + 7) // 8, "big")).rstrip(b"=").decode()


def _jwk(key, kid=KID) -> dict:
    public = key.public_key().public_numbers()
    return {"kty": "RSA", "kid": kid, "use": "sig", "alg": "RS256", "n": _b64url(public.n), "e": _b64url(public.e)}


SIGNING_KEY = _private_key()
OTHER_KEY = _private_key()


def token(key=SIGNING_KEY, kid=KID, algorithm="RS256", **overrides) -> str:
    now = int(time.time())
    claims = {"sub": "auth0|alice", "iss": f"https://{DOMAIN}/", "aud": AUDIENCE, "iat": now, "exp": now + 600, **overrides}
    secret = _pem(key) if algorithm.startswith("RS") else "not-the-rsa-key"
    return jwt.encode(claims, secret, algorithm=algorithm, headers={"kid": kid})


@pytest.fixture
def jwks_fetches(monkeypatch):
    """The tenant's /.well-known/jwks.json, served from memory. Records every URL fetched."""
    fetched = []

    def fake_urlopen(url, timeout=None):
        fetched.append(url)
        return io.BytesIO(json.dumps({"keys": [_jwk(SIGNING_KEY)]}).encode())

    monkeypatch.setattr(auth_jwt, "urlopen", fake_urlopen)
    monkeypatch.setattr(auth_jwt, "_JWKS_CACHE", {"keys": None, "fetched_at": 0.0})
    return fetched


@pytest.fixture
def client(jwks_fetches, tmp_path):
    app = create_app("testing")
    app.config.update(AUTH0_DOMAIN=DOMAIN, AUTH0_API_AUDIENCE=AUDIENCE, RECORDINGS_FOLDER=str(tmp_path / "recordings"))

    scoped = Blueprint("scoped_test", __name__)

    @scoped.get("/test/needs-scope")
    @require_auth("read:recordings")
    def needs_scope():
        return jsonify({"ok": True})

    app.register_blueprint(scoped)
    with app.app_context():
        db.create_all()
    return app.test_client()


def bearer(value: str) -> dict:
    return {"Authorization": f"Bearer {value}"}


def test_a_valid_token_reaches_the_route(client):
    reply = client.get("/api/me", headers=bearer(token()))
    assert reply.status_code == 200
    assert reply.get_json()["auth0_id"] == "auth0|alice"


@pytest.mark.parametrize(
    ("headers", "code"),
    [
        ({}, "authorization_header_missing"),
        ({"Authorization": "Basic dXNlcjpwYXNz"}, "invalid_header"),
        ({"Authorization": "Bearer"}, "invalid_header"),
        (bearer("not-a-jwt"), "invalid_header"),
        (bearer(token(exp=int(time.time()) - 60)), "token_expired"),
        (bearer(token(key=OTHER_KEY)), "invalid_token"),  # right kid, wrong key: bad signature
        (bearer(token(iss="https://someone-else.auth0.com/")), "invalid_claims"),
        (bearer(token(aud="https://another-api.example")), "invalid_claims"),
        (bearer(token(kid="unknown-kid")), "invalid_header"),
        (bearer(token(algorithm="HS256")), "invalid_token"),  # only RS256 is accepted
    ],
    ids=["missing", "not-bearer", "empty-bearer", "garbage", "expired", "bad-signature", "wrong-issuer", "wrong-audience", "unknown-kid", "hs256"],
)
def test_a_bad_or_missing_token_is_a_401_with_a_json_reason(client, headers, code):
    reply = client.get("/api/me", headers=headers)
    assert reply.status_code == 401
    assert reply.get_json()["code"] == code
    assert reply.get_json()["description"]


def test_the_jwks_is_fetched_once_and_cached(client, jwks_fetches):
    for _ in range(3):
        assert client.get("/api/me", headers=bearer(token())).status_code == 200
    assert jwks_fetches == [f"https://{DOMAIN}/.well-known/jwks.json"]


def test_a_new_signing_key_is_picked_up_without_waiting_for_the_cache(client, jwks_fetches, monkeypatch):
    """Auth0 rotates keys; a token with a kid the cached JWKS doesn't know refetches it once."""
    assert client.get("/api/me", headers=bearer(token())).status_code == 200
    rotated = _private_key()

    def fake_urlopen(url, timeout=None):
        jwks_fetches.append(url)
        return io.BytesIO(json.dumps({"keys": [_jwk(SIGNING_KEY), _jwk(rotated, kid="rotated")]}).encode())

    monkeypatch.setattr(auth_jwt, "urlopen", fake_urlopen)
    auth_jwt._JWKS_CACHE["fetched_at"] -= auth_jwt._JWKS_MIN_REFRESH_SECONDS + 1  # the last fetch was a moment ago
    assert client.get("/api/me", headers=bearer(token(key=rotated, kid="rotated"))).status_code == 200
    assert len(jwks_fetches) == 2


def test_unknown_kids_cannot_make_every_request_refetch_the_jwks(client, jwks_fetches):
    for _ in range(5):
        assert client.get("/api/me", headers=bearer(token(kid="made-up"))).status_code == 401
    assert len(jwks_fetches) == 1


def test_scopes_are_still_enforced_where_a_route_asks_for_them(client):
    assert client.get("/test/needs-scope", headers=bearer(token())).status_code == 403
    assert client.get("/test/needs-scope", headers=bearer(token(scope="read:recordings"))).status_code == 200
