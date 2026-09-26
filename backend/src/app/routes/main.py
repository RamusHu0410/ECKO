import os
from flask import Blueprint, jsonify, current_app, request
from werkzeug.utils import secure_filename

# Import the new audio processor
from ..audio.processor import AudioProcessor, load_and_process_wav

bp = Blueprint('main', __name__)

def allowed_file(filename):
    """Check if file has allowed extension."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in current_app.config['UPLOAD_EXTENSIONS']

@bp.route('/')
def index():
    return jsonify({
        "status": "ok", 
        "message": "ECKO Backend Running",
        "environment": current_app.config.get('ENV', 'unknown')
    })

@bp.route('/health')
def health():
    # Add DB check here if needed: db.session.execute(text('SELECT 1'))
    return jsonify({"status": "healthy"}), 200

@bp.route('/upload', methods=['POST'])
def upload_wav():
    """Endpoint to receive .wav file from frontend."""
    # Check if file part exists in request
    if 'file' not in request.files:
        return jsonify({"error": "No file part in request"}), 400
    
    file = request.files['file']
    
    # Check if file was selected
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    # Validate file extension
    if not allowed_file(file.filename):
        return jsonify({
            "error": "Invalid file type. Only .wav files are allowed.",
            "allowed_extensions": current_app.config['UPLOAD_EXTENSIONS']
        }), 400
    
    # Secure filename and save
    filename = secure_filename(file.filename)
    upload_folder = current_app.config['UPLOAD_FOLDER']
    filepath = os.path.join(upload_folder, filename)
    
    try:
        file.save(filepath)
        file_size = os.path.getsize(filepath)
        
        # Process the audio file
        try:
            # Initialize processor with config sample rate (default 22050)
            target_sr = current_app.config.get('AUDIO_TARGET_SR', 22050)
            processor = AudioProcessor(target_sr=target_sr)
            processing_results = processor.process_audio(filepath)
            
            # Add processing results to response
            response_data = {
                "status": "success",
                "message": "File uploaded and processed successfully",
                "filename": filename,
                "size_bytes": file_size,
                "size_mb": round(file_size / (1024 * 1024), 2),
                "saved_path": filepath,
                "audio_analysis": processing_results
            }
        except Exception as proc_error:
            current_app.logger.error(f"Audio processing failed: {str(proc_error)}")
            # Still return success for upload, but note processing failure
            response_data = {
                "status": "success",
                "message": "File uploaded but processing failed",
                "filename": filename,
                "size_bytes": file_size,
                "size_mb": round(file_size / (1024 * 1024), 2),
                "saved_path": filepath,
                "processing_error": str(proc_error)
            }
        
        return jsonify(response_data), 201
        
    except Exception as e:
        current_app.logger.error(f"File upload failed: {str(e)}")
        return jsonify({"error": "File upload failed", "details": str(e)}), 500
