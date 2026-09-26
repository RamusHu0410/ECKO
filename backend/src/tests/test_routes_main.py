import os
import tempfile

from src.app.routes.main import _json_safe, allowed_file


def test_json_safe_with_string():
    assert _json_safe("hello") == "hello"


def test_json_safe_with_int():
    assert _json_safe(42) == 42


def test_json_safe_with_float():
    assert _json_safe(3.14) == 3.14


def test_json_safe_with_bool():
    assert _json_safe(True) is True
    assert _json_safe(False) is False


def test_json_safe_with_none():
    assert _json_safe(None) is None


def test_json_safe_with_numpy_bool():
    import numpy as np
    result = _json_safe(np.bool_(True))
    assert result is True


def test_json_safe_with_numpy_int():
    import numpy as np
    result = _json_safe(np.int64(42))
    assert result == 42


def test_allowed_file_wav():
    assert allowed_file("test.wav") is True


def test_allowed_file_mp3():
    assert allowed_file("test.mp3") is False


def test_allowed_file_no_extension():
    assert allowed_file("test") is False


def test_allowed_file_hidden():
    assert allowed_file(".wav") is False
