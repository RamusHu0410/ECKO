"""Vercel entrypoint: exposes the Flask app built by ``create_app()`` as ``app``.

The root vercel.json runs this file as the "backend" service and sends it every /api/... request.
Locally, keep using ``flask --app src/app:create_app run --port 8000`` behind the Vite proxy.
"""
import os
import re
import sys

_ROOT = os.path.dirname(os.path.abspath(__file__))

# The code imports itself as ``app`` (``from app.extensions import db``), which must resolve to the
# src/app package, not the placeholder backend/app.py sitting next to this file.
for path in (os.path.join(_ROOT, "accompanist"), os.path.join(_ROOT, "src")):
    # Move to the front even if already present (an editable install puts src/ after the root).
    while path in sys.path:
        sys.path.remove(path)
    sys.path.insert(0, path)
sys.modules.pop("app", None)

if os.environ.get("VERCEL"):
    # Set before importing the app: config.py reads these at import time, and its load_dotenv()
    # never overrides a variable that is already set. Values from the Vercel dashboard still win.
    os.environ.setdefault("FLASK_ENV", "production")
    # The deployment is read-only except /tmp.
    os.environ.setdefault("UPLOAD_FOLDER", "/tmp/uploads")
    os.environ.setdefault("RECORDINGS_FOLDER", "/tmp/recordings")

from app import create_app  # noqa: E402

# Flask serves the Auth0 API under /api/... and everything else at the root (/upload, /talk/...).
# Same split as the Vite dev proxy in Frontend/vite.config.ts.
_KEEP_API_PREFIX = re.compile(r"^/api/(me|recordings|posts|users)(/|$)")


class _StripApiPrefix:
    """Turn /api/upload into /upload, as the Vite proxy does in development."""

    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        if (path == "/api" or path.startswith("/api/")) and not _KEEP_API_PREFIX.match(path):
            environ["PATH_INFO"] = path[len("/api"):] or "/"
        return self.wsgi_app(environ, start_response)


app = create_app(os.environ.get("FLASK_ENV", "production"))
app.wsgi_app = _StripApiPrefix(app.wsgi_app)
