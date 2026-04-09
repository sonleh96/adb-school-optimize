from __future__ import annotations

import re

import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely.ops import transform
from shapely.wkt import loads


def minmax(s: pd.Series) -> pd.Series:
    s = pd.to_numeric(s, errors="coerce")
    valid = s.dropna()
    if valid.empty:
        return pd.Series(np.nan, index=s.index, dtype="float64")
    mn, mx = valid.min(), valid.max()
    if mx == mn:
        return pd.Series(0.0, index=s.index, dtype="float64")
    return (s - mn) / (mx - mn)


def inv_minmax(s: pd.Series) -> pd.Series:
    return 1 - minmax(s)


def clip01(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").clip(lower=0, upper=1)


def clean_text(value: object) -> object:
    if pd.isna(value):
        return np.nan
    return str(value).strip().lower()


def normalize_join_key(value: object) -> object:
    cleaned = clean_text(value)
    if pd.isna(cleaned):
        return np.nan
    return re.sub(r"\s+", " ", str(cleaned))


def row_mean(df: pd.DataFrame, columns: list[str] | tuple[str, ...]) -> pd.Series:
    return df[list(columns)].apply(pd.to_numeric, errors="coerce").mean(axis=1, skipna=True)


def safe_div(num: pd.Series, den: pd.Series) -> pd.Series:
    numerator = pd.to_numeric(num, errors="coerce")
    denominator = pd.to_numeric(den, errors="coerce").replace({0: np.nan})
    return numerator / denominator


def wkt_area_m2(
    series: pd.Series,
    source_crs: str = "EPSG:4326",
    area_crs: str = "EPSG:3857",
) -> pd.Series:
    transformer = Transformer.from_crs(source_crs, area_crs, always_xy=True)

    def _load(value: object):
        if pd.isna(value):
            return None
        try:
            return loads(value)
        except Exception:
            return None

    def _area(value: object) -> float:
        geometry = _load(value)
        if geometry is None:
            return np.nan
        try:
            projected = transform(transformer.transform, geometry)
            return float(projected.area)
        except Exception:
            return np.nan

    return series.apply(_area)


def mode_or_nan(series: pd.Series) -> object:
    mode = series.dropna().mode()
    return mode.iloc[0] if len(mode) else np.nan


def score_power(value: object) -> float:
    text = clean_text(value)
    if pd.isna(text):
        return np.nan
    if any(token in text for token in ["none", "no power", "nil", "not available"]):
        return 1.0
    if "generator" in text:
        return 0.7
    if "solar" in text and "grid" not in text:
        return 0.4
    if any(token in text for token in ["png power", "grid", "mains", "electricity"]):
        return 0.2
    return 0.5


def score_water(value: object) -> float:
    text = clean_text(value)
    if pd.isna(text):
        return np.nan
    if any(
        token in text
        for token in ["river", "stream", "creek", "pond", "unprotected", "not available", "none"]
    ):
        return 1.0
    if any(token in text for token in ["well", "bore", "rain", "tank"]):
        return 0.5
    if any(token in text for token in ["piped", "tap", "reticulated"]):
        return 0.2
    return 0.5


def fill_with_median_or_default(series: pd.Series, default: float = 0.5) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    valid = numeric.dropna()
    if valid.empty:
        return pd.Series(default, index=series.index, dtype="float64")
    return numeric.fillna(valid.median())
