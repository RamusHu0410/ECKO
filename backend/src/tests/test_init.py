import pytest
from src.app import create_app


def test_create_app_returns_flask_app():
    app = create_app()
    assert app is not None
    assert hasattr(app, "config")


def test_create_app_with_config_name():
    app = create_app("testing")
    assert app is not None
    assert hasattr(app, "config")


def test_create_app_registers_blueprints(app):
    from src.app.routes.main import bp as main_bp
    from src.app.routes.accompaniment import bp as accomp_bp
    assert main_bp in app.blueprints.values()
    assert accomp_bp in app.blueprints.values()
