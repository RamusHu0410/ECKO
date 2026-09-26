"""Measures each stage with the real services, and how soon the spoken reply starts.

Run:  .venv/bin/python scripts/measure_latency.py --rounds 5
Each round costs 2 speech-to-text calls, 4 Gemini calls and 2 text-to-speech calls.
The first round only warms up the connections and is not counted.
"""

import argparse
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

LAB_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(LAB_DIR))

from talk.config import load_config  # noqa: E402
from talk.intent import Interpreter  # noqa: E402
from talk.pipeline import Pipeline  # noqa: E402
from talk.settings import SongSettings  # noqa: E402
from talk.stt import Transcriber  # noqa: E402
from talk.tts import Speaker  # noqa: E402

RECORDING = LAB_DIR / "tests" / "fixtures" / "bit_slower_and_lower.wav"
COMMANDS = ["make it faster and lighter", "turn this into rock", "what's the weather tomorrow?"]
FREE_TIER_GAP_SECONDS = 4.1  # the free tier allows 15 Gemini requests a minute; the pauses are not timed
REPLY = "Sure! I made it a little faster and a bit brighter. How does that sound?"


class Stopwatch:
    """Collects how long each stage took, and which calls failed (a failure doesn't stop the run)."""

    def __init__(self):
        self.times = defaultdict(list)
        self.failures = defaultdict(list)

    def time(self, stage: str, work):
        started = time.perf_counter()
        try:
            result = work()
        except Exception as exc:
            self.failures[stage].append(f"{type(exc).__name__}: {str(exc)[:100]}")
            return None
        self.times[stage].append((time.perf_counter() - started) * 1000)
        return result


def one_round(watch: Stopwatch, transcriber, interpreter, speaker, pipeline, audio) -> None:
    watch.time("Speech to text", lambda: transcriber.transcribe(audio, RECORDING.name))

    for text in COMMANDS:
        time.sleep(FREE_TIER_GAP_SECONDS)
        watch.time("Understanding (per command)", lambda: interpreter.understand(text, SongSettings()))

    chunks = speaker.stream(REPLY)  # nothing is sent until the first chunk is asked for
    if watch.time("Voice: first audio", lambda: next(chunks)):
        watch.time("Voice: rest of the reply", lambda: b"".join(chunks))

    # the whole turn as the server runs it: recording → words → Gemini → first audio of the reply
    time.sleep(FREE_TIER_GAP_SECONDS)

    def whole_turn():
        turn = pipeline.from_audio(audio, RECORDING.name, SongSettings())
        if turn.error:
            raise RuntimeError(turn.error)
        return next(speaker.stream(turn.reply))

    watch.time("You finish talking → first audio", whole_turn)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--rounds", type=int, default=5)
    rounds = parser.parse_args().rounds

    config = load_config()
    if not (config.gemini_api_key and config.elevenlabs_api_key):
        sys.exit("Both GEMINI_API_KEY and ELEVENLABS_API_KEY must be in .env")
    transcriber = Transcriber(config.elevenlabs_api_key, config.stt_model)
    interpreter = Interpreter(config.gemini_api_key, config.gemini_model, config.gemini_thinking)
    speaker = Speaker(config.elevenlabs_api_key, config.voice_id, config.tts_model)
    pipeline = Pipeline(interpreter.understand, transcriber.transcribe)
    audio = RECORDING.read_bytes()

    print(f"Models: {config.stt_model}, {config.gemini_model} ({config.gemini_thinking} thinking), {config.tts_model}")
    print("Warming up the connections…")
    one_round(Stopwatch(), transcriber, interpreter, speaker, pipeline, audio)

    watch = Stopwatch()
    for number in range(1, rounds + 1):
        print(f"Round {number} of {rounds}…")
        one_round(watch, transcriber, interpreter, speaker, pipeline, audio)

    print(f"\n{'Stage':<36}{'median':>9}{'fastest':>9}{'slowest':>9}{'ok':>5}{'failed':>8}")
    for stage in dict.fromkeys([*watch.times, *watch.failures]):
        values = watch.times[stage] or [float("nan")]
        print(
            f"{stage:<36}{statistics.median(values):>7.0f}ms{min(values):>7.0f}ms{max(values):>7.0f}ms"
            f"{len(watch.times[stage]):>5}{len(watch.failures[stage]):>8}"
        )
    for stage, problems in watch.failures.items():
        for problem in problems:
            print(f"  {stage} failed: {problem}")


if __name__ == "__main__":
    main()
