import pandas as pd
import pytest

from school_scoring import get_default_config, get_default_weights, validate_input_data
from school_scoring.exceptions import SchemaValidationError, WeightValidationError
from school_scoring.validators import validate_weight_config


def test_missing_required_columns_fail() -> None:
    with pytest.raises(SchemaValidationError):
        validate_input_data(pd.DataFrame({"School Name": ["Only"]}), get_default_config())


def test_bad_weight_sums_fail() -> None:
    weights = get_default_weights().to_dict()
    weights["priority"]["Need"] = 0.9
    with pytest.raises(WeightValidationError):
        validate_weight_config(weights)

