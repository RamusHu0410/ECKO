from flask import Blueprint, jsonify, current_app

bp = Blueprint('main', __name__)

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
