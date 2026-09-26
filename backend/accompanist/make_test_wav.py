"""Generate a test.wav so you can listen to the full pipeline output.

Runs an 8-bar demo melody through generate_accompaniment() and renders it to
WAV using the existing Phase-3 FluidSynth renderer.

Usage:
    .venv/bin/python make_test_wav.py                 # default: classical style
    .venv/bin/python make_test_wav.py pop             # pick a style
    .venv/bin/python make_test_wav.py cinematic out.wav
"""

from __future__ import annotations

import sys

from accompanist.generate import generate_accompaniment

# An 8-bar C-major melody (4 quarter notes per bar), chord-tone content that
# yields the C F G C Am F G C progression.
_BAR_PITCHES = {
    0: [60, 64, 67, 72],  # C
    1: [65, 69, 72, 69],  # F
    2: [67, 71, 74, 67],  # G
    3: [72, 67, 64, 60],  # C
    4: [69, 72, 76, 69],  # Am
    5: [65, 69, 72, 65],  # F
    6: [67, 71, 74, 71],  # G
    7: [60, 64, 67, 60],  # C
}


def _demo_melody() -> dict:
    notes = []
    for bar, pitches in _BAR_PITCHES.items():
        for beat, pitch in enumerate(pitches):
            notes.append({"hz": pitch, "start": bar * 4 + beat, "duration": 1.0})
    return {"melody": notes, "tempo": 120}


def _render_original(melody: dict, wav_path: str, tempo: float) -> str | None:
    """Render the bare melody (no accompaniment) to a WAV for comparison."""
    from accompanist.models.melody import Melody, Note
    from accompanist.music.melody_to_midi import melody_to_midi
    from accompanist.audio.render import render_midi

    midi_path = wav_path.rsplit(".", 1)[0] + ".mid"
    mel = Melody(
        notes=[Note(n["hz"], n["start"], n["duration"]) for n in melody["melody"]],
        tempo=tempo,
    )
    melody_to_midi(mel, midi_path)
    try:
        render_midi(midi_path, wav_path)
        return wav_path
    except Exception as exc:  # FluidSynth/soundfont missing
        print(f"  original wav warning: {exc}")
        return None


def main() -> int:
    style = sys.argv[1] if len(sys.argv) > 1 else "classical"
    wav_path = sys.argv[2] if len(sys.argv) > 2 else "test.wav"
    midi_path = wav_path.rsplit(".", 1)[0] + ".mid"

    melody = _demo_melody()

    # 1. Original melody only (for A/B comparison).
    original_wav = wav_path.rsplit(".", 1)[0] + "_original.wav"
    original_wav = _render_original(melody, original_wav, tempo=120)

    # 2. Full pipeline: melody + generated accompaniment.
    result = generate_accompaniment(
        melody,
        midi_path,
        style=style,
        render_wav=True,
        wav_path=wav_path,
    )

    print(f"style:       {style}")
    print(f"key:         {result.key} {result.mode}")
    print(f"progression: {' '.join(result.progression_symbols)}")
    print(f"midi:        {result.midi_path}")

    if original_wav:
        print(f"original:    {original_wav}   (melody only — afplay {original_wav})")
    else:
        print("original:    NOT rendered")

    if result.wav_path:
        print(f"accompanied: {result.wav_path}   (melody + accompaniment — afplay {result.wav_path})")
    else:
        print("accompanied: NOT rendered")
        for w in result.warnings:
            print(f"  warning: {w}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
