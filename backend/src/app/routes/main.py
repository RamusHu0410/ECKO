import os
import time
from math import isfinite

import numpy as np
from flask import Blueprint, jsonify, current_app, request, has_app_context
from werkzeug.utils import secure_filename

# Import the new audio processor
from ..audio.processor import AudioProcessor, build_melody, load_and_process_wav

bp = Blueprint("main", __name__)


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
    """Endpoint to receive .wav file from frontend."""
    print("[ROUTE] POST /upload - Upload endpoint called")
    request_start = time.time()

    # Check if file part exists in request
    if "file" not in request.files:
        print("[ROUTE] ERROR: No file part in request")
        return jsonify({"error": "No file part in request"}), 400

    file = request.files["file"]
    print(f"[ROUTE] Received file: {file.filename}, content_type: {file.content_type}")

    # Check if file was selected
    if file.filename == "":
        print("[ROUTE] ERROR: No file selected (empty filename)")
        return jsonify({"error": "No file selected"}), 400

    # Validate file extension
    if not allowed_file(file.filename):
        print(f"[ROUTE] ERROR: Invalid file type: {file.filename}")
        return jsonify(
            {
                "error": "Invalid file type. Only .wav files are allowed.",
                "allowed_extensions": current_app.config["UPLOAD_EXTENSIONS"],
            }
        ), 400

    # Secure filename and save
    filename = secure_filename(file.filename)
    upload_folder = current_app.config["UPLOAD_FOLDER"]
    filepath = os.path.join(upload_folder, filename)

    print(f"[ROUTE] Saving file to: {filepath}")
    print(f"[ROUTE] Upload folder: {upload_folder}")
    print(f"[ROUTE] File exists before save: {os.path.exists(filepath)}")

    try:
        save_start = time.time()
        file.save(filepath)
        save_time = time.time() - save_start
        file_size = os.path.getsize(filepath)

        print(f"[ROUTE] File saved successfully in {save_time:.3f}s")
        print(
            f"[ROUTE] File size: {file_size} bytes ({file_size / (1024 * 1024):.2f} MB)"
        )
        print(f"[ROUTE] File exists after save: {os.path.exists(filepath)}")

        # Process the audio file
        print(f"[ROUTE] Starting audio processing...")
        proc_start = time.time()
        try:
            # Initialize processor with config sample rate (default 22050)
            target_sr = current_app.config.get("AUDIO_TARGET_SR", 22050)
            print(f"[ROUTE] Creating AudioProcessor with target_sr={target_sr}")
            processor = AudioProcessor(target_sr=target_sr, debug=True)

            print(f"[ROUTE] Calling processor.process_audio()...")
            processing_results = processor.process_audio(filepath)
            proc_time = time.time() - proc_start

            print(f"[ROUTE] Audio processing completed in {proc_time:.3f}s")
            print(f"[ROUTE] Processing results keys: {list(processing_results.keys())}")

            # Print summary of results
            if "sound_segments" in processing_results:
                print(
                    f"[ROUTE] Sound segments found: {len(processing_results['sound_segments'])}"
                )
                for i, seg in enumerate(processing_results["sound_segments"]):
                    print(
                        f"[ROUTE]   Segment {i}: {seg['start']:.3f}s - {seg['end']:.3f}s (dur: {seg['duration']:.3f}s)"
                    )

            if "pitch" in processing_results:
                pitch = processing_results["pitch"]
                print(
                    f"[ROUTE] Pitch: mean={pitch.get('mean_hz', 0):.1f}Hz, median={pitch.get('median_hz', 0):.1f}Hz, voiced_frames={pitch.get('voiced_frames', 0)}"
                )

            if "volume" in processing_results:
                vol = processing_results["volume"]
                print(
                    f"[ROUTE] Volume: mean_rms={vol.get('mean_rms', 0):.6f}, max_rms={vol.get('max_rms', 0):.6f}, dynamic_range={vol.get('dynamic_range_db', 0):.1f}dB"
                )

            # Notes in the shape accompanist.generate_accompaniment expects
            # (POST /accompaniment/generate), so the frontend can hand this
            # straight back once the user picks a style/tempo/pitch.
            melody = build_melody(processing_results)
            print(f"[ROUTE] Melody notes extracted: {len(melody)}")

            # Add processing results to response
            response_data = {
                "status": "success",
                "message": "File uploaded and processed successfully",
                "filename": filename,
                "size_bytes": file_size,
                "size_mb": round(file_size / (1024 * 1024), 2),
                "saved_path": filepath,
                "audio_analysis": processing_results,
                "melody": melody,
                "processing_time_seconds": round(proc_time, 3),
                "total_request_time_seconds": round(time.time() - request_start, 3),
            }
        except Exception as proc_error:
            proc_time = time.time() - proc_start
            current_app.logger.error(f"Audio processing failed: {str(proc_error)}")
            print(
                f"[ROUTE] ERROR: Audio processing failed after {proc_time:.3f}s: {str(proc_error)}"
            )
            import traceback

            traceback.print_exc()
            # Still return success for upload, but note processing failure
            response_data = {
                "status": "success",
                "message": "File uploaded but processing failed",
                "filename": filename,
                "size_bytes": file_size,
                "size_mb": round(file_size / (1024 * 1024), 2),
                "saved_path": filepath,
                "processing_error": str(proc_error),
                "processing_time_seconds": round(proc_time, 3),
                "total_request_time_seconds": round(time.time() - request_start, 3),
            }

        print(
            f"[ROUTE] Returning response (total time: {time.time() - request_start:.3f}s)"
        )
        # Audio libraries return NumPy scalars (notably ``numpy.bool`` from
        # pitch voicing). Flask's JSON provider cannot serialize those values.
        return jsonify(_json_safe(response_data)), 201

    except Exception as e:
        current_app.logger.error(f"File upload failed: {str(e)}")
        print(f"[ROUTE] ERROR: File upload failed: {str(e)}")
        import traceback

        traceback.print_exc()
        return jsonify({"error": "File upload failed", "details": str(e)}), 500


@bp.route("/piece", methods=["GET"])
def send_new_music():
    return ""
