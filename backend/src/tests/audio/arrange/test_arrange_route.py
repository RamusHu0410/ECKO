"""The pipeline's HTTP routes (app/routes/pipeline.py): POST /pipeline, GET /pipeline/<id>/song,
GET /pipeline/styles. Part A's real intake runs; FluidSynth is replaced by a tone (fake_render)."""

import shutil
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from app import create_app
from app.audio.arrange.config import STYLES

HUM_WAV = Path(__file__).resolve().parents[2] / "fixtures" / "hum_sample.wav"


@pytest.fixture
def app(tmp_path):
    application = create_app("testing")
    application.config.update(UPLOAD_FOLDER=str(tmp_path / "uploads"), RUNS_DIR=str(tmp_path / "runs"))
    Path(application.config["UPLOAD_FOLDER"]).mkdir()
    return application


@pytest.fixture
def client(app):
    return app.test_client()


def test_a_saved_hum_becomes_a_song(app, client, fake_render):
    shutil.copy(HUM_WAV, Path(app.config["UPLOAD_FOLDER"]) / "hum_1.wav")
    r = client.post("/pipeline", json={"hum": "hum_1.wav", "style": "classical"})
    assert r.status_code == 201, r.get_json()
    body = r.get_json()
    assert body["style"] == "classical" and body["fell_back"] is False
    assert body["song_url"] == f"/pipeline/{body['run_id']}/song"

    song = client.get(body["song_url"])
    assert song.status_code == 200 and song.mimetype == "audio/wav"
    assert (Path(app.config["RUNS_DIR"]) / body["run_id"] / "run.json").is_file()


def test_a_recording_can_be_sent_directly(app, client, fake_render):
    with open(HUM_WAV, "rb") as hum:
        r = client.post("/pipeline", data={"file": (hum, "hum.wav"), "style": "epic"}, content_type="multipart/form-data")
    assert r.status_code == 201, r.get_json()
    assert r.get_json()["style"] == "cinematic"  # "epic" maps to cinematic
    assert list(Path(app.config["UPLOAD_FOLDER"]).iterdir()) == []  # nothing left in uploads


def test_no_style_gets_the_default(app, client, fake_render):
    shutil.copy(HUM_WAV, Path(app.config["UPLOAD_FOLDER"]) / "hum_1.wav")
    assert client.post("/pipeline", json={"hum": "hum_1.wav"}).get_json()["style"] == "pop"


def test_a_silent_recording_is_a_400_with_the_intake_code(client, tmp_path):
    silent = tmp_path / "silent.wav"
    sf.write(str(silent), np.zeros(44_100 * 2), 44_100)
    with open(silent, "rb") as hum:
        r = client.post("/pipeline", data={"file": (hum, "silent.wav")}, content_type="multipart/form-data")
    assert r.status_code == 400
    body = r.get_json()
    assert body["code"] == "silent" and body["step"].startswith("intake")


def test_a_render_failure_is_a_503(app, client, monkeypatch):
    monkeypatch.setenv("SOUNDFONT_PATH", "/nowhere/missing.sf2")
    shutil.copy(HUM_WAV, Path(app.config["UPLOAD_FOLDER"]) / "hum_1.wav")
    r = client.post("/pipeline", json={"hum": "hum_1.wav"})
    assert r.status_code == 503
    assert r.get_json() == {"error": "The arrangement couldn't be turned into sound.", "code": "render_failed", "step": "arrange.render"}


def test_a_missing_hum_is_a_404(client):
    r = client.post("/pipeline", json={"hum": "gone.wav"})
    assert r.status_code == 404 and r.get_json()["code"] == "hum_gone"


def test_a_bad_request_is_a_400(client):
    assert client.post("/pipeline", json={"style": "pop"}).status_code == 400
    assert client.post("/pipeline", json={"hum": "x.wav", "style": 5}).status_code in (400, 404)


@pytest.mark.parametrize("run_id", ["nope", "../../etc/passwd", "20260927-040928-" + "0" * 32])
def test_unknown_songs_are_404(client, run_id):
    assert client.get(f"/pipeline/{run_id}/song").status_code == 404


def test_styles(client):
    body = client.get("/pipeline/styles").get_json()
    assert body["styles"] == ["cinematic", "classical", "modern", "piano", "pop"]
    assert body["default"] == "pop" and body["aliases"]["lullaby"] == "piano"


PAGE_SETTINGS = {"emotion": 0.5, "speed": 0.5, "pitch": 0.5, "style": None,
                 "instruments": [{"name": "synth pad", "role": "lead", "level": "normal", "section": "all"}],
                 "energy": {"start": 0, "end": 0}}


def test_the_page_route_answers_like_talk_song(app, client, fake_render):
    """/pipeline/song takes /talk/song's body and answers with the WAV, so the page needs no other change."""
    shutil.copy(HUM_WAV, Path(app.config["UPLOAD_FOLDER"]) / "hum_1.wav")
    r = client.post("/pipeline/song", json={"hum": "hum_1.wav", "settings": PAGE_SETTINGS})
    assert r.status_code == 200, r.get_data(as_text=True)[:300]
    assert r.mimetype == "audio/wav" and r.headers["Cache-Control"] == "no-store"
    assert r.data[:4] == b"RIFF"
    run = Path(app.config["RUNS_DIR"]) / r.headers["X-Run-Id"]
    log = __import__("json").loads((run / "run.json").read_text())
    assert log["style"] == "cinematic"  # no style picked on the page yet
    assert log["settings"]["lead"] is None  # the page's starting "synth pad" isn't a choice: the ensemble's lead plays
    assert r.headers["X-Ensemble"] in ("orchestra", "band", "electronic", "chamber")


def test_a_settings_change_reuses_the_melody(app, client, fake_render, monkeypatch):
    """Talk mode remakes the song on every change: intake runs once per hum, the arrangement each time."""
    from app.audio import pipeline

    calls = []
    real = pipeline.INTAKES["intake"]
    monkeypatch.setitem(pipeline.INTAKES, "intake", lambda path, run: calls.append(path) or real(path, run))
    shutil.copy(HUM_WAV, Path(app.config["UPLOAD_FOLDER"]) / "hum_1.wav")
    first = client.post("/pipeline/song", json={"hum": "hum_1.wav", "settings": PAGE_SETTINGS})
    faster = client.post("/pipeline/song", json={"hum": "hum_1.wav", "settings": {**PAGE_SETTINGS, "speed": 0.8, "style": "rock"}})
    assert first.status_code == faster.status_code == 200
    assert len(calls) == 1
    runs = Path(app.config["RUNS_DIR"])
    tempos = [__import__("json").loads((runs / r.headers["X-Run-Id"] / "melody_transformed.json").read_text())["tempo_bpm"]
              for r in (first, faster)]
    assert tempos[1] == pytest.approx(tempos[0] * 1.3, abs=0.1)


def test_the_page_route_refusals(app, client, tmp_path):
    assert client.post("/pipeline/song", json={"hum": "gone.wav"}).status_code == 404
    shutil.copy(HUM_WAV, Path(app.config["UPLOAD_FOLDER"]) / "hum_1.wav")
    bad = client.post("/pipeline/song", json={"hum": "hum_1.wav", "settings": "fast please"})  # like /talk/song
    assert bad.status_code == 400 and bad.get_json()["code"] == "bad_settings"
    silent = Path(app.config["UPLOAD_FOLDER"]) / "silent.wav"
    sf.write(str(silent), np.zeros(44_100 * 2), 44_100)
    r = client.post("/pipeline/song", json={"hum": "silent.wav"})
    assert r.status_code == 400 and r.get_json()["code"] == "silent"
    assert "error" in r.get_json()  # what the page shows


def test_the_notes_graph_shows_what_intake_heard_and_what_the_song_plays(app, client, fake_render):
    import json

    shutil.copy(HUM_WAV, Path(app.config["UPLOAD_FOLDER"]) / "hum_1.wav")
    settings = {**PAGE_SETTINGS, "style": "classical", "pitch": 0.75}
    notes = client.post("/pipeline/notes", json={"hum": "hum_1.wav", "settings": settings})
    assert notes.status_code == 200
    body = notes.get_json()
    assert set(body) == {"sung", "played", "contour"} and body["contour"]["segments"]
    assert set(body["sung"][0]) == {"midi", "start", "duration"}

    song = client.post("/pipeline/song", json={"hum": "hum_1.wav", "settings": settings})
    run = Path(app.config["RUNS_DIR"]) / song.headers["X-Run-Id"]
    heard = json.loads((run / "melody.json").read_text())["notes"]
    arranged = json.loads((run / "melody_transformed.json").read_text())["notes"]
    assert [n["midi"] for n in body["sung"]] == [n["pitch"] for n in heard]  # what intake heard
    assert [n["midi"] for n in body["played"]] == [n["pitch"] for n in arranged]  # what the song plays
    assert body["sung"][0]["start"] == body["contour"]["segments"][0]["start"]
    intro_seconds = STYLES["classical"].intro_bars * 4 * 60 / json.loads((run / "melody_transformed.json").read_text())["tempo_bpm"]
    assert body["played"][0]["start"] == pytest.approx(body["sung"][0]["start"] + intro_seconds, abs=0.01)  # after the intro


def test_upload_uses_intake_and_the_song_reuses_its_melody(app, client, fake_render, monkeypatch):
    """/upload runs intake once; /pipeline/song and /pipeline/notes then only arrange."""
    from app.audio import pipeline

    calls = []
    real = pipeline.INTAKES["intake"]
    monkeypatch.setitem(pipeline.INTAKES, "intake", lambda path, run: calls.append(path) or real(path, run))
    with open(HUM_WAV, "rb") as hum:
        upload = client.post("/upload", data={"file": (hum, "recording.wav")}, content_type="multipart/form-data")
    assert upload.status_code == 201, upload.get_json()
    reply = upload.get_json()
    assert reply["run_id"] and reply["melody"] and (reply["key"], reply["mode"]) == ("D", "minor")
    assert client.post("/pipeline/song", json={"hum": reply["filename"], "settings": PAGE_SETTINGS}).status_code == 200
    assert client.post("/pipeline/notes", json={"hum": reply["filename"], "settings": PAGE_SETTINGS}).status_code == 200
    assert len(calls) == 1


def test_each_recording_gets_its_own_band_and_keeps_it(app, client, fake_render, tmp_path):
    """Every recording (even of the same hum) gets a new combination; changing its settings keeps it."""
    ensembles = set()
    for i in range(8):  # the same hum, recorded eight times
        name = f"recording-{i:012x}.wav"
        shutil.copy(HUM_WAV, Path(app.config["UPLOAD_FOLDER"]) / name)
        first = client.post("/pipeline/song", json={"hum": name, "settings": PAGE_SETTINGS})
        again = client.post("/pipeline/song", json={"hum": name, "settings": {**PAGE_SETTINGS, "speed": 0.7}})
        assert first.headers["X-Ensemble"] == again.headers["X-Ensemble"]
        ensembles.add(first.headers["X-Ensemble"])
    assert len(ensembles) >= 2


def test_asking_for_rock_gets_the_band_and_a_chosen_lead_is_kept(app, client, fake_render):
    import json

    shutil.copy(HUM_WAV, Path(app.config["UPLOAD_FOLDER"]) / "hum_1.wav")
    rock = client.post("/pipeline/song", json={"hum": "hum_1.wav", "settings": {**PAGE_SETTINGS, "style": "rock"}})
    assert rock.headers["X-Ensemble"] == "band"
    violin = {**PAGE_SETTINGS, "instruments": [{"name": "violin", "role": "lead", "level": "normal", "section": "all"}]}
    r = client.post("/pipeline/song", json={"hum": "hum_1.wav", "settings": violin})
    log = json.loads((Path(app.config["RUNS_DIR"]) / r.headers["X-Run-Id"] / "run.json").read_text())
    assert log["settings"]["lead"] == 40
    assert next(s for s in log["steps"] if s["step"] == "orchestrate")["instruments"]["melody"] == "Violin"

