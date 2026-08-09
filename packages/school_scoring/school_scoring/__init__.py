"""Public exports for the school scoring package."""

from .config import (
    ColumnConfig,
    ImputationConfig,
    OutputConfig,
    ScoringConfig,
    ScreeningConfig,
    WeightConfig,
    get_default_config,
    get_default_weights,
)
from .provenance import SCORE_VERSION
from .scoring import run_scoring
from .validators import collect_data_quality_issues, validate_input_data

__all__ = [
    "SCORE_VERSION",
    "ColumnConfig",
    "ImputationConfig",
    "OutputConfig",
    "ScoringConfig",
    "ScreeningConfig",
    "WeightConfig",
    "collect_data_quality_issues",
    "get_default_config",
    "get_default_weights",
    "run_scoring",
    "validate_input_data",
]
