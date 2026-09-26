import pytest
from app import create_app


def test_create_app_returns_flask_app():
    app = create_app()
    assert app is not None
    assert hasattr(app, "config")


def test_create_app_with_config_name():
    app = create_app("testing")
    assert app is not None
    assert hasattr(app, "config")


def test_create_app_registers_blueprints(app):
    from app.routes.main import bp as main_bp
    assert main_bp in app.blueprints.values()
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert {"/accompaniment/styles", "/accompaniment/generate"} <= rules
