"""Tests for school-to-district spatial preflight checks."""

import json
from pathlib import Path

import pandas as pd
from app.ingestion.data_quality import collect_spatial_assignment_issues, preflight_ingestion_inputs


def _district_feature() -> dict:
    return {
        "type": "Feature",
        "properties": {"Province": "Province One", "District": "District One"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[146.0, -10.0], [148.0, -10.0], [148.0, -8.0], [146.0, -8.0], [146.0, -10.0]]],
        },
    }


def test_spatial_assignment_reports_label_mismatch() -> None:
    schools = pd.DataFrame(
        [
            {
                "School Name": "School A",
                "Province": "Province One",
                "District": "Wrong District",
                "Latitude": -9.0,
                "Longitude": 147.0,
            }
        ]
    )

    issues = collect_spatial_assignment_issues(schools, [_district_feature()])

    assert issues == [
        {
            "code": "district_label_spatial_mismatch",
            "severity": "warning",
            "count": 1,
            "message": "School district labels disagree with the covering district polygon.",
            "sample_schools": ["School A"],
        }
    ]


def test_spatial_assignment_reports_point_outside_all_districts() -> None:
    schools = pd.DataFrame(
        [
            {
                "School Name": "School B",
                "Province": "Province One",
                "District": "District One",
                "Latitude": -3.0,
                "Longitude": 160.0,
            }
        ]
    )

    issues = collect_spatial_assignment_issues(schools, [_district_feature()])

    assert issues[0]["code"] == "school_outside_district_boundaries"
    assert issues[0]["severity"] == "error"
    assert issues[0]["count"] == 1


def test_preflight_uses_reference_polygons_with_nam_fields(tmp_path: Path) -> None:
    schools_path = tmp_path / "schools.csv"
    aggregated_path = tmp_path / "aggregated.geojson"
    reference_path = tmp_path / "reference.geojson"
    pd.DataFrame(
        [
            {
                "School Name": "School C",
                "Province": "Province One",
                "District": "District One",
                "Latitude": -9.0,
                "Longitude": 147.0,
            }
        ]
    ).to_csv(schools_path, index=False)

    aggregated_feature = _district_feature()
    aggregated_feature["geometry"]["coordinates"] = [
        [[150.0, -5.0], [151.0, -5.0], [151.0, -4.0], [150.0, -4.0], [150.0, -5.0]]
    ]
    reference_feature = _district_feature()
    reference_feature["properties"] = {"NAM_1": "Province One", "NAM_2": "District One"}
    aggregated_path.write_text(
        json.dumps({"type": "FeatureCollection", "features": [aggregated_feature]}),
        encoding="utf-8",
    )
    reference_path.write_text(
        json.dumps({"type": "FeatureCollection", "features": [reference_feature]}),
        encoding="utf-8",
    )

    issues = preflight_ingestion_inputs(schools_path, aggregated_path, reference_path)

    assert issues == []
