"""Ranking helpers for ordered school scoring outputs."""

from __future__ import annotations

import pandas as pd

from .config import ScoringConfig


def compute_stage1_screening(df: pd.DataFrame, config: ScoringConfig) -> pd.DataFrame:
    result = df.copy()
    if config.screening.fixed_cutoff is not None:
        cutoff = config.screening.fixed_cutoff
    else:
        cutoff = result["Need"].quantile(config.screening.quantile)
    result["stage1_selected"] = result["Need"] >= cutoff
    result["stage1_cutoff"] = cutoff
    return result


def rank_scores(df: pd.DataFrame, config: ScoringConfig) -> pd.DataFrame:
    ranked = df.sort_values(config.output.sort_by, ascending=config.output.ascending, kind="mergesort").copy()
    ranked["rank_priority"] = range(1, len(ranked) + 1)
    ranked["rank_need"] = (
        ranked["Need"]
        .rank(method="dense", ascending=False)
        .astype(int)
    )
    return ranked
