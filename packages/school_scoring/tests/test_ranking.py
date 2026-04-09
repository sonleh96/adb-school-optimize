import pandas as pd

from school_scoring import get_default_config
from school_scoring.ranking import rank_scores


def test_ranking_breaks_ties_by_need() -> None:
    df = pd.DataFrame(
        [
            {"School Name": "A", "Need": 0.8, "Priority": 0.7},
            {"School Name": "B", "Need": 0.9, "Priority": 0.7},
        ]
    )
    ranked = rank_scores(df, get_default_config())
    assert ranked.iloc[0]["School Name"] == "B"
    assert ranked.iloc[0]["rank_priority"] == 1

