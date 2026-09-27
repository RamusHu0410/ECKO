"""The whole audio pipeline: an upload -> intake (clean melody) -> arrangement -> final.wav.

Every run gets its own folder, runs/<run_id>/, holding each step's files and run.json, a log of
what ran, what it wrote, how long it took, and any warnings or fallbacks. Runs never change: a
re-run (say, a new style from a saved melody.json) is a new run that copies what it reuses from
the old one and records it as its parent.

The upload itself (the raw hum) is not copied into the run: run.json only records its path and
checksum.

Where intake (part A) plugs in: `get_intake()`. Intake is any function
`transcribe_to_melody(input_path, run_dir) -> MelodyResult` that writes run_dir/melody_clean.mid
and run_dir/melody.json (the contract). Three are known:

  "part_a"    app.audio.intake.transcribe_to_melody, the teammate's, picked up automatically
              as soon as it can be imported;
  "analyzer"  a bridge to the analyzer the upload route already uses (app/audio/processor.py),
              so real recordings can go through the whole pipeline today;
  "fixture"   ignores the audio and hands over the hand-written fixture melody.

The default ("auto", or the PIPELINE_INTAKE environment variable) is part A's when it exists,
else the fixture. `_check_handoff` checks whatever intake wrote against the contract, and
tests/audio/arrange/test_arrange_intake_contract.py runs every intake through the same checks.
"""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from app.audio.arrange import FILES, STEPS, PipelineError, RenderResult, StepReport, run_steps
from app.audio.arrange.files import copy_atomically, replace_atomically
from app.audio.arrange.melody import load_melody, melody_from_dict, save_melody_json, save_melody_midi
from app.audio.arrange.validate import validate_midi

BACKEND_ROOT = Path(__file__).resolve().parents[3]
# Runs live next to users' saved files (backend/storage/ is git-ignored).
DEFAULT_RUNS_DIR = BACKEND_ROOT / "storage" / "runs"
LOG_NAME = "run.json"
MELODY_MIDI = "melody_clean.mid"

FIXTURE_JSON = BACKEND_ROOT / "src" / "tests" / "fixtures" / "melody_sample.json"
FIXTURE_MIDI = BACKEND_ROOT / "src" / "tests" / "fixtures" / "melody_sample.mid"


@dataclass
class MelodyResult:
    """What intake hands over (the contract's MelodyResult)."""

    midi_path: str
    json_path: str
    note_count: int
    fell_back: bool
    warnings: list[str] = field(default_factory=list)


@dataclass
class PipelineResult:
    run_id: str
    run_dir: str
    final_wav_path: str
    duration_seconds: float
    fell_back: bool
    warnings: list[str]
    log_path: str
    melody: MelodyResult | None = None
    render: RenderResult | None = None


def _fixture_transcribe(input_path: str, run_dir: str) -> MelodyResult:
    """Stand-in for intake: ignores the audio and hands over the fixture melody (as new files)."""
    run = Path(run_dir)
    midi = copy_atomically(FIXTURE_MIDI, run / MELODY_MIDI, validate_midi)
    melody_json = copy_atomically(FIXTURE_JSON, run / FILES["melody"], load_melody)
    return MelodyResult(
        midi_path=str(midi),
        json_path=str(melody_json),
        note_count=len(load_melody(melody_json).notes),
        fell_back=False,
        warnings=["Intake is stubbed: this is the fixture melody, not a transcription of the upload."],
    )


def _analyzer_transcribe(input_path: str, run_dir: str) -> MelodyResult:
    """Bridge until part A lands: the analyzer the upload route uses, written in the contract's
    format (notes quantized to 16ths, one instrument, key/tempo from the analysis)."""
    from app.audio import analyze_audio_file
    from app.audio.handoff import sensible_tempo, to_engine_melody

    hum = analyze_audio_file(input_path)
    tempo = sensible_tempo(hum["tempo"])
    notes = [
        {"pitch": int(round(n["hz"])), "start_beats": n["start"], "duration_beats": n["duration"], "velocity": 80}
        for n in to_engine_melody(hum["melody"], tempo)
        if n["duration"] > 0
    ]
    if not notes:
        raise PipelineError("intake", "No notes were found in the recording.")
    melody = melody_from_dict({
        "tempo_bpm": tempo,
        "key": f"{hum['key']} {hum['mode']}",
        "time_signature": "4/4",
        "tuning_offset_cents": hum["tuning_cents"],
        "notes": notes,
    })
    run = Path(run_dir)
    midi = save_melody_midi(melody, run / MELODY_MIDI)
    melody_json = save_melody_json(melody, run / FILES["melody"])
    return MelodyResult(
        midi_path=str(midi),
        json_path=str(melody_json),
        note_count=len(melody.notes),
        fell_back=False,
        warnings=list(hum["warnings"]) + ["Intake is the existing analyzer (a bridge), not part A's transcribe_to_melody."],
    )


INTAKES = {"fixture": _fixture_transcribe, "analyzer": _analyzer_transcribe}


def get_intake(name: str | None = None):
    """The intake function called `name` ("auto", "part_a", "analyzer", "fixture"). See the top."""
    name = name or os.environ.get("PIPELINE_INTAKE") or "auto"
    if name in ("auto", "part_a"):
        try:
            from app.audio.intake import transcribe_to_melody  # type: ignore[attr-defined]
        except ImportError:
            if name == "part_a":
                raise PipelineError("intake", "Part A's transcribe_to_melody isn't in app.audio.intake yet.") from None
            return _fixture_transcribe
        return transcribe_to_melody
    try:
        return INTAKES[name]
    except KeyError:
        raise PipelineError("intake", f"Unknown intake {name!r}; choose auto, part_a, analyzer or fixture.") from None


def _intake_name(fn) -> str:
    return next((name for name, known in INTAKES.items() if known is fn), "part_a")


# --- runs and their log ---------------------------------------------------------------------


def new_run_dir(runs_dir: str | Path | None = None) -> Path:
    """A fresh, empty runs/<run_id>/ (run ids sort by time)."""
    root = Path(runs_dir or os.environ.get("RUNS_DIR") or DEFAULT_RUNS_DIR)
    # Time first (so folders sort by age), then a full random UUID. mkdir refuses an existing
    # folder, so even a collision could never put two runs in one folder.
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex
    path = root / run_id
    path.mkdir(parents=True, exist_ok=False)
    return path


def _prepare(run_dir: str | Path | None) -> Path:
    if run_dir is None:
        return new_run_dir()
    path = Path(run_dir)
    if path.exists() and any(path.iterdir()):
        raise PipelineError("pipeline.setup", f"{path} already has files in it; a run needs an empty folder.")
    path.mkdir(parents=True, exist_ok=True)
    return path


class RunLog:
    """run.json, rewritten (atomically) after every step so a crash leaves an accurate log."""

    def __init__(self, run_dir: Path, **fields):
        self.path = run_dir / LOG_NAME
        self.data = {
            "run_id": run_dir.name,
            "created_at": _now(),
            "status": "running",
            "steps": [],
            **fields,
        }
        self.save()

    def step(self, step: str, *, outputs=None, warnings=None, fell_back=False, seconds=None, status="ok",
             error=None, detail=None):
        self.data["steps"].append({
            "step": step,
            "status": status,
            "finished_at": _now(),
            "seconds": seconds,
            "outputs": {k: Path(v).name for k, v in (outputs or {}).items()},
            "warnings": warnings or [],
            "fell_back": fell_back,
            **({"error": error} if error else {}),
            **({"detail": detail} if detail else {}),
        })
        self.save()

    def arrange_step(self, report: StepReport) -> None:
        self.step(report.step, outputs=report.outputs, warnings=report.warnings,
                  fell_back=report.fell_back, seconds=report.seconds)

    def finish(self, status: str, **fields) -> None:
        self.data.update(status=status, finished_at=_now(), **fields)
        self.save()

    def save(self) -> None:
        text = json.dumps(self.data, indent=2, default=str) + "\n"
        replace_atomically(self.path, lambda tmp: tmp.write_text(text, encoding="utf-8"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


# --- entry points ---------------------------------------------------------------------------


def run_pipeline(input_path: str, style: str, run_dir: str | None = None, intake=None) -> PipelineResult:
    """Upload -> final.wav. `run_dir` must be new or empty; by default runs/<run_id>/ is made.
    `intake` is a name for `get_intake` or a transcribe function (default: "auto")."""
    transcribe = intake if callable(intake) else get_intake(intake)
    run = _prepare(run_dir)
    log = RunLog(run, style=style, start_step="intake", parent_run=None, intake=_intake_name(transcribe),
                 input={"path": str(input_path), "sha256": _sha256(input_path) if Path(input_path).is_file() else None})
    try:
        started = datetime.now(timezone.utc)
        try:
            melody = transcribe(str(input_path), str(run))
            _check_handoff(run, melody)
        except PipelineError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise PipelineError("intake", "Your recording couldn't be turned into notes.") from exc
        log.step("intake", outputs={"midi": melody.midi_path, "melody": melody.json_path},
                 warnings=melody.warnings, fell_back=melody.fell_back,
                 seconds=round((datetime.now(timezone.utc) - started).total_seconds(), 3))
        render = run_steps(run, style, on_step=log.arrange_step)
    except PipelineError as exc:
        _log_failure(log, exc)
        raise
    return _finish(run, log, render, melody)


def rerun(from_run_dir: str | Path, style: str, from_step: str = "transform",
          run_dir: str | None = None) -> PipelineResult:
    """A new run that reuses a saved run's files up to `from_step` and redoes the rest in `style`.

    from_step="transform" re-arranges the saved melody.json; "render" re-renders the saved
    arrangement; "effects" only reapplies effects, and so on. The saved run isn't touched.
    """
    source = Path(from_run_dir)
    if from_step not in STEPS:
        raise PipelineError("pipeline.rerun", f"Can't re-run from '{from_step}'; choose one of {', '.join(STEPS)}.")
    run = _prepare(run_dir)
    log = RunLog(run, style=style, start_step=from_step, parent_run=str(source))
    try:
        # Everything the steps before `from_step` produced, copied as new files.
        reused = [FILES["melody"], MELODY_MIDI]
        for step in STEPS[: STEPS.index(from_step)]:
            reused += [FILES[step]] + ([FILES["melody_midi"]] if step == "transform" else [])
        copied = {}
        for name in reused:
            if (source / name).is_file():
                copied[name] = str(copy_atomically(source / name, run / name))
        log.step("reuse", outputs=copied, seconds=0.0)
        render = run_steps(run, style, start=from_step, on_step=log.arrange_step)
    except PipelineError as exc:
        _log_failure(log, exc)
        raise
    return _finish(run, log, render, None)


def _log_failure(log: RunLog, exc: PipelineError) -> None:
    """The user-facing message, plus the technical cause for whoever debugs it."""
    detail = f"{type(exc.__cause__).__name__}: {exc.__cause__}" if exc.__cause__ else None
    log.step(exc.step, status="failed", error=exc.message, detail=detail)
    log.finish("failed", error=str(exc), detail=detail)


def _check_handoff(run: Path, melody: MelodyResult) -> None:
    """Intake's files are where the contract says, parse, and agree on the notes."""
    json_path, midi_path = Path(melody.json_path), Path(melody.midi_path)
    if json_path != run / FILES["melody"] or midi_path != run / MELODY_MIDI:
        raise PipelineError("intake", f"Intake wrote {json_path.name}/{midi_path.name} outside the contract's names.")
    try:
        notes = load_melody(json_path).notes
        midi = validate_midi(midi_path)
    except (OSError, ValueError) as exc:
        raise PipelineError("intake", f"The handoff files are unusable: {exc}") from exc
    midi_notes = sum(len(i.notes) for i in midi.instruments)
    if midi_notes != len(notes):
        melody.warnings.append(
            f"melody_clean.mid has {midi_notes} notes but melody.json has {len(notes)}; using melody.json."
        )


def _finish(run: Path, log: RunLog, render: RenderResult, melody: MelodyResult | None) -> PipelineResult:
    warnings = (melody.warnings if melody else []) + render.warnings
    fell_back = render.fell_back or bool(melody and melody.fell_back)
    log.finish("ok", final=Path(render.final_wav_path).name, duration_seconds=render.duration_seconds,
               style_used=render.style, fell_back=fell_back, warnings=warnings)
    return PipelineResult(
        run_id=run.name,
        run_dir=str(run),
        final_wav_path=render.final_wav_path,
        duration_seconds=render.duration_seconds,
        fell_back=fell_back,
        warnings=warnings,
        log_path=str(log.path),
        melody=melody,
        render=render,
    )


def main(argv: list[str] | None = None) -> None:
    """Command line:

        uv run python -m app.audio.pipeline run <upload.wav> [--style cinematic] [--intake auto|part_a|analyzer|fixture]
        uv run python -m app.audio.pipeline rerun <run_dir> <style> [--from transform|orchestrate|render|effects]
        uv run python -m app.audio.pipeline describe <run_dir>
        uv run python -m app.audio.pipeline stems <run_dir>
    """
    import argparse
    import logging

    from dotenv import load_dotenv

    from app.audio.arrange import debug

    load_dotenv(BACKEND_ROOT / ".env")  # SOUNDFONT_PATH, RUNS_DIR, PIPELINE_INTAKE
    parser = argparse.ArgumentParser(prog="python -m app.audio.pipeline")
    parser.add_argument("-v", "--verbose", action="store_true", help="log each step as it runs")
    commands = parser.add_subparsers(dest="command", required=True)
    run_cmd = commands.add_parser("run", help="an upload through the whole pipeline")
    run_cmd.add_argument("input")
    run_cmd.add_argument("--style", default="cinematic")
    run_cmd.add_argument("--intake", default=None)
    rerun_cmd = commands.add_parser("rerun", help="a new run from a saved run's step")
    rerun_cmd.add_argument("run_dir")
    rerun_cmd.add_argument("style")
    rerun_cmd.add_argument("--from", dest="from_step", default="transform", choices=STEPS)
    commands.add_parser("describe", help="a report of a run").add_argument("run_dir")
    commands.add_parser("stems", help="each track of a run rendered alone").add_argument("run_dir")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING, format="%(levelname)s %(message)s")

    if args.command == "describe":
        print(debug.describe(args.run_dir))
        return
    if args.command == "stems":
        for path in debug.render_stems(args.run_dir):
            print(path)
        return
    if args.command == "rerun":
        result = rerun(args.run_dir, args.style, args.from_step)
    else:
        result = run_pipeline(args.input, args.style, intake=args.intake)
    print(debug.describe(result.run_dir))
    print(f"\nfinal: {result.final_wav_path}")


if __name__ == "__main__":
    main()


__all__ = ["MelodyResult", "PipelineError", "PipelineResult", "new_run_dir", "rerun", "run_pipeline"]
