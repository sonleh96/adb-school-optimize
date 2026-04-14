"""Tests for end-to-end scoring outputs."""

from school_scoring import run_scoring


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
