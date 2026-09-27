import os
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
# Load .env from backend/ root (two levels up from src/app/)
load_dotenv(os.path.join(basedir, '..', '..', '.env'))


def _normalize_db_url(url):
    """Normalize a TigerData/Postgres URL to use the psycopg (v3) driver.

    Tiger Cloud hands you a connection string like:
        postgresql://user:pass@host:port/dbname?sslmode=require
    SQLAlchemy needs an explicit driver, so we map it to psycopg3.
    """
    if not url:
        return url
    if url.startswith('postgres://'):
        url = 'postgresql://' + url[len('postgres://'):]
    if url.startswith('postgresql://'):
        url = 'postgresql+psycopg://' + url[len('postgresql://'):]
    return url


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-change-in-production'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False

    # Pre-ping avoids stale connections dropped by Tiger Cloud's proxy.
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True}

    # File upload configuration
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max file size
    UPLOAD_EXTENSIONS = ['wav', 'wave']
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER') or \
        os.path.join(basedir, '..', '..', 'uploads')

    # Where generated recordings (MIDI/WAV) are persisted.
    RECORDINGS_FOLDER = os.environ.get('RECORDINGS_FOLDER') or \
        os.path.join(basedir, '..', '..', 'recordings')

    # Where users' saved recordings (the final output audio) are stored, outside the database.
    # Files go to <STORAGE_DIR>/recordings/<user_id>/<recording_id>.<ext>; see app/storage.py.
    STORAGE_DIR = os.environ.get('STORAGE_DIR') or os.path.join(basedir, '..', '..', 'storage')

    # One folder per song the pipeline makes (app/audio/pipeline.py): every step's files and a log.
    RUNS_DIR = os.environ.get('RUNS_DIR') or os.path.join(basedir, '..', '..', 'storage', 'runs')

    # --- Auth0 (identity provider) -------------------------------------
    # Auth0 owns identity. The backend only validates access tokens Auth0
    # issues and links requests to app data via the "sub" claim.
    AUTH0_DOMAIN = os.environ.get('AUTH0_DOMAIN')          # e.g. dev-xxxx.us.auth0.com
    AUTH0_API_AUDIENCE = os.environ.get('AUTH0_API_AUDIENCE')  # e.g. https://api.melodyrecorder.com
    AUTH0_ALGORITHMS = ['RS256']


class DevelopmentConfig(Config):
    DEBUG = True
    # The TigerData (Tiger Cloud) service. No SQLite fallback: create_app refuses to start without it.
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(os.environ.get('DATABASE_URL'))


class ProductionConfig(Config):
    DEBUG = False
    # Expects DATABASE_URL to be set (Tiger Cloud / Postgres connection string).
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(os.environ.get('DATABASE_URL'))


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(os.environ.get('TEST_DATABASE_URL')) or \
        'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False
    UPLOAD_FOLDER = os.path.join(basedir, '..', '..', 'test_uploads')

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
