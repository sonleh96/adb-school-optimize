"""Validation routines for school scoring configuration and input data."""

from __future__ import annotations

from typing import Any

import pandas as pd

from .config import ScoringConfig, WeightConfig, get_default_config
from .exceptions import ConfigurationError, SchemaValidationError, WeightValidationError


WEIGHT_SUM_GROUPS = [
    "school_access",
    "school_need",
    "admin_access",
    "admin_service",
    "admin_socio",
    "admin_conflict",
    "admin_context",
    "physical",
    "need",
    "impact",
    "practicality",
    "priority",
]


def merge_weight_overrides(
    defaults: dict[str, Any],
    overrides: dict[str, Any] | None,
    path: str = "",
) -> dict[str, Any]:
    if overrides is None:
        return defaults

    merged = {}
    for key, default_value in defaults.items():
        current_path = f"{path}.{key}" if path else key
        if key not in overrides:
            merged[key] = default_value
            continue

        override_value = overrides[key]
        if isinstance(default_value, dict):
            if not isinstance(override_value, dict):
                raise WeightValidationError(f"Expected mapping for weight group '{current_path}'.")
            merged[key] = merge_weight_overrides(default_value, override_value, current_path)
        else:
            merged[key] = override_value

    unknown = set(overrides) - set(defaults)
    if unknown:
        unknown_path = ", ".join(sorted(f"{path}.{key}" if path else key for key in unknown))
        raise WeightValidationError(f"Unknown weight override keys: {unknown_path}")

    return merged


def validate_weight_config(weights: WeightConfig | dict[str, Any]) -> None:
    weight_dict = weights.to_dict() if isinstance(weights, WeightConfig) else weights

    for group in WEIGHT_SUM_GROUPS:
        values = weight_dict[group]
        total = sum(float(value) for value in values.values())
        if abs(total - 1.0) > 1e-9:
            raise WeightValidationError(f"Weight group '{group}' must sum to 1.0, got {total:.6f}.")

    cap = float(weight_dict["girls_bonus"]["cap"])
    if not 0 <= cap <= 1:
        raise WeightValidationError("girls_bonus.cap must be between 0 and 1.")


def validate_config(config: ScoringConfig) -> None:
    if config.imputation.mode not in {"none", "hierarchical", "custom"}:
        raise ConfigurationError("imputation.mode must be one of: none, hierarchical, custom.")
    if config.duplicate_policy not in {"error", "warn"}:
        raise ConfigurationError("duplicate_policy must be 'error' or 'warn'.")
    if config.screening.fixed_cutoff is None:
        if not 0 <= config.screening.quantile <= 1:
            raise ConfigurationError("screening.quantile must be between 0 and 1.")
    else:
        if not 0 <= config.screening.fixed_cutoff <= 1:
            raise ConfigurationError("screening.fixed_cutoff must be between 0 and 1.")
    if len(config.output.sort_by) != len(config.output.ascending):
        raise ConfigurationError("output.sort_by and output.ascending must have the same length.")


def validate_input_data(df: pd.DataFrame, config: ScoringConfig | None = None) -> None:
    config = config or get_default_config()
    validate_config(config)

    missing = [column for column in config.columns.required_columns if column not in df.columns]
    if missing:
        raise SchemaValidationError(f"Missing required columns: {', '.join(missing)}")

    school_name = config.columns.school_name
    if school_name in df.columns:
        duplicates = df[df[school_name].astype(str).str.strip().duplicated(keep=False)]
        if not duplicates.empty and config.duplicate_policy == "error":
            sample = ", ".join(sorted(duplicates[school_name].astype(str).str.strip().unique())[:5])
            raise SchemaValidationError(f"Duplicate school identifiers found in '{school_name}': {sample}")
