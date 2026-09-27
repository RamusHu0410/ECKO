"""The socket part A plugs into: every intake must meet the pipeline contract.

Runs each known intake (the fixture stub, the analyzer bridge, and part A's transcribe_to_melody
as soon as app.audio.intake has it) on a hum and checks what it hands over. When part A lands,
its function is tested here automatically; if it passes, the arrangement half accepts it.
"""

import hashlib

import pretty_midi
import pytest

from app.audio import pipeline
from app.audio.arrange import arrange_and_render
from app.audio.arrange.demo import synthesize_hum
from app.audio.arrange.melody import load_melody


def _intakes():
    import app.audio.intake as intake_module

    found = [("fixture", pipeline._fixture_transcribe), ("analyzer", pipeline._analyzer_transcribe)]
    real = getattr(intake_module, "transcribe_to_melody", None)
    found.append(("part_a", real) if real else pytest.param("part_a", None, marks=pytest.mark.skip("part A hasn't landed yet")))
    return found


@pytest.fixture(scope="module")
def hum(tmp_path_factory):
    from conftest import FIXTURE_JSON

    return synthesize_hum(load_melody(FIXTURE_JSON), tmp_path_factory.mktemp("hum") / "hum_sample.wav")


@pytest.mark.parametrize("name, transcribe", _intakes())
def test_intake_meets_the_contract(name, transcribe, hum, tmp_path, fake_render):
    before = hashlib.sha256(hum.read_bytes()).hexdigest()
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    result = transcribe(str(hum), str(run_dir))

    # MelodyResult: midi_path, json_path, note_count, fell_back, warnings
    assert result.json_path == str(run_dir / "melody.json")
    assert result.midi_path == str(run_dir / "melody_clean.mid")
    assert isinstance(result.fell_back, bool) and isinstance(result.warnings, list)

    melody = load_melody(result.json_path)  # the contract's JSON, validated
    assert result.note_count == len(melody.notes) > 0

    midi = pretty_midi.PrettyMIDI(result.midi_path)
    assert len(midi.instruments) == 1 and midi.instruments[0].program == 0  # one instrument, program 0
    midi_notes = sorted(midi.instruments[0].notes, key=lambda n: n.start)
    assert [n.pitch for n in midi_notes] == [n.pitch for n in melody.notes]  # the same notes
    assert all(a.end_beats <= b.start_beats + 1e-6 for a, b in zip(melody.notes, melody.notes[1:]))  # monophonic
    assert all(abs(n.start_beats * 48 - round(n.start_beats * 48)) < 1e-6 for n in melody.notes)  # quantized

    assert hashlib.sha256(hum.read_bytes()).hexdigest() == before  # the upload is never changed
    assert arrange_and_render(result.json_path, "piano", str(run_dir)).final_wav_path  # B accepts it
