"""Run a REAL Auth0 token through the full flow against a local sqlite DB.

- Signature / issuer / audience are validated for real against Auth0 (JWKS).
- Scope checks are relaxed here, because a client-credentials token often has
  no scopes granted. Everything else is the real code path.

Usage:
    cd backend/src
    uv run python manual_real_token.py "<access_token>"
"""

import sys

import app.auth.dependencies as deps

# Neutralize only the scope gate; real token verification still runs.
deps._claims_have_scopes = lambda claims, required: True

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402

TOKEN = sys.argv[1] if len(sys.argv) > 1 else ""
if not TOKEN:
    print("Pass the access token as the first argument.")
    raise SystemExit(1)

app = create_app("testing")  # in-memory sqlite; no TigerData needed
# Use the real Auth0 settings from .env so JWKS/issuer/audience match.
from app.config import Config  # noqa: E402

app.config["AUTH0_DOMAIN"] = Config.AUTH0_DOMAIN
app.config["AUTH0_API_AUDIENCE"] = Config.AUTH0_API_AUDIENCE

with app.app_context():
    db.create_all()

client = app.test_client()
H = {"Authorization": f"Bearer {TOKEN}"}


def show(label, resp):
    print(f"\n=== {label}  ->  HTTP {resp.status_code} ===")
    print(resp.get_json())


show("GET /api/me (make account, real token verified)", client.get("/api/me", headers=H))

song = {
    "title": "My first melody",
    "melody": [
        {"hz": 60, "start": 0, "duration": 1},
        {"hz": 64, "start": 1, "duration": 1},
        {"hz": 67, "start": 2, "duration": 1},
        {"hz": 72, "start": 3, "duration": 1},
    ],
    "key": "C", "mode": "major", "tempo": 100, "style": "piano",
}
show("POST /api/recordings (store music)", client.post("/api/recordings", json=song, headers=H))
show("GET /api/recordings/me (my library)", client.get("/api/recordings/me", headers=H))
