import os
from flask import Flask
from flask_cors import CORS
from .config import config
from .extensions import db, migrate
from .routes.main import bp as main_bp
from .routes.talk import bp as talk_bp


def create_app(config_name=None):
    """Application factory pattern for Flask app initialization."""
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')

    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # Ensure upload + recordings folders exist
    for key in ('UPLOAD_FOLDER', 'RECORDINGS_FOLDER', 'STORAGE_DIR'):
        folder = app.config.get(key)
        if folder:
            os.makedirs(folder, exist_ok=True)

    # The app keeps its data in TigerData; without a database URL it can't do anything useful.
    if not app.config.get('SQLALCHEMY_DATABASE_URI'):
        raise RuntimeError(
            'DATABASE_URL is not set. Put your TigerData (Tiger Cloud) connection string in '
            'backend/.env; see backend/.env.example and backend/docs/DATABASE.md.'
        )

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app)

    # Import models so Alembic/Flask-Migrate can see them for migrations.
    from . import models  # noqa: F401

    # Register blueprints
    app.register_blueprint(main_bp)  # includes /accompaniment/styles and /accompaniment/generate
    app.register_blueprint(talk_bp, url_prefix='/talk')

    # App data (Auth0-protected, stored in TigerData): account + recordings, posts, profiles
    from .routes.account import bp as account_bp
    from .routes.posts import bp as posts_bp
    from .routes.users import bp as users_bp
    app.register_blueprint(account_bp)
    app.register_blueprint(posts_bp)  # discussion hub: posts, comments, likes
    app.register_blueprint(users_bp)  # public profiles

    return app


def main():
    """Run the development server for the ``uv run app`` console command."""
    create_app().run()


# For direct execution (optional)
if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)
