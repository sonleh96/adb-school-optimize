from __future__ import annotations

import pandas as pd

from .config import ScoringConfig
from .exceptions import ConfigurationError, SchemaValidationError
from .utils import mode_or_nan


def _coerce_numeric_columns(df: pd.DataFrame, columns: list[str]) -> None:
    for column in columns:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")


def _ensure_missing_flag(df: pd.DataFrame, column: str) -> None:
    flag_column = f"{column}_orig_missing"
    if flag_column not in df.columns:
        df[flag_column] = df[column].isna().astype(int)


def _hierarchical_impute_numeric(df: pd.DataFrame, config: ScoringConfig, column: str) -> None:
    district_columns = [column_name for column_name in config.imputation.district_group_columns if column_name in df.columns]
    province_column = config.imputation.province_group_column
    if len(district_columns) != len(config.imputation.district_group_columns):
        raise SchemaValidationError("Imputation group columns are missing from the dataset.")

    district_median = df.groupby(district_columns)[column].transform("median")
    province_median = df.groupby(province_column)[column].transform("median")
    national_median = df[column].median()
    df[column] = df[column].fillna(district_median).fillna(province_median).fillna(national_median)


def _hierarchical_impute_categorical(df: pd.DataFrame, config: ScoringConfig, column: str) -> None:
    district_columns = [column_name for column_name in config.imputation.district_group_columns if column_name in df.columns]
    province_column = config.imputation.province_group_column
    if len(district_columns) != len(config.imputation.district_group_columns):
        raise SchemaValidationError("Imputation group columns are missing from the dataset.")

    district_mode = df.groupby(district_columns)[column].transform(mode_or_nan)
    province_mode = df.groupby(province_column)[column].transform(mode_or_nan)
    national_mode = mode_or_nan(df[column])
    df[column] = df[column].fillna(district_mode).fillna(province_mode).fillna(national_mode)


def preprocess_input_data(df: pd.DataFrame, config: ScoringConfig) -> tuple[pd.DataFrame, list[str]]:
    if config.imputation.mode == "custom":
        raise ConfigurationError("imputation.mode='custom' is reserved for a future implementation.")

    processed = df.copy(deep=True)
    warnings: list[str] = []

    _coerce_numeric_columns(processed, config.columns.numeric_imputation_columns)

    if config.imputation.mode == "none":
        for column in config.columns.numeric_imputation_columns + config.columns.categorical_imputation_columns:
            if column in processed.columns and config.imputation.preserve_missing_flags:
                _ensure_missing_flag(processed, column)
        return processed, warnings

    for column in config.columns.numeric_imputation_columns:
        if column in config.imputation.exclude_columns:
            warnings.append(f"Skipped numeric imputation for excluded column '{column}'.")
            continue
        if column not in processed.columns:
            warnings.append(f"Optional numeric imputation column '{column}' is missing.")
            continue
        if config.imputation.preserve_missing_flags:
            _ensure_missing_flag(processed, column)
        _hierarchical_impute_numeric(processed, config, column)

    for column in config.columns.categorical_imputation_columns:
        if column in config.imputation.exclude_columns:
            warnings.append(f"Skipped categorical imputation for excluded column '{column}'.")
            continue
        if column not in processed.columns:
            warnings.append(f"Optional categorical imputation column '{column}' is missing.")
            continue
        if config.imputation.preserve_missing_flags:
            _ensure_missing_flag(processed, column)
        _hierarchical_impute_categorical(processed, config, column)

    return processed, warnings

