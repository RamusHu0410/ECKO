"""Shared fixtures for backend application tests."""

import sys
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT / "src"))
# src/tests is a package (has __init__.py), so pytest's rootdir insertion
# doesn't put this directory itself on sys.path. Sibling test modules like
# talk_fakes.py import each other with bare `import talk_fakes`, so add it
# explicitly.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.__init__ import create_app  # noqa: E402


@pytest.fixture
def app(tmp_path):
    app = create_app("testing")
    app.config.update(TESTING=True, UPLOAD_FOLDER=str(tmp_path), RECORDINGS_FOLDER=str(tmp_path / "recordings"))
    return app


@pytest.fixture
def client(app):
    return app.test_client()
