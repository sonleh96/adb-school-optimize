"""Scoring layer: literal arithmetic, bounds, scopes, and the urgency boundary."""

from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path

import pytest
from school_scoring.screening import (
    PACKAGE_VERSION,
    Cohort,
    GateFailure,
    NeedParts,
    UnknownRuleError,
    screen,
    screen_all,
)
from screening_prepared import components, prepared

COMPLETE, INTERVAL, QUEUE = Cohort.COMPLETE, Cohort.INTERVAL, Cohort.VERIFICATION_QUEUE
URGENCY_OMITTED = ("additive_no_u", "need_first_no_u", "bottleneck_no_u")


def only(rule_id: str, **component_values):
    (result,) = screen(prepared(("S", components(**component_values))), rule_id).results
    return result


# Literal arithmetic cases shared with the comparison package: N .8, A .4, U .2, R .6, Q .3, E .7, L .5.
@pytest.mark.parametrize(
    ("rule_id", "score"),
    [
        ("additive_u", 0.655),
        ("additive_no_u", 129 / 190),
        ("bottleneck_u", 0.6 * 0.655 + 0.4 * 0.8),
        ("bottleneck_no_u", 0.7273684210526316),
        ("benchmark", 0.55 * 0.8 + 0.20 * 0.4 + 0.15 * 0.2 + 0.10 * 0.6),
        ("need_first_u", 0.15 * 0.4 + 0.05 * 0.2 + 0.05 * 0.6 + 0.05 * 1.5),
        ("need_first_no_u", (0.15 * 0.4 + 0.05 * 0.6 + 0.05 * 1.5) / 0.95),
    ],
)
def test_point_score_for_a_complete_school(rule_id, score):  # FM8
    result = only(rule_id)
    assert result.score_point == pytest.approx(score, abs=1e-12)
    assert (result.score_lower, result.score_upper) == (result.score_point, result.score_point)


def test_bottleneck_reports_the_maximum_it_used_and_urgency_enters_it_only_when_included():  # FM8
    with_u = only("bottleneck_u", N=0.5, A=0.4, U=1.0)
    without_u = only("bottleneck_no_u", N=0.5, A=0.4, U=1.0)
    assert (with_u.maximum_component, without_u.maximum_component) == (1.0, 0.5)


def test_missing_environmental_input_spans_zero_to_its_weight_without_imputation():  # FM3, FM7
    (s0,) = screen(prepared(("S", components(Q=None))), "additive_no_u").results
    (s,) = screen(prepared(("S", components(Q=None))), "additive_u").results
    assert s0.score_lower == pytest.approx((12 * 0.8 + 3 * 0.4 + 0.6 + 0.7 + 0.5) / 19, abs=1e-12)
    assert s0.score_upper - s0.score_lower == pytest.approx(1 / 19, abs=1e-12)
    assert s.score_upper - s.score_lower == pytest.approx(0.05, abs=1e-12)
    q = next(c for c in s0.contributions if c.component.value == "Q")
    assert (q.lower, q.upper) == (0.0, pytest.approx(1 / 19, abs=1e-15))
    assert s0.missing_environmental[0].value == "Q"


def test_every_missing_environmental_input_adds_its_own_weight_to_the_upper_bound():  # FM7
    (result,) = screen(prepared(("S", components(Q=None, E=None, L=None))), "additive_no_u").results
    assert result.score_upper - result.score_lower == pytest.approx(3 / 19, abs=1e-12)


def test_interval_school_has_no_point_rank_and_envelope_is_over_the_eligible_cohort():  # FM10
    members = prepared(
        ("P", components(N=0.9, A=0, U=0, R=0, Q=0, E=0, L=0)),
        ("I", components(N=0.7, A=0, U=0, R=0, Q=None, E=0, L=0)),
        ("R", components(N=0.5, A=0, U=0, R=0, Q=0, E=0, L=0)),
    )
    p, i, r = screen(members, "additive_no_u").results
    assert (p.rank_point, i.rank_point, r.rank_point) == (1, None, 2)
    assert (p.rank_best, i.rank_best, r.rank_best) == (1, 2, 3)
    assert (p.rank_worst, i.rank_worst, r.rank_worst) == (1, 2, 3)
    assert i.score_point is None


def test_a_complete_school_inside_an_interval_gets_different_best_and_worst_rank():  # FM7
    members = prepared(
        ("I", components(N=0.7, A=0, R=0, Q=None, E=0, L=0)),
        ("C", components(N=0.7, A=0, R=0, Q=0.2, E=0, L=0)),
    )
    i, c = screen(members, "additive_no_u").results
    assert (i.rank_best, i.rank_worst, c.rank_best, c.rank_worst, c.rank_point) == (1, 2, 1, 2, 1)


def test_scores_that_agree_to_display_precision_are_still_ordered_exactly():  # FM6
    members = prepared(
        ("A", components(N=0.80000)),
        ("B", components(N=0.80001)),
    )
    assert [r.rank_point for r in screen(members, "additive_no_u").results] == [2, 1]


def test_verification_queue_school_is_returned_unscored_in_input_order_with_identity_intact():  # FM1, FM2
    members = prepared(
        ("Zed ", components()),
        ("Queue", components(N=None), (GateFailure.MISSING_STOCK_FIELD,)),
        ("Alpha", components(N=0.1)),
    )
    results = screen(members, "additive_no_u").results
    assert [r.school_name for r in results] == ["Zed ", "Queue", "Alpha"]
    queued = results[1]
    assert (queued.cohort, queued.score_lower, queued.rank_point, queued.rank_best, queued.contributions) == (
        QUEUE,
        None,
        None,
        None,
        (),
    )
    assert [r.rank_point for r in results] == [1, None, 2]


def test_urgency_has_no_direct_or_indirect_role_in_urgency_omitted_rules():  # FM8
    def outputs(u):
        members = prepared(
            ("A", components(N=0.8, U=u)),
            ("B", components(N=0.8, U=u)),
            ("C", components(N=0.6, U=u, Q=None)),
            ("D", components(N=0.4, U=u)),
        )
        runs = screen_all(members)
        return {
            rule_id: (runs[rule_id].results, dataclasses.replace(runs[rule_id].manifest, input_sha256=""))
            for rule_id in URGENCY_OMITTED
        }

    baseline = outputs(0.2)
    assert outputs(1.0) == baseline
    assert outputs(0.0) == baseline
    assert outputs(None) == baseline


def test_urgency_does_move_the_urgency_included_rules():  # FM8
    low, high = only("additive_u", U=0.0), only("additive_u", U=1.0)
    assert high.score_point - low.score_point == pytest.approx(0.05, abs=1e-12)
    assert (
        only("bottleneck_u", N=0.5, A=0.4, U=0.0).score_point
        != only("bottleneck_u", N=0.5, A=0.4, U=1.0).score_point
    )


def test_unknown_urgency_queues_the_school_only_under_urgency_included_rules():  # FM1, FM8
    members = prepared(("S", components(U=None)))
    included, omitted = screen(members, "additive_u").results[0], screen(members, "additive_no_u").results[0]
    assert screen(members, "benchmark").results[0].cohort is QUEUE
    assert (included.cohort, included.gate_failures, included.rank_point) == (
        QUEUE,
        (GateFailure.URGENCY_UNKNOWN,),
        None,
    )
    assert (omitted.cohort, omitted.rank_point) == (COMPLETE, 1)


def test_urgency_omitted_runs_do_not_carry_the_urgency_value_or_anchor():  # FM8
    run = screen(prepared(("S", components(U=0.9))), "bottleneck_no_u")
    assert run.results[0].components.U is None
    assert [a.name for a in run.manifest.anchors] == ["reach"]
    assert [a.name for a in screen(prepared(("S", components())), "additive_u").manifest.anchors] == [
        "urgency",
        "reach",
    ]


def test_equal_scores_and_equal_need_fall_back_to_school_name():  # FM6
    members = prepared(("Bravo", components()), ("Alpha", components()))
    for rule_id in ("additive_no_u", "need_first_no_u", "bottleneck_no_u", "benchmark"):
        assert [r.rank_point for r in screen(members, rule_id).results] == [2, 1]


def test_need_first_ranks_by_need_before_context():  # FM7
    members = prepared(
        ("High need", components(N=0.9, A=0.0, R=0.0, Q=0.0, E=0.0, L=0.0)),
        ("Low need", components(N=0.8, A=1.0, R=1.0, Q=1.0, E=1.0, L=1.0)),
    )
    assert [r.rank_point for r in screen(members, "need_first_no_u").results] == [1, 2]
    assert [r.rank_point for r in screen(members, "additive_no_u").results] == [2, 1]


def test_contributions_reconstruct_the_score_and_split_school_need_into_its_parts():  # FM7
    (result,) = screen(prepared(("S", components()), with_parts=True), "additive_u").results
    assert sum(c.lower for c in result.contributions) == pytest.approx(0.655, abs=1e-12)
    assert result.contributions[0].lower == pytest.approx(0.6 * 0.8, abs=1e-15)
    assert result.need_part_contributions == NeedParts(
        *(pytest.approx(v, abs=1e-15) for v in (0.03, 0.06, 0.06, 0.072, 0.084))
    )


def test_need_first_has_no_n_contribution_and_no_need_part_contributions():
    (result,) = screen(prepared(("S", components()), with_parts=True), "need_first_u").results
    assert [c.component.value for c in result.contributions] == ["A", "U", "R", "Q", "E", "L"]
    assert result.need_part_contributions is None


def test_cohort_is_relative_to_the_rule_a_missing_environmental_input_matters_only_where_it_is_read():  # FM1, FM10
    members = prepared(("I", components(Q=None)), ("C", components(N=0.1)))
    cohorts = {rule_id: [r.cohort for r in run.results] for rule_id, run in screen_all(members).items()}
    assert cohorts["benchmark"] == [COMPLETE, COMPLETE]
    for rule_id in (
        "additive_u",
        "additive_no_u",
        "need_first_u",
        "need_first_no_u",
        "bottleneck_u",
        "bottleneck_no_u",
    ):
        assert cohorts[rule_id] == [INTERVAL, COMPLETE]


def test_benchmark_gives_every_gate_passing_school_a_point_score_and_a_point_rank():  # FM10
    members = prepared(
        ("I", components(Q=None)),
        ("C", components(N=0.1)),
        ("X", components(), (GateFailure.MISSING_STOCK_FIELD,)),
    )
    run = screen(members, "benchmark")
    i, c, x = run.results
    assert (i.score_point is not None, i.rank_point, i.rank_best, i.rank_worst) == (True, 1, 1, 1)
    assert (c.rank_point, c.rank_best, c.rank_worst) == (2, 2, 2)
    assert x.rank_point is None
    assert (run.manifest.point_rank_scope, run.manifest.rank_bounds_scope) == (
        "complete under this rule (2)",
        "eligible (2)",
    )


def test_manifest_describes_the_rule_scopes_and_cohort_counts():  # FM9, FM10
    members = prepared(
        ("A", components()),
        ("B", components(Q=None)),
        ("C", components(N=None), (GateFailure.MISSING_STOCK_FIELD,)),
    )
    manifest = screen(members, "additive_no_u").manifest.to_dict()
    assert manifest["rule_id"] == "additive_no_u"
    assert manifest["uses_urgency"] is False
    assert [w["fraction"] for w in manifest["weights"]] == ["12/19", "3/19", "1/19", "1/19", "1/19", "1/19"]
    assert manifest["cohort_counts"] == [
        ["records", 3],
        ["complete", 1],
        ["interval", 1],
        ["verification_queue", 1],
    ]
    assert (manifest["point_rank_scope"], manifest["rank_bounds_scope"]) == (
        "complete under this rule (1)",
        "eligible (2)",
    )
    assert (manifest["point_rank_count"], manifest["rank_bounds_count"]) == (1, 2)
    assert "school name ascending" in manifest["tie_rule"]
    assert manifest["input_sha256"] == "input-hash"
    json.dumps(manifest)


def test_manifest_is_identical_across_repeated_runs_and_the_anchor_hash_follows_the_anchors():  # FM9
    members = prepared(("A", components()))
    first, second = screen(members, "additive_u").manifest, screen(members, "additive_u").manifest
    assert first == second
    changed = dataclasses.replace(
        members, anchors=(dataclasses.replace(members.anchors[0], p95=2.0), *members.anchors[1:])
    )
    assert screen(changed, "additive_u").manifest.anchors_sha256 != first.anchors_sha256


def test_manifest_version_matches_the_package_metadata():  # FM9
    pyproject = (Path(__file__).resolve().parents[1] / "pyproject.toml").read_text()
    assert re.search(rf'^version = "{re.escape(PACKAGE_VERSION)}"$', pyproject, re.MULTILINE)
    assert screen(prepared(("A", components())), "benchmark").manifest.package_version == PACKAGE_VERSION


def test_unknown_rule_id_is_refused_by_screen():  # FM8
    with pytest.raises(UnknownRuleError):
        screen(prepared(("A", components())), "additive")


def test_export_frame_carries_rule_identity_scopes_and_gate_reasons_for_every_row():  # FM10
    members = prepared(("A", components()), ("C", components(U=None), (GateFailure.MISSING_STOCK_FIELD,)))
    frame = screen(members, "additive_u").to_frame()
    assert frame["rule_id"].tolist() == ["additive_u", "additive_u"]
    assert frame["school_name"].tolist() == ["A", "C"]
    assert frame["rank_point_scope"].unique().tolist() == ["complete under this rule (1)"]
    assert frame["rank_bounds_scope"].unique().tolist() == ["eligible (1)"]
    assert frame["rank_point"].tolist()[0] == 1 and frame["cohort"].tolist() == [
        "complete",
        "verification_queue",
    ]


def test_a_complete_schools_point_rank_and_its_eligible_bounds_are_different_scopes_and_can_disagree():  # FM10
    members = prepared(
        ("I", components(N=0.9, A=0, R=0, Q=None, E=0, L=0)),
        ("C", components(N=0.5, A=0, R=0, Q=0.0, E=0, L=0)),
    )
    interval, complete = screen(members, "additive_no_u").results
    assert complete.rank_point == 1
    assert (complete.rank_best, complete.rank_worst) == (2, 2)
    assert interval.rank_point is None
