"""Shared fixtures for backend application tests."""

import sys
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT / "src"))

from app.__init__ import create_app  # noqa: E402


@pytest.fixture
def app(tmp_path):
    app = create_app("testing")
    app.config.update(TESTING=True, UPLOAD_FOLDER=str(tmp_path))
    return app


@pytest.fixture
def client(app):
    return app.test_client()
