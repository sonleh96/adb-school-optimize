"""Tests for end-to-end scoring outputs."""

import pandas as pd

from school_scoring import run_scoring
from school_scoring.config import get_default_config, get_default_weights
from school_scoring.preprocessing import preprocess_input_data
from school_scoring.scoring import (
    compute_need_score,
    compute_priority_score,
    compute_school_need_subscore,
)
from school_scoring.utils import score_power, score_water


def test_run_scoring_returns_required_columns(sample_school_df) -> None:
    result = run_scoring(sample_school_df)
    required = {
        "School Name",
        "Province",
        "District",
        "S",
        "A",
        "R_phys",
        "G",
        "Need",
        "I",
        "P",
        "Priority",
        "data_confidence",
        "stage1_selected",
        "Locality_score",
        "school_access_barrier",
        "teacher_scarcity",
        "classroom_stock_deficit",
        "service_deficit",
        "facility_deficit",
        "teacher_housing_deficit",
        "prog10_deficit",
        "female_disadvantage",
        "ConflictAdm",
        "accessible_pop",
        "catchment_area",
    }
    assert required.issubset(set(result.scored_data.columns))
    assert result.scored_data.iloc[0]["Priority"] >= result.scored_data.iloc[-1]["Priority"]


def test_need_score_matches_declared_high_level_formula() -> None:
    frame = pd.DataFrame({"S": [0.8], "A": [0.4], "R_phys": [0.2], "G": [0.05]})

    result = compute_need_score(frame, get_default_config(), get_default_weights())

    expected = 0.55 * 0.8 + 0.25 * 0.4 + 0.20 * 0.2 + 0.05
    assert result.loc[0, "Need"] == expected


def test_priority_score_matches_declared_high_level_formula() -> None:
    frame = pd.DataFrame({"Need": [0.7], "I": [0.5], "P": [0.3]})

    result = compute_priority_score(frame, get_default_config(), get_default_weights())

    expected = 0.70 * 0.7 + 0.20 * 0.5 + 0.10 * 0.3
    assert result.loc[0, "Priority"] == expected


def test_service_deficit_matches_current_research_formula(sample_school_df) -> None:
    config = get_default_config()
    processed, _ = preprocess_input_data(sample_school_df, config)

    result = compute_school_need_subscore(processed, config, get_default_weights())

    expected = 0.40 * score_power("Generator") + 0.30 * score_water("River")
    assert result.loc[0, "service_deficit"] == expected


def test_run_manifest_hashes_inputs_and_scoring_contract(sample_school_df) -> None:
    first = run_scoring(sample_school_df)
    second = run_scoring(sample_school_df.copy())
    changed_frame = sample_school_df.copy()
    changed_frame.loc[0, "Number of Available Teachers"] = 11
    changed = run_scoring(changed_frame)

    assert first.run_manifest["score_version"] == "0.1.0-research"
    assert len(first.run_manifest["input_sha256"]) == 64
    assert first.run_manifest["input_sha256"] == second.run_manifest["input_sha256"]
    assert first.run_manifest["input_sha256"] != changed.run_manifest["input_sha256"]
    assert len(first.run_manifest["config_sha256"]) == 64
    assert len(first.run_manifest["weights_sha256"]) == 64
