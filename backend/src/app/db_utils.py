"""Database connectivity helpers.

Run a quick connection check against TigerData (the DATABASE_URL in backend/.env):

    cd backend/src
    uv run python -m app.db_utils
"""

from sqlalchemy import text

from app.extensions import db


def test_connection(app=None):
    """Return True if the configured database answers SELECT 1."""
    if app is None:
        from app import create_app

        app = create_app()

    with app.app_context():
        result = db.session.execute(text("SELECT 1")).scalar()
        return result == 1


def timescaledb_version(app):
    """The TimescaleDB extension's version, which every TigerData service has; None elsewhere."""
    with app.app_context():
        if db.engine.dialect.name != "postgresql":
            return None
        return db.session.execute(
            text("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'")
        ).scalar()


def main():
    from app import create_app

    app = create_app()
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    # Mask credentials when echoing the target.
    safe = uri
    if "@" in uri:
        safe = uri.split("://", 1)[0] + "://***@" + uri.split("@", 1)[1]
    try:
        if test_connection(app):
            print("Database connection successful")
            print(f"Connected to: {safe}")
            print(f"TigerData (TimescaleDB): {timescaledb_version(app) or 'not found, this is not a TigerData service'}")
        else:
            print("Database connection failed: unexpected result")
    except Exception as exc:  # noqa: BLE001
        print("Database connection failed")
        print(f"Target: {safe}")
        print(f"Error: {exc}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
