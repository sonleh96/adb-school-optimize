"""Exact ordering, school-name tie-break, and rank envelopes."""

from __future__ import annotations

import numpy as np
from school_scoring.screening.ranking import need_first_envelope, point_ranks, rank_envelope


def arr(*values: float) -> np.ndarray:
    return np.array(values)


def everyone(n: int) -> np.ndarray:
    return np.ones(n, dtype=bool)


def test_equal_scores_are_separated_by_school_name_ascending():  # FM6
    assert point_ranks([(-0.5,), (-0.5,), (-0.5,)], ["Bravo", "Alpha", "Charlie"], [True] * 3) == [2, 1, 3]


def test_a_difference_in_the_last_bit_decides_rank_before_the_name_does():  # FM6
    just_above = 0.1 + 0.2
    assert just_above != 0.3
    assert point_ranks([(-0.3,), (-just_above,)], ["A", "Z"], [True, True]) == [2, 1]


def test_excluded_records_receive_no_rank_and_do_not_shift_the_others():  # FM10
    assert point_ranks([(-0.9,), (-0.5,), (-0.1,)], ["A", "B", "C"], [True, False, True]) == [1, None, 2]


def test_fixed_unequal_scores_have_equal_best_and_worst_rank():  # FM7
    best, worst = rank_envelope(arr(0.9, 0.5, 0.1), arr(0.9, 0.5, 0.1), ["Zed", "Beta", "Alpha"], everyone(3))
    assert (best, worst) == ([1, 2, 3], [1, 2, 3])


def test_fixed_equal_scores_follow_the_name_order_in_both_bounds():  # FM6, FM7
    best, worst = rank_envelope(
        arr(0.5, 0.5, 0.5), arr(0.5, 0.5, 0.5), ["Bravo", "Alpha", "Charlie"], everyone(3)
    )
    assert (best, worst) == ([2, 1, 3], [2, 1, 3])


def test_overlapping_intervals_keep_both_possible_orders():  # FM7
    best, worst = rank_envelope(arr(0.4, 0.3), arr(0.8, 0.7), ["A", "B"], everyone(2))
    assert (best, worst) == ([1, 1], [2, 2])


def test_a_single_record_does_not_count_itself():  # FM7
    assert rank_envelope(arr(0.2), arr(0.8), ["Only"], everyone(1)) == ([1], [1])


def test_an_upper_bound_equal_to_a_rival_lower_bound_is_resolved_by_name():  # FM6, FM7
    best, worst = rank_envelope(arr(0.4, 0.5), arr(0.5, 0.6), ["A", "B"], everyone(2))
    assert (best, worst) == ([1, 1], [2, 2])


def test_a_clearly_lower_interval_is_worst_ranked_last():  # FM7
    best, worst = rank_envelope(arr(0.9, 0.1), arr(0.9, 0.2), ["A", "B"], everyone(2))
    assert (best, worst) == ([1, 2], [1, 2])


def test_excluded_records_are_not_competitors_in_the_envelope():  # FM1, FM7
    best, worst = rank_envelope(
        arr(0.9, 0.5, 0.1), arr(0.9, 0.5, 0.1), ["A", "B", "C"], np.array([False, True, True])
    )
    assert (best, worst) == ([None, 1, 2], [None, 1, 2])


def test_need_first_higher_need_wins_even_with_a_lower_secondary_score():  # FM7
    need, secondary = arr(0.9, 0.5, 0.5, 0.5), arr(0.1, 0.9, 0.2, 0.2)
    names = ["X", "Y", "Z", "W"]
    best, worst = need_first_envelope(need, secondary, secondary, names, everyone(4))
    assert (best, worst) == ([1, 2, 4, 3], [1, 2, 4, 3])


def test_need_first_offsets_equal_need_groups_by_the_count_above_them():  # FM7
    need = arr(0.9, 0.5, 0.5)
    best, worst = need_first_envelope(
        need, arr(0.0, 0.1, 0.3), arr(0.0, 0.5, 0.4), ["A", "B", "C"], everyone(3)
    )
    assert (best, worst) == ([1, 2, 2], [1, 3, 3])


def test_need_first_groups_form_on_exactly_equal_need():  # FM6
    need = arr(0.1 + 0.2, 0.3)
    best, worst = need_first_envelope(need, arr(0.0, 0.9), arr(0.0, 0.9), ["A", "B"], everyone(2))
    assert (best, worst) == ([1, 2], [1, 2])
