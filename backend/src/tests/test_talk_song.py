"""How the song settings are translated for the accompanist engine. No audio rendering needed."""

import pytest
from accompanist.music.accompaniment import INSTRUMENTS
from accompanist.music.styles import STYLES

from app.talk.settings import SongSettings
from app.talk.song import ENGINE_INSTRUMENT_FOR, ENGINE_STYLE_FOR, INSTRUMENT_FOR_STYLE, UNKNOWN_STYLE, engine_request, notes_from

# What analyze_audio_file returns for a hum: MIDI notes with times in seconds, and a tempo
HUM = {"melody": [{"hz": 60.2, "start": 0.0, "duration": 0.5}, {"hz": 64.0, "start": 0.6, "duration": 0.9}], "tempo": 120.0}


def test_middle_settings_keep_the_hum_as_it_was():
    request = engine_request(HUM, SongSettings())
    assert request["tempo"] == 120.0
    # at 120 BPM a beat lasts half a second, so seconds × 2 = beats
    assert request["melody"] == [{"hz": 60.2, "start": 0.0, "duration": 1.0}, {"hz": 64.0, "start": 1.2, "duration": 1.8}]
    assert request["instrument"] == "piano"
    assert "style" not in request and "mode" not in request  # the engine's own default style; mode from the hum


@pytest.mark.parametrize(("speed", "tempo"), [(0.0, 60.0), (0.7, 144.0), (1.0, 180.0)])
def test_speed_scales_the_hums_tempo(speed, tempo):
    request = engine_request(HUM, SongSettings(speed=speed))
    assert request["tempo"] == tempo
    assert request["melody"][1]["start"] == 1.2  # the rhythm in beats never changes, only how fast they go


@pytest.mark.parametrize(("pitch", "shift"), [(0.0, -12), (0.4, -2), (0.5, 0), (1.0, 12)])
def test_pitch_moves_the_tune(pitch, shift):
    assert engine_request(HUM, SongSettings(pitch=pitch))["melody"][0]["hz"] == pytest.approx(60.2 + shift)


@pytest.mark.parametrize(("emotion", "mode"), [(0.1, "minor"), (0.39, "minor"), (0.5, None), (0.61, "major")])
def test_emotion_picks_minor_or_major(emotion, mode):
    assert engine_request(HUM, SongSettings(emotion=emotion)).get("mode") == mode


def test_unmeasurable_hum_tempo_falls_back_to_100():
    request = engine_request({**HUM, "tempo": 0.0}, SongSettings())
    assert request["tempo"] == 100.0
    assert request["melody"][1]["start"] == pytest.approx(1.0)  # 0.6 s at 100 BPM


def test_style_and_instrument_words():
    assert engine_request(HUM, SongSettings(style="rock"))["style"] == "pop"
    assert engine_request(HUM, SongSettings(style="rock"))["instrument"] == "guitar_clean"
    assert engine_request(HUM, SongSettings(style="polka"))["style"] == UNKNOWN_STYLE
    assert engine_request(HUM, SongSettings(style="jazz", extras=("drums", "strings")))["instrument"] == "strings"


def test_every_word_maps_to_something_the_engine_knows():
    assert set(ENGINE_STYLE_FOR.values()) | {UNKNOWN_STYLE} <= set(STYLES)
    assert set(ENGINE_INSTRUMENT_FOR.values()) | set(INSTRUMENT_FOR_STYLE.values()) <= set(INSTRUMENTS)


def test_notes_graph_shows_what_was_sung_and_what_plays():
    middle = notes_from(HUM, SongSettings())
    assert middle["sung"] == [{"midi": 60.2, "start": 0.0, "duration": 0.5}, {"midi": 64.0, "start": 0.6, "duration": 0.9}]
    assert middle["played"] == middle["sung"]  # at the middle settings the song plays the hum as sung
    moved = notes_from(HUM, SongSettings(speed=1.0, pitch=0.6))
    assert moved["played"][1] == {"midi": 66.0, "start": 0.4, "duration": 0.6}  # 2 semitones up, 1.5 times as fast
    assert moved["sung"] == middle["sung"]
