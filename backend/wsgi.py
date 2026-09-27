"""Vercel entrypoint: exposes the Flask app built by ``create_app()`` as ``app``.

Vercel runs this file as the backend function and sends it every /api/... request.
Locally, keep using ``flask --app src/app:create_app run --port 8000`` behind the Vite proxy.
"""
import json
import os
import re
import sys
import tempfile
import traceback

_ROOT = os.path.dirname(os.path.abspath(__file__))
_TMP = tempfile.gettempdir()

# The code imports itself as ``app`` (``from app.extensions import db``), which must resolve to the
# src/app package, not the placeholder backend/app.py sitting next to this file.
for path in (os.path.join(_ROOT, "accompanist"), os.path.join(_ROOT, "src")):
    # Move to the front even if already present (an editable install puts src/ after the root).
    while path in sys.path:
        sys.path.remove(path)
    sys.path.insert(0, path)
sys.modules.pop("app", None)


def _use_writable_dir(name, fallback):
    """Keep the configured folder if it can be written to, otherwise switch to one under /tmp."""
    value = os.environ.get(name)
    if value:
        try:
            os.makedirs(value, exist_ok=True)
            if os.access(value, os.W_OK):
                return
        except OSError:
            pass
    os.environ[name] = fallback


# On Vercel the code is read-only except /tmp. Don't rely only on the VERCEL variable: it's missing
# at runtime when "Automatically expose System Environment Variables" is off.
if os.environ.get("VERCEL") or not os.access(_ROOT, os.W_OK):
    # Set before importing the app: config.py reads these at import time, and its load_dotenv()
    # never overrides a variable that is already set.
    os.environ.setdefault("FLASK_ENV", "production")
    # Also replaces values like RECORDINGS_FOLDER=./recordings copied from a local .env.
    _use_writable_dir("UPLOAD_FOLDER", os.path.join(_TMP, "uploads"))
    _use_writable_dir("RECORDINGS_FOLDER", os.path.join(_TMP, "recordings"))
    # librosa compiles with numba's cache=True, which writes next to the package by default. On a
    # read-only filesystem that fails at `import librosa` ("no locator available for file").
    _use_writable_dir("NUMBA_CACHE_DIR", os.path.join(_TMP, "numba_cache"))
    _use_writable_dir("MPLCONFIGDIR", os.path.join(_TMP, "matplotlib"))

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


def _redact(text):
    """Hide secrets that an error message might quote (connection strings, API keys)."""
    for name, value in os.environ.items():
        if value and len(value) >= 8 and re.search(r"KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL", name):
            text = text.replace(value, f"<{name}>")
    return re.sub(r"://[^/\s:@]+:[^/\s@]+@", "://<user>:<password>@", text)


def _startup_failed(error):
    """A stand-in app that answers every request with why the real one couldn't start.

    Without it Vercel only shows FUNCTION_INVOCATION_FAILED; this puts the reason in the browser.
    """
    traceback.print_exc()  # full traceback in the Vercel runtime logs
    body = json.dumps({
        "error": "The backend failed to start.",
        "reason": _redact(f"{type(error).__name__}: {error}"),
    }).encode()

    def failed_app(environ, start_response):
        start_response("503 Service Unavailable", [
            ("Content-Type", "application/json"),
            ("Content-Length", str(len(body))),
        ])
        return [body]

    return failed_app


try:
    from app import create_app

    app = create_app(os.environ.get("FLASK_ENV", "production"))
    app.wsgi_app = _StripApiPrefix(app.wsgi_app)
except Exception as exc:  # noqa: BLE001 - report it instead of crashing every request
    app = _startup_failed(exc)
