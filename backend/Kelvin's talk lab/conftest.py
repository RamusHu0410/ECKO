"""The lab has its own settings (pytest.ini), virtual environment and keys, so its tests only run
from inside this folder. A test run started from backend/ skips the lab instead of failing on it."""

from pathlib import Path

LAB_DIR = Path(__file__).resolve().parent


def pytest_ignore_collect(collection_path, config):
    return config.rootpath != LAB_DIR
