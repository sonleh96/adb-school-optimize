"""Spatial preflight checks for school ingestion."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
from shapely.geometry import Point, shape


def _sample_school_names(df: pd.DataFrame, mask: pd.Series) -> list[str]:
    if "School Name" not in df.columns:
        return []
    return (
        df.loc[mask, "School Name"]
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
    *,
    code: str,
    severity: str,
    message: str,
) -> dict[str, Any] | None:
    normalized_mask = mask.fillna(False).astype(bool)
    count = int(normalized_mask.sum())
    if count == 0:
        return None
    return {
        "code": code,
        "severity": severity,
        "count": count,
        "message": message,
        "sample_schools": _sample_school_names(df, normalized_mask),
    }


def collect_spatial_assignment_issues(
    schools: pd.DataFrame,
    district_features: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return spatial assignment issues for school coordinates vs district polygons."""
    geometries = []
    for feature in district_features:
        geometry = shape(feature["geometry"])
        properties = feature.get("properties") or {}
        geometries.append(
            {
                "geometry": geometry,
                "province": str(properties.get("Province") or properties.get("NAM_1") or "").strip(),
                "district": str(properties.get("District") or properties.get("NAM_2") or "").strip(),
            }
        )

    outside_mask = pd.Series(False, index=schools.index)
    label_mismatch_mask = pd.Series(False, index=schools.index)

    for index, row in schools.iterrows():
        latitude = pd.to_numeric(row.get("Latitude"), errors="coerce")
        longitude = pd.to_numeric(row.get("Longitude"), errors="coerce")
        if pd.isna(latitude) or pd.isna(longitude):
            continue

        point = Point(float(longitude), float(latitude))
        covering = [item for item in geometries if item["geometry"].covers(point)]
        if not covering:
            outside_mask.at[index] = True
            continue

        province = str(row.get("Province", "")).strip()
        district = str(row.get("District", "")).strip()
        if not any(
            item["province"] == province and item["district"] == district for item in covering
        ):
            label_mismatch_mask.at[index] = True

    issues: list[dict[str, Any]] = []
    outside_issue = _quality_issue(
        schools,
        outside_mask,
        code="school_outside_district_boundaries",
        severity="error",
        message="School coordinates fall outside every provided district polygon.",
    )
    if outside_issue:
        issues.append(outside_issue)

    mismatch_issue = _quality_issue(
        schools,
        label_mismatch_mask,
        code="district_label_spatial_mismatch",
        severity="warning",
        message="School district labels disagree with the covering district polygon.",
    )
    if mismatch_issue:
        issues.append(mismatch_issue)

    return issues


def preflight_ingestion_inputs(
    schools_path: Path,
    districts_path: Path,
    district_reference_path: Path | None = None,
) -> list[dict[str, Any]]:
    """Load school and district inputs and fail fast on blocking spatial issues."""
    schools = pd.read_csv(schools_path)
    if "School Name" in schools.columns:
        schools = schools[schools["School Name"].astype(str).str.strip() != "School Name"].copy()

    spatial_source = district_reference_path or districts_path
    districts_payload = json.loads(Path(spatial_source).read_text(encoding="utf-8"))
    district_features = districts_payload["features"]
    issues = collect_spatial_assignment_issues(schools, district_features)

    for issue in issues:
        sample = ", ".join(issue.get("sample_schools") or [])
        suffix = f" Samples: {sample}." if sample else ""
        print(f"[{issue['severity']}] {issue['message']} Affected rows: {issue['count']}.{suffix}")

    blocking = [issue for issue in issues if issue["severity"] == "error"]
    if blocking:
        codes = ", ".join(sorted({issue["code"] for issue in blocking}))
        raise SystemExit(f"Ingestion preflight failed with blocking spatial issues: {codes}")

    return issues
