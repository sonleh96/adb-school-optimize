"""Pipeline tests on synthetic records: parse, prepare, screen. These never skip."""

from __future__ import annotations

import dataclasses
import math
import random

import pandas as pd
import pytest
from school_scoring.screening import (
    INPUT_CONTRACT,
    RULES,
    Cohort,
    common_cohort,
    parse_records,
    prepare,
    screen,
    screen_all,
)
from screening_factories import ladder, random_records, record

URGENCY_OMITTED = ("additive_no_u", "need_first_no_u", "bottleneck_no_u")


def run_all(records):
    frame = pd.DataFrame([dataclasses.asdict(r) for r in records], columns=[f.name for f in INPUT_CONTRACT])
    return screen_all(prepare(parse_records(frame)))


def comparable(run):
    """Everything a run says except the input hash, which covers the whole input by design."""
    return (
        run.results,
        dataclasses.replace(run.manifest, input_sha256=""),
        run.to_frame().drop(columns="input_sha256"),
    )


@pytest.mark.parametrize(
    "perturb",
    [None, 1e12, -5.0],
    ids=["unknown", "huge", "negative constant"],
)
def test_perturbing_the_urgency_scalar_leaves_every_urgency_omitted_output_identical(perturb):  # FM8
    records = random_records(40, seed=1)
    baseline = run_all(records)
    perturbed = run_all([dataclasses.replace(r, urgency_source_scalar=perturb) for r in records])
    for rule_id in URGENCY_OMITTED:
        before, after = comparable(baseline[rule_id]), comparable(perturbed[rule_id])
        assert before[0] == after[0]
        assert before[1] == after[1]
        pd.testing.assert_frame_equal(before[2], after[2])
    assert baseline["additive_u"].results != perturbed["additive_u"].results


def test_record_order_does_not_change_any_per_school_result():  # FM2, FM6
    records = list(random_records(40, seed=2))
    shuffled = records[:]
    random.Random(9).shuffle(shuffled)
    assert shuffled != records
    before, after = run_all(records), run_all(shuffled)
    for rule_id in RULES:
        by_name_before = {r.school_name: r for r in before[rule_id].results}
        by_name_after = {r.school_name: r for r in after[rule_id].results}
        assert by_name_before == by_name_after
        assert before[rule_id].manifest.anchors_sha256 == after[rule_id].manifest.anchors_sha256
        assert before[rule_id].manifest.input_sha256 != after[rule_id].manifest.input_sha256
    assert [r.school_name for r in after["additive_u"].results] == [r.school_name for r in shuffled]


def test_one_interval_school_in_an_equal_need_group_moves_the_others_by_at_most_one_place():  # FM7
    members = [
        *ladder("walking_catchment_population", lambda i: math.expm1(i)),
        record("Interval", aqi_p95_selected=None),
    ]
    run = run_all(members)["need_first_no_u"]
    needs = {r.components.N for r in run.results}
    interval = next(r for r in run.results if r.school_name == "Interval")
    assert len(needs) == 1
    assert interval.cohort is Cohort.INTERVAL and interval.rank_point is None
    assert interval.rank_best < interval.rank_worst
    complete = [r for r in run.results if r.cohort is Cohort.COMPLETE]
    assert len(complete) == 21 == run.manifest.point_rank_count
    for r in complete:
        assert r.rank_point <= r.rank_best <= r.rank_worst <= r.rank_point + 1


def test_a_column_with_no_environmental_values_leaves_every_school_interval_but_not_under_benchmark():  # FM3
    members = ladder("walking_catchment_population", lambda i: math.expm1(i), aqi_p95_selected=None)
    runs = run_all(members)
    for rule_id in RULES:
        run = runs[rule_id]
        assert [r.cohort for r in run.results] == [
            Cohort.COMPLETE if rule_id == "benchmark" else Cohort.INTERVAL
        ] * 21
    additive = runs["additive_no_u"]
    assert all(r.components.Q is None and r.rank_point is None for r in additive.results)
    assert all(r.score_upper - r.score_lower == pytest.approx(1 / 19, abs=1e-12) for r in additive.results)
    assert "aqi" in additive.manifest.degenerate_anchors
    assert "reach" not in additive.manifest.degenerate_anchors
    assert "aqi" not in runs["benchmark"].manifest.degenerate_anchors
    assert runs["benchmark"].manifest.point_rank_scope == "complete under this rule (21)"


def test_an_empty_input_runs_every_rule_and_exports_an_empty_typed_frame():  # FM2
    runs = run_all([])
    for run in runs.values():
        assert run.results == ()
        assert dict(run.manifest.cohort_counts) == {
            "records": 0,
            "complete": 0,
            "interval": 0,
            "verification_queue": 0,
        }
        frame = run.to_frame()
        assert len(frame) == 0
        assert frame["rule_id"].tolist() == []
        assert str(frame["rank_point"].dtype) == "Int64"
        assert common_cohort(run).school_names == ()
    assert [a.n_valid for a in runs["additive_u"].manifest.anchors] == [0] * len(
        runs["additive_u"].manifest.anchors
    )


def test_a_single_record_is_ranked_first_by_every_rule_it_is_complete_under():  # FM7
    runs = run_all([record("Only")])
    for run in runs.values():
        (result,) = run.results
        assert (result.rank_point, result.rank_best, result.rank_worst) == (1, 1, 1)


def test_prepared_records_are_independent_of_the_rule_that_screens_them():  # FM1
    prepared = prepare(random_records(40, seed=4))
    before = [p.gate_failures for p in prepared.records]
    for rule_id in RULES:
        screen(prepared, rule_id)
    assert [p.gate_failures for p in prepared.records] == before
