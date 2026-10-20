"""Ranking rules against each other on one declared common cohort."""

from __future__ import annotations

import pytest
from school_scoring.screening import (
    CommonRanks,
    PointScore,
    RankChange,
    TopChange,
    TopKAgreement,
    common_cohort,
    compare_ranks,
    pairwise_metrics,
    rank_in_common_cohort,
    rank_point_scores,
    screen,
)
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


# ---------------------------------------------------------------------------------------------
# Pairwise metrics. Expected values are worked out by hand from the rank vectors.
# ---------------------------------------------------------------------------------------------


def ranks_of(rule_id: str, order: list[str]) -> CommonRanks:
    """A rank table that lists schools best first."""
    return CommonRanks(
        rule_id, "test cohort", len(order), tuple((name, i) for i, name in enumerate(order, 1))
    )


def schools(n: int) -> list[str]:
    return [f"S{i:02d}" for i in range(1, n + 1)]


def test_identical_orders_agree_completely():  # FM13
    same = schools(4)
    m = compare_ranks(ranks_of("additive_u", same), ranks_of("benchmark", same))
    assert (m.n, m.spearman_rank, m.kendall_tau, m.pairwise_discordance) == (4, 1.0, 1.0, 0.0)
    assert (m.median_absolute_rank_shift, m.maximum_absolute_rank_shift) == (0.0, 0.0)
    assert m.top_k[0] == TopKAgreement(k=10, overlap=4, jaccard=1.0, size_a=4, size_b=4)
    assert m.top20_changes == ()


def test_reversed_orders_disagree_completely():  # FM13
    names = schools(4)
    m = compare_ranks(ranks_of("additive_u", names), ranks_of("benchmark", names[::-1]))
    assert (m.spearman_rank, m.kendall_tau, m.pairwise_discordance) == (-1.0, -1.0, 1.0)
    # Rank shifts are 3, 1, 1, 3.
    assert (m.median_absolute_rank_shift, m.maximum_absolute_rank_shift) == (2.0, 3.0)


def test_one_swap_across_the_top_twenty_boundary_among_twenty_five_schools():  # FM13
    a = schools(25)
    b = [*a[:19], a[20], a[19], *a[21:]]  # S20 and S21 trade places
    m = compare_ranks(ranks_of("additive_u", a), ranks_of("benchmark", b))
    # Spearman 1 - 6 * (1 + 1) / (25 * 624); one discordant pair of 300.
    assert m.spearman_rank == pytest.approx(0.9992307692307692, abs=1e-12)
    assert m.pairwise_discordance == pytest.approx(1 / 300, abs=1e-15)
    assert m.kendall_tau == pytest.approx(0.9933333333333333, abs=1e-12)
    assert (m.median_absolute_rank_shift, m.maximum_absolute_rank_shift) == (0.0, 1.0)
    assert [(t.k, t.overlap, t.size_a, t.size_b) for t in m.top_k] == [
        (10, 10, 10, 10),
        (20, 19, 20, 20),
        (30, 25, 25, 25),  # a size is min(k, n)
        (40, 25, 25, 25),
    ]
    assert m.top_k[1].jaccard == pytest.approx(19 / 21)  # 19 shared of 21 distinct schools
    assert m.top_k[2].jaccard == 1.0
    assert m.top20_changes == (
        RankChange(TopChange.EXIT, "S20", rank_a=20, rank_b=21),
        RankChange(TopChange.ENTRANT, "S21", rank_a=21, rank_b=20),
    )


def test_exits_follow_rank_under_a_and_entrants_follow_rank_under_b():  # FM13
    a = schools(25)
    b = list(a)
    b[18], b[23] = a[23], a[18]  # S19 and S24 trade places
    b[19], b[21] = a[21], a[19]  # S20 and S22 trade places
    m = compare_ranks(ranks_of("additive_u", a), ranks_of("benchmark", b))
    assert [(c.status.value, c.school_name, c.rank_a, c.rank_b) for c in m.top20_changes] == [
        ("exit", "S19", 19, 24),
        ("exit", "S20", 20, 22),
        # Entrant order is by rank under b (19 then 20). Ordering by rank under a would put S22 first.
        ("entrant", "S24", 24, 19),
        ("entrant", "S22", 22, 20),
    ]


def test_metrics_from_engine_runs_use_the_common_cohort_and_each_rules_own_order():  # FM10, FM13
    members = prepared(
        ("X", components(N=0.9, A=0.0)),
        ("Y", components(N=0.8, A=1.0)),
        ("Z", components(N=0.1, A=0.0)),
        ("Interval", components(N=0.95, Q=None)),
    )
    need_first, additive = screen(members, "need_first_no_u"), screen(members, "additive_no_u")
    # Need-first puts X ahead of Y on N; the additive score puts Y ahead on A. The interval school joins neither ranking.
    assert [r.rank_point for r in need_first.results] == [1, 2, 3, None]
    assert [r.rank_point for r in additive.results] == [2, 1, 3, None]

    m = pairwise_metrics(need_first, additive)

    assert (m.rule_id_a, m.rule_id_b, m.n) == ("need_first_no_u", "additive_no_u", 3)
    assert m.scope == "common complete cohort of need_first_no_u, additive_no_u (3)"
    assert m.spearman_rank == pytest.approx(0.5, abs=1e-15)  # 1 - 6 * 2 / 24
    assert m.pairwise_discordance == pytest.approx(1 / 3, abs=1e-15)
    assert m.kendall_tau == pytest.approx(1 / 3, abs=1e-15)
    assert (m.median_absolute_rank_shift, m.maximum_absolute_rank_shift) == (1.0, 1.0)
    assert m.top_k[0] == TopKAgreement(k=10, overlap=3, jaccard=1.0, size_a=3, size_b=3)


def test_undefined_metrics_are_none_not_numbers():  # FM13
    one = compare_ranks(ranks_of("additive_u", ["Only"]), ranks_of("benchmark", ["Only"]))
    assert (one.n, one.spearman_rank, one.kendall_tau, one.pairwise_discordance) == (1, None, None, None)
    assert (one.median_absolute_rank_shift, one.maximum_absolute_rank_shift) == (0.0, 0.0)

    empty = compare_ranks(ranks_of("additive_u", []), ranks_of("benchmark", []))
    assert (empty.n, empty.median_absolute_rank_shift, empty.maximum_absolute_rank_shift) == (0, None, None)
    assert [t.jaccard for t in empty.top_k] == [None] * 4


def test_rank_tables_over_different_schools_or_scopes_are_refused():  # FM2, FM10
    with pytest.raises(ValueError, match="same schools"):
        compare_ranks(ranks_of("additive_u", ["A", "B"]), ranks_of("benchmark", ["A", "C"]))
    other_scope = CommonRanks("benchmark", "another cohort", 1, (("A", 1),))
    with pytest.raises(ValueError, match="same schools"):
        compare_ranks(ranks_of("additive_u", ["A"]), other_scope)


def test_ranking_point_scores_requires_the_primary_key_exactly_for_need_first_rules():  # FM6, FM8
    entries = [PointScore("A", None, 0.5), PointScore("B", None, 0.5)]
    assert rank_point_scores("additive_u", "scope", entries).by_school() == {"A": 1, "B": 2}
    with pytest.raises(ValueError, match="need first"):
        rank_point_scores("need_first_u", "scope", entries)
    with pytest.raises(ValueError, match="need first"):
        rank_point_scores("additive_u", "scope", [PointScore("A", 0.4, 0.5)])
