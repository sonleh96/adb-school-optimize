"""Deterministic fingerprints for a scoring run."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import pandas as pd

from .config import ScoringConfig


SCORE_VERSION = "0.1.0-research"


def _sha256_json(value: Any) -> str:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _canonical_dataframe_payload(df: pd.DataFrame) -> dict[str, Any]:
    normalized = df.reindex(sorted(df.columns), axis=1)
    return json.loads(
        normalized.to_json(
            orient="split",
            index=False,
            date_format="iso",
            double_precision=15,
        )
    )


def build_run_manifest(
    df: pd.DataFrame,
    config: ScoringConfig,
    weights: dict[str, Any],
) -> dict[str, Any]:
    """Describe the exact data and declared scoring contract used for a run."""
    return {
        "score_version": SCORE_VERSION,
        "input_sha256": _sha256_json(_canonical_dataframe_payload(df)),
        "config_sha256": _sha256_json(config.to_dict()),
        "weights_sha256": _sha256_json(weights),
        "source_rows": int(len(df)),
        "source_columns": int(len(df.columns)),
    }
