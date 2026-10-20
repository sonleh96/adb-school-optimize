"""Loading screening inputs and runs into a real PostGIS database, and reading them back."""

from __future__ import annotations

import threading
from dataclasses import replace

import psycopg
import pytest
from app import screening_store as store
from app.ingestion.load_screening_inputs import InputsConflict, RunConflict, VersionConflict
from psycopg.rows import dict_row
from school_scoring.screening import (
    RULES,
    Cohort,
    Component,
    prepare,
    records_sha256,
    screen_all,
)
from screening_db_factories import awkward_number_records, mixed_records, record
from screening_db_helpers import TABLES, VERSION, add_school, load, rows, scalar, snapshot

RULE_IDS = list(RULES)

# Cohorts by construction of mixed_records(): the unknown-urgency school is queued only where the rule reads urgency.
EXPECTED_SCOPES = {
    "additive_u": ("complete under this rule (9)", 9, "eligible (11)", 11),
    "additive_no_u": ("complete under this rule (10)", 10, "eligible (12)", 12),
    "benchmark": ("complete under this rule (11)", 11, "eligible (11)", 11),
}


def run_of(connection, rule_id: str, version: str = VERSION) -> store.StoredRun:
    (stored,) = [r for r in store.list_runs(connection, version) if r.rule_id == rule_id]
    return stored


def test_load_stores_one_run_per_rule_and_one_result_per_school(connection):  # DB4, DB10
    records = mixed_records()

    report = load(connection, records)

    assert report.version_created is True
    assert report.runs_created == tuple(RULES) and report.runs_unchanged == ()
    assert [r.rule_id for r in store.list_runs(connection, VERSION)] == sorted(RULES)
    assert scalar(connection, "select count(*) from screening_inputs") == len(records)
    assert scalar(connection, "select count(*) from screening_results") == len(RULES) * len(records)


def test_load_works_on_a_connection_that_returns_dict_rows(database_url):  # DB22
    # The API's connection pool opens connections with dict_row.
    with psycopg.connect(database_url, autocommit=True, row_factory=dict_row) as own:
        first = load(own, mixed_records())
        second = load(own, mixed_records())

        assert first.runs_created == tuple(RULES) and first.matched == 0
        assert second.runs_unchanged == tuple(RULES) and second.links_changed == 0
        add_school(own, "zed queue")
        third = load(own, mixed_records())
        assert (third.matched, third.links_changed) == (1, 1)
        assert len(store.read_results(own, run_of(own, "additive_u").run_id)) == len(mixed_records())


def test_identical_rerun_changes_nothing(connection):  # DB4
    load(connection, mixed_records())
    before = snapshot(connection)

    report = load(connection, mixed_records())

    assert report.version_created is False
    assert report.runs_created == () and report.runs_unchanged == tuple(RULES)
    assert report.links_changed == 0
    assert snapshot(connection) == before


def test_failure_midway_leaves_nothing_behind(connection):  # DB3
    # The benchmark run is inserted last, after the version, its inputs and six other runs.
    connection.execute(
        "create function refuse_benchmark() returns trigger language plpgsql as "
        "$$ begin if new.rule_id = 'benchmark' then raise exception 'refused for the test'; end if; return new; end $$"
    )
    connection.execute(
        "create trigger refuse_benchmark before insert on screening_runs for each row execute function refuse_benchmark()"
    )

    with pytest.raises(psycopg.errors.RaiseException, match="refused for the test"):
        load(connection, mixed_records())

    assert {t: scalar(connection, f"select count(*) from {t}") for t in TABLES} == dict.fromkeys(TABLES, 0)

    # Once the cause is gone the same load succeeds in full.
    connection.execute("drop trigger refuse_benchmark on screening_runs")
    assert load(connection, mixed_records()).runs_created == tuple(RULES)


def test_changed_inputs_under_an_existing_version_are_refused(connection):  # DB5
    original = mixed_records()
    load(connection, original)
    before = snapshot(connection)
    changed = (replace(original[0], permanent_classrooms=7.0), *original[1:])

    with pytest.raises(VersionConflict, match=records_sha256(changed)):
        load(connection, changed)

    assert snapshot(connection) == before
    assert store.get_input_version(connection, VERSION).input_sha256 == records_sha256(original)


@pytest.mark.parametrize(
    "edit",
    [
        "update screening_inputs set permanent_classrooms = permanent_classrooms + 1 where record_position = 3",
        "update screening_inputs set province = 'Edited Province' where record_position = 3",
        "update screening_inputs set urgency_source_scalar = null where record_position = 3",
        "update screening_inputs set record_position = record_position + 100 where record_position = 3",
        "delete from screening_inputs where record_position = 3",
    ],
    ids=["number changed", "text changed", "value blanked", "moved", "row deleted"],
)
def test_rerun_refuses_stored_input_rows_that_were_edited(connection, edit):  # DB19
    load(connection, mixed_records())
    connection.execute(edit)
    before = snapshot(connection)

    with pytest.raises(InputsConflict, match="stored input rows of version 'synthetic-v1' no longer equal"):
        load(connection, mixed_records())

    assert snapshot(connection) == before


def test_record_order_is_part_of_the_version(connection):  # DB5
    original = mixed_records()
    load(connection, original)

    with pytest.raises(VersionConflict):
        load(connection, tuple(reversed(original)))


def test_names_round_trip_byte_for_byte(connection):  # DB6
    records = mixed_records()
    names = [r.school_name for r in records]
    load(connection, records)

    assert [r.school_name for r in store.read_inputs(connection, VERSION)] == names
    for rule_id in RULES:
        stored = {
            r.source_school_name for r in store.read_results(connection, run_of(connection, rule_id).run_id)
        }
        assert stored == set(names)
    # The database holds the same bytes, not a normalized form.
    in_database = {
        bytes(b)
        for (b,) in connection.execute(
            "select convert_to(source_school_name, 'UTF8') from screening_inputs"
        ).fetchall()
    }
    assert in_database == {n.encode("utf-8") for n in names}
    assert len(in_database) == len(names)  # the composed and decomposed accents stay two schools


def test_unmatched_names_are_kept_and_ambiguous_keys_are_not_linked(connection):  # DB7
    records = (
        *mixed_records(),
        record("Twin School"),
        record("twin  school"),
    )
    matched = {
        "UPPER Case School": add_school(connection, "upper case school"),  # case differs
        "Double  Space School": add_school(connection, "double space school"),  # spacing differs
        "Interval No Air": add_school(connection, "Interval No Air"),
    }
    add_school(connection, "twin school")  # two input names share this key

    report = load(connection, records)

    assert report.matched == 3
    assert report.ambiguous == ("Twin School", "twin  school")
    assert len(report.unmatched) == len(records) - 3 - 2
    assert "Zed queue" in report.unmatched
    linked = {
        r["source_school_name"]: r["school_id"] for r in rows(connection, "select * from screening_inputs")
    }
    assert {n: linked[n] for n in matched} == matched
    assert linked["Twin School"] is None and linked["twin  school"] is None
    # Nobody is dropped: every school has a result in every run, linked or not.
    assert scalar(connection, "select count(*) from screening_results") == len(RULES) * len(records)
    zed = rows(connection, "select school_id from screening_results where source_school_name = 'Zed queue'")
    assert len(zed) == len(RULES) and all(r["school_id"] is None for r in zed)


def test_schools_loaded_later_are_linked_by_a_rerun(connection):  # DB16
    records = mixed_records()
    load(connection, records)
    assert scalar(connection, "select count(school_id) from screening_inputs") == 0

    first = add_school(connection, "Zed Queue")
    second = add_school(connection, "interval no land")
    report = load(connection, records)

    assert report.version_created is False and report.links_changed == 2 and report.matched == 2
    assert dict(
        connection.execute(
            "select source_school_name, school_id from screening_inputs where school_id is not null"
        ).fetchall()
    ) == {"Zed queue": first, "Interval No Land": second}
    assert (
        scalar(
            connection,
            "select count(*) from screening_results r join screening_inputs i using (input_version, source_school_name) "
            "where r.school_id is distinct from i.school_id",
        )
        == 0
    )
    assert scalar(connection, "select count(school_id) from screening_results") == 2 * len(RULES)

    # A removed school unlinks itself and leaves its results in place.
    connection.execute("delete from schools where school_id = %s", (first,))
    assert scalar(
        connection, "select count(*) from screening_results where source_school_name = 'Zed queue'"
    ) == len(RULES)
    assert (
        scalar(
            connection,
            "select count(school_id) from screening_results where source_school_name = 'Zed queue'",
        )
        == 0
    )


def test_stored_inputs_rehash_to_the_recorded_input_hash(connection):  # DB8
    records = awkward_number_records()
    load(connection, records)

    stored = store.read_inputs(connection, VERSION)

    assert stored == records
    assert (
        records_sha256(stored)
        == records_sha256(records)
        == store.get_input_version(connection, VERSION).input_sha256
    )
    assert all(run.input_sha256 == records_sha256(records) for run in store.list_runs(connection, VERSION))


def test_stored_results_equal_the_engine_field_by_field(connection):  # DB8
    records = awkward_number_records()
    load(connection, records)
    engine = screen_all(prepare(records))

    for rule_id, expected_run in engine.items():
        stored_run = run_of(connection, rule_id)
        assert stored_run.manifest == expected_run.manifest.to_dict()
        stored = {r.source_school_name: r for r in store.read_results(connection, stored_run.run_id)}
        assert stored.keys() == {r.school_name for r in expected_run.results}
        for expected in expected_run.results:
            got = stored[expected.school_name]
            where = f"{rule_id}/{expected.school_name!r}"
            assert got.cohort is expected.cohort, where
            assert got.gate_failures == expected.gate_failures, where
            assert got.components == {c.value: expected.components.get(c) for c in Component}, where
            assert got.need_parts == vars(expected.need_parts), where
            assert got.area_parts == vars(expected.area_parts), where
            assert got.contributions == [
                {"component": c.component.value, "weight": c.weight, "lower": c.lower, "upper": c.upper}
                for c in expected.contributions
            ], where
            assert got.need_part_contributions == (
                None if expected.need_part_contributions is None else vars(expected.need_part_contributions)
            ), where
            assert got.maximum_term == (
                None
                if expected.maximum is None
                else {
                    "share": expected.maximum.share,
                    "value": expected.maximum.value,
                    "attained_by": [c.value for c in expected.maximum.attained_by],
                    "contribution": expected.maximum.contribution,
                }
            ), where
            for name in (
                "score_lower",
                "score_upper",
                "score_point",
                "rank_point",
                "rank_best",
                "rank_worst",
            ):
                assert getattr(got, name) == getattr(expected, name), f"{where} {name}"
            primary = expected_run.manifest.primary_sort_key
            assert got.sort_key_primary == (
                None if primary is None else expected.components.get(Component(primary))
            )


def test_missing_values_stay_missing_in_results(connection):  # DB8
    load(connection, mixed_records())
    results = {
        r.source_school_name: r
        for r in store.read_results(connection, run_of(connection, "additive_u").run_id)
    }

    no_air = results["Interval No Air"]
    assert (no_air.cohort, no_air.components["Q"], no_air.score_point, no_air.rank_point) == (
        Cohort.INTERVAL,
        None,
        None,
        None,
    )
    assert no_air.score_lower < no_air.score_upper  # the interval the missing AQI opens
    unknown_urgency = results["Éclair queue"]
    assert unknown_urgency.components["U"] is None and unknown_urgency.score_lower is None


def test_every_result_row_carries_the_scope_labels_of_its_manifest(connection):  # DB9
    load(connection, mixed_records())

    for rule_id, (point_scope, point_count, bounds_scope, bounds_count) in EXPECTED_SCOPES.items():
        stored = run_of(connection, rule_id)
        assert stored.manifest["point_rank_scope"] == point_scope
        assert stored.manifest["rank_bounds_scope"] == bounds_scope
        labels = {
            (r.rank_point_scope, r.rank_point_count, r.rank_bounds_scope, r.rank_bounds_count)
            for r in store.read_results(connection, stored.run_id)
        }
        assert labels == {(point_scope, point_count, bounds_scope, bounds_count)}, rule_id


def test_stored_cohort_and_rank_counts_equal_the_manifest(connection):  # DB10
    load(connection, mixed_records())

    for stored in store.list_runs(connection, VERSION):
        counts = dict(
            connection.execute(
                "select cohort, count(*) from screening_results where run_id = %s group by cohort",
                (stored.run_id,),
            ).fetchall()
        )
        manifest_counts = {name: n for name, n in stored.manifest["cohort_counts"]}
        assert manifest_counts.pop("records") == sum(counts.values()) == 14
        assert {k: counts.get(k, 0) for k in manifest_counts} == manifest_counts, stored.rule_id
        assert (
            scalar(
                connection,
                "select count(rank_point) from screening_results where run_id = %s",
                (stored.run_id,),
            )
            == stored.manifest["point_rank_count"]
            == manifest_counts["complete"]
        )
        assert (
            scalar(
                connection,
                "select count(rank_best) from screening_results where run_id = %s",
                (stored.run_id,),
            )
            == stored.manifest["rank_bounds_count"]
            == manifest_counts["complete"] + manifest_counts["interval"]
        )


@pytest.mark.parametrize("tamper", ["results", "manifest"])
def test_rerun_refuses_results_that_differ_from_the_engine(connection, tamper):  # DB13
    load(connection, mixed_records())
    if tamper == "results":
        connection.execute(
            "update screening_results set score_point = score_point + 0.25 "
            "where source_school_name = 'UPPER Case School' and cohort = 'complete'"
        )
    else:
        connection.execute(
            "update screening_runs set manifest = jsonb_set(manifest, '{rule_label}', '\"edited\"')"
        )
    before = snapshot(connection)

    with pytest.raises(RunConflict):
        load(connection, mixed_records())

    assert snapshot(connection) == before


def test_results_are_read_in_rank_order(connection):  # DB15
    load(connection, mixed_records())

    for rule_id in RULES:
        results = store.read_results(connection, run_of(connection, rule_id).run_id)
        ranks = [r.rank_point for r in results]
        ranked = [r for r in ranks if r is not None]
        assert ranks[: len(ranked)] == ranked == list(range(1, len(ranked) + 1)), rule_id
        unranked = list(results[len(ranked) :])
        assert all(r.rank_point is None for r in unranked)
        # Interval schools follow by best rank; queued schools have none and follow by name in code point order.
        bounded = [r for r in unranked if r.rank_best is not None]
        queued = [r for r in unranked if r.rank_best is None]
        assert unranked == bounded + queued
        assert [r.rank_best for r in bounded] == sorted(r.rank_best for r in bounded)
        assert [r.source_school_name for r in queued] == sorted(r.source_school_name for r in queued)

    # Code point order differs from a locale order: capital Z and the accented capital sort before lowercase a.
    queued_additive = [
        r.source_school_name
        for r in store.read_results(connection, run_of(connection, "additive_u").run_id)
        if r.cohort is Cohort.VERIFICATION_QUEUE
    ]
    assert queued_additive == ["Zed queue", "alpha queue", "Éclair queue"]


def test_concurrent_loads_of_one_version_converge(database_url):  # DB14
    outcomes: list[object] = []

    def run() -> None:
        try:
            with psycopg.connect(database_url, autocommit=True) as own:
                outcomes.append(load(own, mixed_records()))
        except Exception as error:  # reported by the assertion below
            outcomes.append(error)

    threads = [threading.Thread(target=run) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert [o for o in outcomes if isinstance(o, Exception)] == []
    assert sorted(o.version_created for o in outcomes) == [False, False, False, True]
    with psycopg.connect(database_url, autocommit=True) as check:
        assert scalar(check, "select count(*) from screening_runs") == len(RULES)
        assert scalar(check, "select count(*) from screening_results") == len(RULES) * len(mixed_records())
