import pytest
from src.app.config import Config, DevelopmentConfig, ProductionConfig, TestingConfig


def test_config_defaults():
    config = Config()
    assert config is not None


def test_development_config():
    config = DevelopmentConfig()
    assert config is not None
    assert config.DEBUG is True


def test_production_config():
    config = ProductionConfig()
    assert config is not None
    assert config.DEBUG is False


def test_testing_config():
    config = TestingConfig()
    assert config is not None
    assert config.TESTING is True
