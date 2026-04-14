"""Schema definitions for validated school scoring inputs and outputs."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class ScoringResult:
    scored_data: pd.DataFrame
    summary: dict[str, Any]
    applied_config: dict[str, Any]
    applied_weights: dict[str, Any]
    warnings: list[str] = field(default_factory=list)
