import os
import tempfile
import time
import uuid
from math import isfinite
from pathlib import Path

import numpy as np
import soundfile
from flask import Blueprint, jsonify, current_app, request, has_app_context, send_file, send_from_directory
from werkzeug.utils import secure_filename

from accompanist.audio.render import render_midi
from accompanist.generate import generate_accompaniment
from accompanist.music.styles import STYLES

from ..audio.arrange.melody import key_tonic_and_mode, load_melody
from ..audio.errors import PipelineError
from ..audio.intake import AudioInputError, inspect_wav, unique_upload_name
from ..audio.pipeline import melody_run_for

bp = Blueprint("main", __name__)
# Intake's refusals the user can fix by recording again (app/audio/intake): answered 400.
RECORDING_CODES = {"no_tune", "silent", "too_short", "too_long", "unreadable", "empty", "not_found", "input_changed"}

# The "creepy" sound for /accompaniment/generate: FluidSynth's small demo soundfont, whose instruments
# are all crude retro waves. Looked for next to the real soundfont first, then where Homebrew puts it.
CREEPY_SOUNDFONTS = (
    Path(__file__).resolve().parents[3] / "accompanist" / "soundfonts" / "VintageDreamsWaves-v2.sf2",
    Path("/opt/homebrew/share/fluid-synth/sf2/VintageDreamsWaves-v2.sf2"),
)


def _json_safe(value):
    """Convert NumPy values and non-finite floats into JSON-compatible data."""
    if isinstance(value, np.ndarray):
        return [_json_safe(item) for item in value.tolist()]
    if isinstance(value, np.generic):
        return _json_safe(value.item())
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, float) and not isfinite(value):
        return None
    return value


def allowed_file(filename):
    """Check if file has allowed extension."""
    if not has_app_context():
        return (
            "." in filename
            and not filename.startswith(".")
            and filename.rsplit(".", 1)[1].lower() == "wav"
        )
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower()
        in current_app.config["UPLOAD_EXTENSIONS"]
    )


@bp.route("/")
def index():
    print("[ROUTE] GET / - Index endpoint called")
    return jsonify(
        {
            "status": "ok",
            "message": "ECKO Backend Running",
            "environment": current_app.config.get("ENV", "unknown"),
        }
    )


@bp.route("/health")
def health():
    print("[ROUTE] GET /health - Health check called")
    # Add DB check here if needed: db.session.execute(text('SELECT 1'))
    return jsonify({"status": "healthy"}), 200


@bp.route("/upload", methods=["POST"])
def upload_wav():
    """Receive a hummed .wav from the frontend, save it, and find its tune with the audio
    pipeline's intake (app/audio/intake), whose melody /pipeline/song then arranges.

    201 → the saved file's name (send it back to /pipeline/song, /talk/song and /talk/notes), plus:
        run_id          the pipeline run holding the hum's melody (melody.json)
        melody          the tune for POST /accompaniment/generate: hz (MIDI note), start and
                        duration in beats at ``tempo`` (send ``tempo`` along with it)
        tempo, key, mode
        tuning_cents    how far off A440 the hum was (already corrected in the notes)
        warnings        problems with the recording, in words for the user
    400 → the file isn't a usable recording, or no tune was found in it: {error} in words for the
          user, plus a code from intake when it refused it ("no_tune", "silent", "too_short"...).
          Nothing is kept either way.
    500 → the analysis itself failed: {error, details}
    """
    request_start = time.time()
    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "No file part in request"}), 400
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify(
            {
                "error": "Invalid file type. Only .wav files are allowed.",
                "allowed_extensions": current_app.config["UPLOAD_EXTENSIONS"],
            }
        ), 400

    upload_folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_folder, exist_ok=True)
    filename = unique_upload_name(file.filename)
    filepath = os.path.join(upload_folder, filename)
    try:
        file.save(filepath)
    except OSError as exc:
        current_app.logger.exception("Saving the upload failed")
        return jsonify({"error": "File upload failed", "details": str(exc)}), 500
    file_size = os.path.getsize(filepath)

    proc_start = time.time()
    try:
        inspect_wav(filepath)  # quick checks first: a readable WAV of a sensible length
        run_dir, warnings = melody_run_for(filepath, current_app.config["RUNS_DIR"])
        melody = load_melody(run_dir / "melody.json")
    except AudioInputError as exc:
        _discard(filepath)
        return jsonify({"error": str(exc)}), 400
    except PipelineError as exc:
        _discard(filepath)
        if exc.code in RECORDING_CODES:
            return jsonify({"error": exc.message, "code": exc.code}), 400
        current_app.logger.error("intake failed at %s (%s): %s", exc.step, exc.code, exc.__cause__ or exc)
        return jsonify({"error": "Audio processing failed", "details": exc.message}), 500
    except Exception as exc:  # noqa: BLE001 - a bug, not a bad file: say so plainly
        current_app.logger.exception("Audio processing failed")
        _discard(filepath)
        return jsonify({"error": "Audio processing failed", "details": str(exc)}), 500

    tonic, mode = key_tonic_and_mode(melody.key)
    current_app.logger.info(
        "upload %s: %d notes, %.1f BPM, %s, %+g cents, run %s, warnings=%s",
        filename, len(melody.notes), melody.tempo_bpm, melody.key, melody.tuning_offset_cents, run_dir.name, warnings,
    )
    response_data = {
        "status": "success",
        "message": "File uploaded and processed successfully",
        "filename": filename,
        "size_bytes": file_size,
        "size_mb": round(file_size / (1024 * 1024), 2),
        "saved_path": filepath,
        "run_id": run_dir.name,
        # the engine's "hz" holds MIDI note numbers, its times are beats
        "melody": [{"hz": float(n.pitch), "start": n.start_beats, "duration": n.duration_beats} for n in melody.notes],
        "tempo": melody.tempo_bpm,
        "key": tonic,
        "mode": mode,
        "tuning_cents": melody.tuning_offset_cents,
        "warnings": warnings,
        "processing_time_seconds": round(time.time() - proc_start, 3),
        "total_request_time_seconds": round(time.time() - request_start, 3),
    }
    return jsonify(_json_safe(response_data)), 201


@bp.route("/song/<path:name>", methods=["GET"])
def get_song(name):
    """Stream a generated accompaniment WAV (or MIDI) saved by /upload."""
    safe = secure_filename(name)
    if not safe or safe != name or not safe.endswith(("_accompaniment.wav", "_accompaniment.mid")):
        return jsonify({"error": "Unknown song"}), 404
    folder = os.path.abspath(current_app.config["RECORDINGS_FOLDER"])
    if not os.path.isfile(os.path.join(folder, safe)):
        return jsonify({"error": "Unknown song"}), 404
    mimetype = "audio/wav" if safe.endswith(".wav") else "audio/midi"
    return send_from_directory(folder, safe, mimetype=mimetype)


@bp.route("/accompaniment/styles", methods=["GET"])
def accompaniment_styles():
    """List the available accompaniment styles."""
    return jsonify({"styles": sorted(STYLES.keys())})


@bp.route("/accompaniment/generate", methods=["POST"]) 
def accompaniment_generate():
    """Generate an accompaniment from a melody.

    Request JSON:
        {
          "melody": [ {"hz": 60, "start": 0, "duration": 0.5}, ... ],
          "key":   "C",         # optional; auto-detected if omitted
          "mode":  "major",     # optional
          "tempo": 120,          # optional
          "style": "classical", # optional: piano|pop|cinematic|classical|jazz|asian_folk
          "instrument": "synth", # optional; synth is the default
          "format": "midi",      # optional: "midi" (default) | "wav" | "json"
          "sound": "normal"      # optional, for wav: "normal" (default) | "creepy" (retro demo soundfont)
        }

    Response:
        * format=midi -> the .mid file (audio/midi)
        * format=wav  -> the rendered .wav file (audio/wav)
        * format=json -> metadata only (key, mode, progression, no file)
    """
    data = request.get_json(silent=True)
    if not data or "melody" not in data:
        return jsonify({"error": "Request must be JSON with a 'melody' array."}), 400

    style = data.get("style", "classical")
    if style not in STYLES:
        return jsonify({
            "error": f"Unknown style '{style}'.",
            "available_styles": sorted(STYLES.keys()),
        }), 400

    out_format = (data.get("format") or "midi").lower()
    if out_format not in ("midi", "wav", "json"):
        return jsonify({"error": "format must be 'midi', 'wav', or 'json'."}), 400

    sound = (data.get("sound") or "normal").lower()
    if sound not in ("normal", "creepy"):
        return jsonify({"error": "sound must be 'normal' or 'creepy'."}), 400
    creepy = out_format == "wav" and sound == "creepy"

    # allow_edit_melody: whether the engine may alter the melody itself.
    # Accepts "yes"/"no" (or true/false). Default is "no" — the melody line is
    # left exactly as given unless the caller explicitly opts in.
    _raw_allow = data.get("allow_edit_melody", "no")
    allow_edit_melody = str(_raw_allow).strip().lower() in ("yes", "true", "1")

    # instrument: named GM instrument for playback (synth, piano, guitar, ...).
    instrument = data.get("instrument", "synth")

    # modulation: optionally transpose the whole piece to a new key/mode.
    modulate = data.get("modulate") or {}
    modulate_to_key = modulate.get("key") if isinstance(modulate, dict) else None
    modulate_to_mode = modulate.get("mode") if isinstance(modulate, dict) else None

    # Build the input dict the engine understands (Kingsley's melody format).
    melody_input = {
        "melody": data["melody"],
        "key": data.get("key", "C"),
        "mode": data.get("mode", "major"),
        "tempo": data.get("tempo", 120),
    }

    # Work in a temp dir; files are cleaned up unless returned.
    out_dir = tempfile.mkdtemp(prefix="accompaniment_")
    stem = uuid.uuid4().hex[:8]
    midi_path = os.path.join(out_dir, f"{stem}.mid")

    try:
        result = generate_accompaniment(
            melody_input,
            midi_path,
            style=style,
            key=data.get("key"),
            mode=data.get("mode"),
            tempo=data.get("tempo"),
            allow_edit_melody=allow_edit_melody,
            instrument=instrument,
            modulate_to_key=modulate_to_key,
            modulate_to_mode=modulate_to_mode,
            render_wav=(out_format == "wav" and not creepy),
        )
    except (ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001 - surface engine errors to client
        current_app.logger.exception("Accompaniment generation failed")
        return jsonify({"error": "Generation failed", "details": str(exc)}), 500

    if out_format == "json":
        return jsonify({
            "status": "success",
            "key": result.key,
            "mode": result.mode,
            "style": style,
            "progression": result.progression_symbols,
            "num_notes": len(result.melody_notes),
            "warnings": result.warnings,
        }), 200

    if out_format == "wav":
        wav_path = _render_creepy(result.midi_path) if creepy else result.wav_path
        if not wav_path or not os.path.exists(wav_path):
            return jsonify({
                "error": "WAV rendering unavailable (FluidSynth/soundfont missing).",
                "warnings": result.warnings,
            }), 503
        # FluidSynth renders quietly, and each soundfont at its own level: bring every version up to
        # the loudness of talk mode's songs (app/talk/song.py), so switching sounds keeps the volume.
        samples, rate = soundfile.read(wav_path)
        if np.abs(samples).max() > 0:
            soundfile.write(wav_path, samples * (0.9 / np.abs(samples).max()), rate, subtype="PCM_16")
        # Not an attachment: the frontend streams this straight into an
        # <audio> element / Web Audio for playback.
        return send_file(
            wav_path,
            mimetype="audio/wav",
            as_attachment=False,
            download_name=f"accompaniment_{stem}.wav",
        )

    # Default: MIDI
    return send_file(
        result.midi_path,
        mimetype="audio/midi",
        as_attachment=True,
        download_name=f"accompaniment_{stem}.mid",
    )


def _render_creepy(midi_path):
    """The song through the creepy soundfont, or None if it (or FluidSynth) isn't on this machine."""
    soundfont = next((str(path) for path in CREEPY_SOUNDFONTS if path.is_file()), None)
    if soundfont is None:
        return None
    try:
        return render_midi(midi_path, os.path.splitext(midi_path)[0] + ".wav", soundfont=soundfont)
    except Exception:  # noqa: BLE001 - answered as rendering unavailable (503)
        current_app.logger.exception("Rendering with the creepy soundfont failed")
        return None


def _discard(path):
    try:
        os.remove(path)
    except OSError:
        pass


@bp.route("/piece", methods=["GET"])
def send_new_music():
    return ""
