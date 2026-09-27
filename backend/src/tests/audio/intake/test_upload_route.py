"""POST /upload: a recording with no tune in it used to be accepted (201), and the page's next call,
/talk/song, then failed with "400 BAD REQUEST". Now /upload refuses it itself, saying why."""

import os
from io import BytesIO

import numpy as np

from .hum_synth import FIXTURE, write


def _upload(client, path):
    with open(path, "rb") as file:
        return client.post("/upload", data={"file": (BytesIO(file.read()), "recording.wav")}, content_type="multipart/form-data")


def test_a_recording_with_no_tune_is_refused_with_a_reason(client, app, tmp_path_factory):
    silent = write(tmp_path_factory.mktemp("in") / "silent.wav", np.zeros(48000 * 3, dtype=np.float32), rate=48000)
    response = _upload(client, silent)
    assert response.status_code == 400
    reply = response.get_json()
    assert reply["code"] in ("no_tune", "silent")  # intake says which: this one is silence
    assert reply["error"]  # in words for the user
    assert not os.listdir(app.config["UPLOAD_FOLDER"])  # nothing is kept


def test_a_real_hum_is_accepted(client):
    response = _upload(client, FIXTURE)
    assert response.status_code == 201
    assert response.get_json()["melody"]
