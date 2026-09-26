import pytest
import numpy as np
from src.app.audio.processor import (
    AudioProcessor,
    analyze_audio_file,
    quick_analyze,
    extract_notes,
    load_and_process_wav,
    _estimate_key_and_mode,
    _estimate_tempo,
    _build_melody,
)


def test_audio_processor_init():
    processor = AudioProcessor()
    assert processor is not None
    assert hasattr(processor, "target_sr")


def test_audio_processor_init_with_custom_params():
    processor = AudioProcessor(target_sr=44100, hop_length=1024, frame_length=4096)
    assert processor.target_sr == 44100
    assert processor.hop_length == 1024
    assert processor.frame_length == 4096


def test_audio_processor_check_dependencies():
    processor = AudioProcessor()
    processor._check_dependencies()


def test_estimate_key_and_mode():
    audio = np.zeros(22050)
    key, mode = _estimate_key_and_mode(audio, 22050)
    assert isinstance(key, str)
    assert isinstance(mode, str)


def test_estimate_tempo():
    audio = np.zeros(22050)
    tempo = _estimate_tempo(audio, 22050)
    assert isinstance(tempo, float)


def test_build_melody():
    analysis = {
        "segments": [],
        "pitch": [],
        "volume": [],
        "spectral": {},
    }
    melody = _build_melody(analysis)
    assert isinstance(melody, list)


def test_quick_analyze():
    result = quick_analyze("tests/fixtures/test.wav")
    assert isinstance(result, dict)


def test_load_and_process_wav(tmp_path):
    result = load_and_process_wav(str(tmp_path / "test.wav"))
    assert isinstance(result, dict)


def test_extract_notes():
    notes = extract_notes("tests/fixtures/test.wav")
    assert isinstance(notes, list)
