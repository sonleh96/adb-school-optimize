"""Ranking rules against each other on one declared common cohort."""

from __future__ import annotations

import pytest
from school_scoring.screening import common_cohort, rank_in_common_cohort, screen
from screening_prepared import components, prepared


def three_schools():
    return prepared(
        ("Interval", components(N=0.9, Q=None)),
        ("First", components(N=0.7)),
        ("Second", components(N=0.5)),
    )


def test_common_cohort_drops_a_school_that_is_interval_under_any_compared_rule():  # FM10
    members = three_schools()
    benchmark, additive = screen(members, "benchmark"), screen(members, "additive_no_u")
    assert [r.rank_point for r in benchmark.results] == [1, 2, 3]
    cohort = common_cohort(benchmark, additive)
    assert cohort.school_names == ("First", "Second")
    assert cohort.scope == "common complete cohort of benchmark, additive_no_u (2)"


def test_ranks_in_a_common_cohort_differ_from_the_rules_own_point_ranks_and_carry_their_scope():  # FM10
    members = three_schools()
    benchmark, additive = screen(members, "benchmark"), screen(members, "additive_no_u")
    cohort = common_cohort(benchmark, additive)
    ranks = rank_in_common_cohort(benchmark, cohort)
    assert ranks.by_school() == {"First": 1, "Second": 2}
    assert (ranks.rule_id, ranks.count, ranks.scope) == ("benchmark", 2, cohort.scope)
    assert rank_in_common_cohort(additive, cohort).by_school() == {"First": 1, "Second": 2}


def test_need_first_ranks_in_a_common_cohort_sort_on_need_then_the_secondary_score():  # FM6, FM7
    members = prepared(
        ("A", components(N=0.5, A=1.0)),
        ("B", components(N=0.9, A=0.0)),
        ("C", components(N=0.5, A=0.2)),
    )
    runs = [screen(members, "need_first_no_u"), screen(members, "additive_no_u")]
    ranks = rank_in_common_cohort(runs[0], common_cohort(*runs))
    assert ranks.by_school() == {"B": 1, "A": 2, "C": 3}


def test_equal_scores_in_a_common_cohort_are_ordered_by_school_name():  # FM6
    members = prepared(("Zulu", components()), ("Alpha", components()))
    run = screen(members, "additive_u")
    assert rank_in_common_cohort(run, common_cohort(run)).by_school() == {"Zulu": 2, "Alpha": 1}


def test_runs_from_different_inputs_cannot_share_a_cohort():  # FM2
    first = screen(prepared(("A", components())), "additive_u")
    second = screen(prepared(("B", components())), "additive_no_u")
    with pytest.raises(ValueError, match="same input"):
        common_cohort(first, second)


def test_a_run_outside_the_cohort_definition_is_refused():  # FM10
    members = three_schools()
    cohort = common_cohort(screen(members, "benchmark"))
    with pytest.raises(ValueError, match="not one of the runs"):
        rank_in_common_cohort(screen(members, "additive_no_u"), cohort)
