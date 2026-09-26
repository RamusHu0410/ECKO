"""Manual end-to-end test: make an account + store a piece of music.

This exercises the REAL request flow (auth-protected endpoints, auto user
creation, recording generation + persistence) but against a LOCAL sqlite
database and a STUBBED Auth0 verifier, so it needs neither Tiger Cloud nor a
live Auth0 tenant.

Run:
    cd backend/src
    uv run python manual_test_account.py

When TigerData + Auth0 are wired up, the same requests work unchanged — you
just send a real "Authorization: Bearer <token>" header instead of the stub.
"""

import app.auth.dependencies as deps

# --- Stub Auth0 verification: treat the bearer token as the Auth0 "sub" and
#     grant all scopes, so we test app logic rather than token plumbing. ---
ALL_SCOPES = (
    "read:profile write:profile "
    "read:recordings write:recordings delete:recordings "
    "read:posts write:posts delete:posts write:comments delete:comments"
)


def _fake_verify(token, domain, audience, algorithms=("RS256",)):
    return {"sub": token, "scope": ALL_SCOPES, "nickname": token.split("|")[-1]}


deps.verify_jwt = _fake_verify

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402

app = create_app("testing")  # in-memory sqlite
app.config["AUTH0_DOMAIN"] = "stub.auth0.com"
app.config["AUTH0_API_AUDIENCE"] = "https://api.ecko.app"

with app.app_context():
    db.create_all()

client = app.test_client()

# The "token" here stands in for a real Auth0 access token.
MY_TOKEN = "auth0|ramus-test"
HEADERS = {"Authorization": f"Bearer {MY_TOKEN}"}


def show(label, resp):
    print(f"\n=== {label}  ->  HTTP {resp.status_code} ===")
    print(resp.get_json())


# 1) "Make an account": first authenticated call auto-creates the app user.
show("GET /api/me  (auto-creates account)", client.get("/api/me", headers=HEADERS))

# 2) "Store one of my music": generate + persist a recording.
my_song = {
    "title": "My first melody",
    "melody": [
        {"hz": 60, "start": 0, "duration": 1},
        {"hz": 64, "start": 1, "duration": 1},
        {"hz": 67, "start": 2, "duration": 1},
        {"hz": 72, "start": 3, "duration": 1},
    ],
    "key": "C",
    "mode": "major",
    "tempo": 100,
    "style": "piano",
}
show("POST /api/recordings  (store music)", client.post("/api/recordings", json=my_song, headers=HEADERS))

# 3) Confirm it's saved under my account.
show("GET /api/recordings/me  (my library)", client.get("/api/recordings/me", headers=HEADERS))
