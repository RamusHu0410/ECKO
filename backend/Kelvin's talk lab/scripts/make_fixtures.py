"""Makes the spoken test recordings in tests/fixtures, so the speech tests need no microphone.

macOS only (it uses the built-in `say` and `afconvert` tools). The files are small and kept
in the folder, so the tests themselves run anywhere.

Run:  .venv/bin/python scripts/make_fixtures.py
"""

import subprocess
import sys
import tempfile
import wave
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"

# file name → (voice, words). WAV is what the lab's old recorder made; m4a is what Safari records.
RECORDINGS = {
    "make_it_faster.wav": ("Daniel", "Make it faster."),
    "turn_this_into_rock.m4a": ("Daniel", "Turn this into rock."),
    "bit_slower_and_lower.wav": ("Eddy (English (US))", "Make it a bit slower, and a little lower."),
    "weather_tomorrow.m4a": ("Flo (English (US))", "What's the weather like tomorrow?"),
    "mas_rapido.m4a": ("Eddy (Spanish (Spain))", "Más rápido, por favor."),
}
SILENCE = "silence.wav"


def speak(voice: str, words: str, target: Path) -> None:
    with tempfile.TemporaryDirectory() as scratch:
        spoken = Path(scratch) / "spoken.aiff"
        subprocess.run(["say", "-v", voice, "-o", str(spoken), words], check=True)
        if target.suffix == ".wav":
            convert = ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1"]  # 16 kHz mono PCM
        else:
            convert = ["-f", "m4af", "-d", "aac"]
        subprocess.run(["afconvert", *convert, str(spoken), str(target)], check=True)


def write_silence(target: Path, seconds: float = 1.5, rate: int = 16000) -> None:
    with wave.open(str(target), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(b"\x00\x00" * int(seconds * rate))


def main() -> None:
    if sys.platform != "darwin":
        sys.exit("This script needs macOS (say and afconvert). The fixtures are already in tests/fixtures.")
    FIXTURES.mkdir(parents=True, exist_ok=True)
    for name, (voice, words) in RECORDINGS.items():
        speak(voice, words, FIXTURES / name)
        print(f"made {name}: {words!r}")
    write_silence(FIXTURES / SILENCE)
    print(f"made {SILENCE}")


if __name__ == "__main__":
    main()
