"""Exports carry enough to rebuild the shortlist and to say what each number means."""

from __future__ import annotations

import pytest
from school_scoring.screening import RULES, Component, GateFailure, parse_records, prepare, screen
from screening_factories import frame_of_records, random_records
from screening_prepared import components, prepared

N, A, U = Component.N, Component.A, Component.U


@pytest.mark.parametrize(
    ("rule_id", "kind"),
    [
        ("additive_u", "additive score"),
        ("benchmark", "additive score"),
        ("need_first_no_u", "need-first secondary score"),
        ("bottleneck_u", "bottleneck score"),
    ],
)
def test_manifest_and_export_say_what_the_score_column_means(rule_id, kind):  # FM8
    run = screen(prepared(("S", components())), rule_id)
    assert run.manifest.score_kind == kind
    assert run.to_frame()["score_kind"].tolist() == [kind]


@pytest.mark.parametrize("rule_id", ["bottleneck_u", "bottleneck_no_u"])
def test_bottleneck_contributions_and_the_maximum_term_sum_to_the_bottleneck_score(rule_id):  # FM7
    members = prepared(("Known", components(N=0.5, A=0.4, U=1.0)), ("Interval", components(Q=None)))
    for result in screen(members, rule_id).results:
        lower = sum(c.lower for c in result.contributions) + result.maximum.contribution
        upper = sum(c.upper for c in result.contributions) + result.maximum.contribution
        assert lower == pytest.approx(result.score_lower, abs=1e-12)
        assert upper == pytest.approx(result.score_upper, abs=1e-12)


def test_the_maximum_term_names_every_component_that_attains_the_maximum():  # FM8
    tie = screen(prepared(("S", components(N=0.5, A=0.5, U=0.1))), "bottleneck_u").results[0]
    assert (tie.maximum.attained_by, tie.maximum.value, tie.maximum.contribution) == (
        (N, A),
        0.5,
        pytest.approx(0.2),
    )
    urgent = screen(prepared(("S", components(N=0.5, A=0.4, U=0.9))), "bottleneck_u").results[0]
    assert urgent.maximum.attained_by == (U,)
    omitted = screen(prepared(("S", components(N=0.5, A=0.4, U=0.9))), "bottleneck_no_u").results[0]
    assert omitted.maximum.attained_by == (N,)


def test_bottleneck_export_has_the_maximum_columns_and_additive_rules_leave_them_empty():
    members = prepared(("S", components(N=0.5, A=0.5, U=0.1)))
    frame = screen(members, "bottleneck_u").to_frame()
    assert frame[["maximum_component", "maximum_attained_by", "maximum_term"]].iloc[0].tolist() == [
        0.5,
        "N;A",
        pytest.approx(0.2),
    ]
    assert screen(members, "additive_u").to_frame()["maximum_attained_by"].isna().all()


def test_need_first_marks_n_as_the_primary_sort_key_and_not_a_summand():  # FM8
    run = screen(prepared(("S", components(N=0.77))), "need_first_no_u")
    assert run.manifest.primary_sort_key == "N"
    assert [w.component.value for w in run.manifest.weights] == ["A", "R", "Q", "E", "L"]
    frame = run.to_frame()
    assert frame["sort_key_primary"].tolist() == [0.77]
    assert frame["score_point"].tolist() != frame["N"].tolist()
    assert screen(prepared(("S", components())), "additive_no_u").manifest.primary_sort_key is None


def test_every_export_row_carries_the_manifest_identity():  # FM9
    run = screen(prepared(("A", components()), ("B", components())), "additive_no_u")
    frame = run.to_frame()
    for column, value in (
        ("rule_id", "additive_no_u"),
        ("rule_label", "Additive, urgency omitted"),
        ("provenance", "revised_paper"),
        ("policy_role", "primary"),
        ("input_sha256", "input-hash"),
        ("anchors_sha256", run.manifest.anchors_sha256),
        ("package_version", run.manifest.package_version),
    ):
        assert frame[column].tolist() == [value, value]


def test_rank_columns_are_nullable_integers():  # FM10
    members = prepared(("A", components()), ("B", components(N=None), (GateFailure.MISSING_STOCK_FIELD,)))
    frame = screen(members, "additive_no_u").to_frame()
    assert [str(frame[c].dtype) for c in ("rank_point", "rank_best", "rank_worst")] == ["Int64"] * 3
    assert frame["rank_point"].tolist()[0] == 1
    assert frame["rank_point"].isna().tolist() == [False, True]


@pytest.mark.parametrize("rule_id", list(RULES))
def test_sorting_the_export_by_its_declared_keys_reproduces_the_point_ranks(rule_id):  # FM6, FM10
    records = random_records(40, seed=3)
    run = screen(prepare(parse_records(frame_of_records(records))), rule_id)
    frame = run.to_frame()
    ranked = frame[frame["rank_point"].notna()]
    columns = [*run.manifest.sort_columns, "school_name"]
    ordered = ranked.sort_values(columns, ascending=[False] * (len(columns) - 1) + [True], kind="stable")
    assert ordered["rank_point"].tolist() == list(range(1, len(ordered) + 1))
    assert len(ordered) == run.manifest.point_rank_count > 20
    assert ranked["score_point"].duplicated().any()
