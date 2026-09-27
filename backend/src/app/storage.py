"""Where recording audio files are kept: on local disk, outside the database.

Routes never touch paths directly. They save and serve files through the object
`get_storage()` returns, by *key* (a relative path like
"recordings/<user_id>/<recording_id>.wav"), and the database stores only that
key. To move to S3/R2 later, write a class with the same three methods
(`save`, `send`, `delete`) and return it from `get_storage()`: `send` would
redirect to a signed URL instead of streaming the file.
"""

import os
import tempfile
from pathlib import Path

from flask import current_app, send_file


def recording_key(user_id, recording_id, extension):
    """The storage key of a recording's output file."""
    return f"recordings/{user_id}/{recording_id}.{extension}"


class LocalStorage:
    def __init__(self, root):
        self.root = Path(root).resolve()

    def _path(self, key):
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):  # a key like "../../etc/passwd"
            raise ValueError(f"Storage key escapes the storage directory: {key!r}")
        return path

    def save(self, stream, key):
        """Write a file-like object to `key`, all or nothing, and return its size in bytes."""
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Write next to the target, then rename: a crash never leaves half a file under the key.
        handle, temporary = tempfile.mkstemp(dir=path.parent, suffix=".part")
        try:
            with os.fdopen(handle, "wb") as out:
                while chunk := stream.read(1024 * 1024):
                    out.write(chunk)
            os.replace(temporary, path)
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise
        return path.stat().st_size

    def local_path(self, key):
        """The file on disk, for reading its audio metadata. Local storage only."""
        return self._path(key)

    def send(self, key, mimetype=None):
        """A response streaming the file, or None when it isn't there."""
        path = self._path(key)
        if not path.is_file():
            return None
        return send_file(path, mimetype=mimetype, conditional=True)

    def delete(self, key):
        self._path(key).unlink(missing_ok=True)


def get_storage():
    return LocalStorage(current_app.config["STORAGE_DIR"])
