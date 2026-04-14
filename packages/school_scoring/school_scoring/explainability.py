"""Helpers for explaining how school scores were derived."""

from __future__ import annotations

from typing import Any

import pandas as pd


def build_score_breakdown(row: pd.Series | dict[str, Any], applied_weights: dict[str, Any]) -> dict[str, Any]:
    values = row if isinstance(row, dict) else row.to_dict()
    return {
        "Priority": {
            "score": values.get("Priority"),
            "inputs": {
                "Need": values.get("Need"),
                "I": values.get("I"),
                "P": values.get("P"),
            },
            "weights": applied_weights.get("priority", {}),
        },
        "Need": {
            "score": values.get("Need"),
            "inputs": {
                "S": values.get("S"),
                "A": values.get("A"),
                "R_phys": values.get("R_phys"),
                "G": values.get("G"),
            },
            "weights": applied_weights.get("need", {}),
            "girls_bonus": applied_weights.get("girls_bonus", {}),
        },
        "Diagnostics": {
            "data_confidence": values.get("data_confidence"),
            "stage1_selected": values.get("stage1_selected"),
        },
    }


def summarize_missingness(df: pd.DataFrame) -> dict[str, Any]:
    missing_counts = df.isna().sum()
    return {
        "rows": int(len(df)),
        "columns_with_missing": int((missing_counts > 0).sum()),
        "missing_counts": {
            column: int(count) for column, count in missing_counts.items() if count > 0
        },
    }


def summarize_imputation(df: pd.DataFrame) -> dict[str, Any]:
    flag_columns = [column for column in df.columns if column.endswith("_orig_missing")]
    return {
        "flag_columns": flag_columns,
        "imputed_counts": {
            column: int(pd.to_numeric(df[column], errors="coerce").sum()) for column in flag_columns
        },
    }
