"""Tests for validation helpers in the school scoring package."""

import pandas as pd
import pytest

from school_scoring import get_default_config, get_default_weights, validate_input_data
from school_scoring.exceptions import SchemaValidationError, WeightValidationError
from school_scoring.validators import collect_data_quality_issues, validate_weight_config


def test_missing_required_columns_fail() -> None:
    with pytest.raises(SchemaValidationError):
        validate_input_data(pd.DataFrame({"School Name": ["Only"]}), get_default_config())


def test_missing_scoring_field_fails_schema_validation_before_scoring(sample_school_df) -> None:
    frame = sample_school_df.drop(columns=["Grade 7-10 Students per 1000 Population"])

    with pytest.raises(SchemaValidationError, match="Grade 7-10 Students per 1000 Population"):
        validate_input_data(frame, get_default_config())


def test_bad_weight_sums_fail() -> None:
    weights = get_default_weights().to_dict()
    weights["priority"]["Need"] = 0.9
    with pytest.raises(WeightValidationError):
        validate_weight_config(weights)


def test_coordinates_outside_wgs84_fail_validation(sample_school_df) -> None:
    frame = sample_school_df.copy()
    frame.loc[0, "Latitude"] = -95

    with pytest.raises(SchemaValidationError, match="Latitude"):
        validate_input_data(frame, get_default_config())


def test_progression_above_100_is_reported_without_silent_clipping(sample_school_df) -> None:
    frame = sample_school_df.copy()
    frame["Rate of Grade 7 who progressed to Grade 10 (%)"] = frame[
        "Rate of Grade 7 who progressed to Grade 10 (%)"
    ].astype(float)
    frame.loc[0, "Rate of Grade 7 who progressed to Grade 10 (%)"] = 173.6

    issues = collect_data_quality_issues(frame, get_default_config())

    issue = next(item for item in issues if item["code"] == "percentage_out_of_range")
    assert issue["field"] == "Rate of Grade 7 who progressed to Grade 10 (%)"
    assert issue["count"] == 1
    assert issue["severity"] == "warning"


def test_accessible_population_nesting_violations_are_reported(sample_school_df) -> None:
    frame = sample_school_df.copy()
    frame.loc[0, "pop_with_access_walking"] = 1300
    frame.loc[0, "pop_with_access_cycling"] = 1100
    frame.loc[0, "pop_with_access_driving"] = 1200

    issues = collect_data_quality_issues(frame, get_default_config())

    issue = next(item for item in issues if item["code"] == "accessible_population_not_nested")
    assert issue["count"] == 1
    assert issue["sample_schools"] == ["School A"]


def test_duplicate_coordinates_are_reported(sample_school_df) -> None:
    frame = sample_school_df.copy()
    frame.loc[1, ["Latitude", "Longitude"]] = frame.loc[0, ["Latitude", "Longitude"]].to_numpy()

    issues = collect_data_quality_issues(frame, get_default_config())

    issue = next(item for item in issues if item["code"] == "duplicate_coordinates")
    assert issue["count"] == 2


def test_catchment_area_nesting_uses_area_order_not_polygon_containment(sample_school_df) -> None:
    frame = sample_school_df.iloc[[0]].copy()
    frame.loc[0, "cachment_area_walking"] = "POLYGON ((0 0, 1 0, 1 1, 0 1, 0 0))"
    frame.loc[0, "cachment_area_cycling"] = "POLYGON ((10 10, 12 10, 12 12, 10 12, 10 10))"
    frame.loc[0, "cachment_area_driving"] = "POLYGON ((20 20, 23 20, 23 23, 20 23, 20 20))"

    issues = collect_data_quality_issues(frame, get_default_config())

    assert all(item["code"] != "catchment_not_nested" for item in issues)
