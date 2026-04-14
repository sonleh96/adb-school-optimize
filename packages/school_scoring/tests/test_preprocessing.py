"""Tests for school scoring preprocessing behavior."""

from school_scoring import get_default_config
from school_scoring.preprocessing import preprocess_input_data


def test_hierarchical_imputation_sets_flags(sample_school_df) -> None:
    processed, warnings = preprocess_input_data(sample_school_df, get_default_config())
    assert "Number of Available Teachers_orig_missing" in processed.columns
    assert processed.loc[2, "Number of Available Teachers_orig_missing"] == 1
    assert processed.loc[2, "Number of Available Teachers"] == processed["Number of Available Teachers"].median()
    assert isinstance(warnings, list)
