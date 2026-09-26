import os
from flask import Flask
from .config import config
from .routes.main import bp as main_bp
from .routes.accompaniment import bp as accompaniment_bp

def create_app(config_name=None):
    """Application factory pattern for Flask app initialization."""
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')
    
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # Ensure upload folder exists
    upload_folder = app.config.get('UPLOAD_FOLDER')
    if upload_folder:
        os.makedirs(upload_folder, exist_ok=True)
    
    # Register blueprints
    app.register_blueprint(main_bp)
    app.register_blueprint(accompaniment_bp)
    
    # Initialize extensions here if needed
    # from .extensions import db, migrate
    # db.init_app(app)
    # migrate.init_app(app, db)
    
    return app

# For direct execution (optional)
if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)
