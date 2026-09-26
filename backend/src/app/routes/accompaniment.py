"""Accompaniment generation endpoints.

Wires the `accompanist` engine (Phases 1-18) into the Flask app:
melody JSON in -> generated accompaniment MIDI (or WAV) out.
"""

import os
import tempfile
import uuid

from flask import Blueprint, jsonify, request, send_file, current_app

from accompanist.generate import generate_accompaniment
from accompanist.music.styles import STYLES

bp = Blueprint("accompaniment", __name__, url_prefix="/accompaniment")


@bp.route("/styles", methods=["GET"])
def list_styles():
    """List the available accompaniment styles."""
    return jsonify({"styles": sorted(STYLES.keys())})


@bp.route("/generate", methods=["POST"])
def generate():
    """Generate an accompaniment from a melody.

    Request JSON:
        {
          "melody": [ {"hz": 60, "start": 0, "duration": 0.5}, ... ],
          "key":   "C",         # optional; auto-detected if omitted
          "mode":  "major",     # optional
          "tempo": 120,          # optional
          "style": "classical", # optional: piano|pop|cinematic|classical
          "format": "midi"       # optional: "midi" (default) | "wav" | "json"
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
            render_wav=(out_format == "wav"),
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
        if not result.wav_path or not os.path.exists(result.wav_path):
            return jsonify({
                "error": "WAV rendering unavailable (FluidSynth/soundfont missing).",
                "warnings": result.warnings,
            }), 503
        return send_file(
            result.wav_path,
            mimetype="audio/wav",
            as_attachment=True,
            download_name=f"accompaniment_{stem}.wav",
        )

    # Default: MIDI
    return send_file(
        result.midi_path,
        mimetype="audio/midi",
        as_attachment=True,
        download_name=f"accompaniment_{stem}.mid",
    )
