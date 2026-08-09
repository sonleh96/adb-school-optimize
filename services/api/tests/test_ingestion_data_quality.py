"""Tests for school-to-district spatial preflight checks."""

import pandas as pd

from app.ingestion.data_quality import collect_spatial_assignment_issues


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
