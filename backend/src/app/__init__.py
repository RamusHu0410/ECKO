import os
from flask import Flask
from flask_cors import CORS
from .config import config
from .extensions import db, migrate
from .routes.main import bp as main_bp
from .routes.accompaniment import bp as accompaniment_bp


def create_app(config_name=None):
    """Application factory pattern for Flask app initialization."""
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')

    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # Ensure upload + recordings folders exist
    for key in ('UPLOAD_FOLDER', 'RECORDINGS_FOLDER'):
        folder = app.config.get(key)
        if folder:
            os.makedirs(folder, exist_ok=True)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app)

    # Import models so Alembic/Flask-Migrate can see them for migrations.
    from . import models  # noqa: F401

    # Register blueprints
    app.register_blueprint(main_bp)
    app.register_blueprint(accompaniment_bp, url_prefix='/accompaniment')

    # API blueprints (Auth0-protected app data)
    from .routes.auth import bp as auth_bp
    from .routes.recordings import bp as recordings_bp
    from .routes.posts import bp as posts_bp
    from .routes.users import bp as users_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(recordings_bp)
    app.register_blueprint(posts_bp)
    app.register_blueprint(users_bp)

    return app


def main():
    """Run the development server for the ``uv run app`` console command."""
    create_app().run()


# For direct execution (optional)
if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)
