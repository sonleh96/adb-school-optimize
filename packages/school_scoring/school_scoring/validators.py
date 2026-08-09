"""Validation routines for school scoring configuration and input data."""

from __future__ import annotations

from typing import Any

import pandas as pd
from shapely import wkt
from shapely.geometry import Point

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


def _sample_school_names(df: pd.DataFrame, mask: pd.Series, config: ScoringConfig) -> list[str]:
    school_column = config.columns.school_name
    if school_column not in df.columns:
        return []
    return (
        df.loc[mask, school_column]
        .dropna()
        .astype(str)
        .str.strip()
        .loc[lambda values: values != ""]
        .drop_duplicates()
        .head(5)
        .tolist()
    )


def _quality_issue(
    df: pd.DataFrame,
    mask: pd.Series,
    config: ScoringConfig,
    *,
    code: str,
    severity: str,
    message: str,
    field: str | None = None,
) -> dict[str, Any] | None:
    normalized_mask = mask.fillna(False).astype(bool)
    count = int(normalized_mask.sum())
    if count == 0:
        return None
    issue: dict[str, Any] = {
        "code": code,
        "severity": severity,
        "count": count,
        "message": message,
        "sample_schools": _sample_school_names(df, normalized_mask, config),
    }
    if field is not None:
        issue["field"] = field
    return issue


def _parse_geometry(value: object):
    if value is None or pd.isna(value):
        return None
    try:
        return wkt.loads(str(value))
    except (TypeError, ValueError):
        return None


def collect_data_quality_issues(
    df: pd.DataFrame,
    config: ScoringConfig | None = None,
) -> list[dict[str, Any]]:
    """Return non-destructive quality findings that require review before decision use."""
    config = config or get_default_config()
    issues: list[dict[str, Any]] = []

    percentage_columns = [
        "Access Walking (%)",
        "Access Driving (%)",
        "Access Cycling (%)",
        "Rate of Grade 7 who progressed to Grade 10 (%)",
        "Rate of Grade 7 who progressed to Grade 12 (%)",
    ]
    for column in percentage_columns:
        if column not in df.columns:
            continue
        values = pd.to_numeric(df[column], errors="coerce")
        issue = _quality_issue(
            df,
            values.notna() & ((values < 0) | (values > 100)),
            config,
            code="percentage_out_of_range",
            severity="warning",
            field=column,
            message=f"{column} contains values outside the declared 0 to 100 range.",
        )
        if issue:
            issues.append(issue)

    access_columns = [
        "pop_with_access_walking",
        "pop_with_access_cycling",
        "pop_with_access_driving",
    ]
    if all(column in df.columns for column in access_columns):
        access = df[access_columns].apply(pd.to_numeric, errors="coerce")
        complete = access.notna().all(axis=1)
        nesting_violation = complete & (
            (access[access_columns[0]] > access[access_columns[1]])
            | (access[access_columns[1]] > access[access_columns[2]])
        )
        issue = _quality_issue(
            df,
            nesting_violation,
            config,
            code="accessible_population_not_nested",
            severity="warning",
            message="Accessible population is not non-decreasing from walking to cycling to driving.",
        )
        if issue:
            issues.append(issue)

    latitude_column = config.columns.latitude
    longitude_column = config.columns.longitude
    if latitude_column in df.columns and longitude_column in df.columns:
        latitude = pd.to_numeric(df[latitude_column], errors="coerce")
        longitude = pd.to_numeric(df[longitude_column], errors="coerce")
        duplicate_coordinates = latitude.notna() & longitude.notna() & pd.DataFrame(
            {"latitude": latitude, "longitude": longitude}
        ).duplicated(keep=False)
        issue = _quality_issue(
            df,
            duplicate_coordinates,
            config,
            code="duplicate_coordinates",
            severity="warning",
            message="Multiple schools share an exact coordinate and require identity review.",
        )
        if issue:
            issues.append(issue)

    catchment_columns = config.columns.catchment_wkt_columns
    if all(column in df.columns for column in catchment_columns):
        geometries = {
            column: df[column].map(_parse_geometry)
            for column in catchment_columns
        }
        invalid_geometry = pd.Series(False, index=df.index)
        school_outside = pd.Series(False, index=df.index)
        not_nested = pd.Series(False, index=df.index)

        for index in df.index:
            row_geometries = [geometries[column].loc[index] for column in catchment_columns]
            supplied_values = [df.at[index, column] for column in catchment_columns]
            supplied = [value is not None and not pd.isna(value) for value in supplied_values]
            if any(is_supplied and geometry is None for is_supplied, geometry in zip(supplied, row_geometries)):
                invalid_geometry.loc[index] = True
                continue
            if not all(geometry is not None and geometry.is_valid for geometry in row_geometries):
                continue

            if latitude_column in df.columns and longitude_column in df.columns:
                try:
                    school_point = Point(float(df.at[index, longitude_column]), float(df.at[index, latitude_column]))
                except (TypeError, ValueError):
                    school_point = None
                if school_point is not None and any(not geometry.covers(school_point) for geometry in row_geometries):
                    school_outside.loc[index] = True

            walking, cycling, driving = row_geometries
            if walking.area > cycling.area or cycling.area > driving.area:
                not_nested.loc[index] = True

        for issue in (
            _quality_issue(
                df,
                invalid_geometry,
                config,
                code="invalid_catchment_geometry",
                severity="warning",
                message="At least one supplied catchment geometry cannot be parsed.",
            ),
            _quality_issue(
                df,
                school_outside,
                config,
                code="school_outside_own_catchment",
                severity="warning",
                message="At least one travel-mode catchment does not cover its own school point.",
            ),
            _quality_issue(
                df,
                not_nested,
                config,
                code="catchment_not_nested",
                severity="warning",
                message="Catchment area is not non-decreasing from walking to cycling to driving.",
            ),
        ):
            if issue:
                issues.append(issue)

    return issues


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

    coordinate_rules = {
        config.columns.latitude: (-90, 90),
        config.columns.longitude: (-180, 180),
    }
    for column, (minimum, maximum) in coordinate_rules.items():
        values = pd.to_numeric(df[column], errors="coerce")
        invalid_count = int((values.isna() | ~values.between(minimum, maximum)).sum())
        if invalid_count:
            raise SchemaValidationError(
                f"Column '{column}' has {invalid_count} invalid WGS84 coordinate value(s)."
            )

    school_name = config.columns.school_name
    if school_name in df.columns:
        duplicates = df[df[school_name].astype(str).str.strip().duplicated(keep=False)]
        if not duplicates.empty and config.duplicate_policy == "error":
            sample = ", ".join(sorted(duplicates[school_name].astype(str).str.strip().unique())[:5])
            raise SchemaValidationError(f"Duplicate school identifiers found in '{school_name}': {sample}")
