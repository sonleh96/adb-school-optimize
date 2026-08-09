"""Tests for school scoring configuration defaults and validation."""

from school_scoring import ScoringConfig, get_default_config
from school_scoring.exceptions import ConfigurationError
from school_scoring.validators import validate_config


def test_default_config_loads() -> None:
    config = get_default_config()
    assert isinstance(config, ScoringConfig)
    validate_config(config)


def test_default_required_columns_include_every_field_read_by_scoring() -> None:
    config = get_default_config()

    assert "Grade 7-10 Students per 1000 Population" in config.columns.required_columns


def test_config_override_works() -> None:
    config = ScoringConfig.from_dict({"screening": {"quantile": 0.8}})
    assert config.screening.quantile == 0.8


def test_invalid_config_values_fail() -> None:
    config = ScoringConfig.from_dict({"screening": {"quantile": 1.2}})
    try:
        validate_config(config)
    except ConfigurationError:
        assert True
    else:
        raise AssertionError("Expected ConfigurationError")
