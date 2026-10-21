"""Storing the top-20 persistence numbers of an experiment with an input version, against a real database.

The files are invented: the schools, frequencies and experiment id are made up here.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import psycopg
import pytest
from app import screening_store as store
from app.ingestion.load_screening_inputs import (
    PersistenceConflict,
    ScreeningLoadError,
    read_persistence_source,
)
from screening_db_factories import (
    AWKWARD_NAMES as AWK,
)
from screening_db_factories import (
    EXPERIMENT,
    EXPERIMENT_NO_U,
    PERSISTENCE_PATH,
    PERSISTENCE_PATH_NO_U,
    SETTINGS,
    mixed_records,
    record,
    write_persistence_files,
    write_source_files,
)
from screening_db_helpers import (
    PERSISTENCE_TABLES,
    SQL_DIR,
    TABLES,
    VERSION,
    apply_migrations,
    load,
    scalar,
    snapshot,
)

API_ROOT = Path(__file__).resolve().parents[1]

# The file spells names the way a person would: trimmed and in single spaces. The stored names keep their spelling.
FREQUENCIES = {
    "Leading Space School": (0.99, 0.98, 1.0),  # stored as " Leading Space School"
    "Trailing Space School": (0.8, 0.8, 0.8),  # exactly at the threshold, so persistent
    "UPPER Case School": (0.9, 0.7999, 0.95),  # one setting just below, so not persistent
    "Interval No Air": (0.1, 0.2, 0.3),
}
PERSISTENT = {"Leading Space School", "Trailing Space School"}
# The urgency-omitted experiment's numbers for the same schools, and different from the other's, so a mix-up shows.
# "Trailing Space School" sits 0.008 above the threshold: inside two standard errors (0.0113), outside one (0.0057).
FREQUENCIES_NO_U = {
    "Leading Space School": (0.9, 0.95, 1.0),
    "Trailing Space School": (0.808, 0.9, 0.9),
    "UPPER Case School": (0.5, 0.5, 0.5),
    "Interval No Air": (0.1, 0.2, 0.3),
}
STORED_NAME = {
    "Leading Space School": AWK[0],
    "Trailing Space School": AWK[1],
    "UPPER Case School": AWK[2],
    "Interval No Air": "Interval No Air",
}


@pytest.fixture
def reference(tmp_path) -> Path:
    return tmp_path / "reference"


def source(reference: Path, frequencies=FREQUENCIES, **kwargs):
    relative = write_persistence_files(reference, frequencies, **kwargs)
    return read_persistence_source(reference, relative, "additive_u")


def source_no_u(reference: Path, frequencies=FREQUENCIES_NO_U, **kwargs):
    """The urgency-omitted experiment's files, read for the rule that leaves urgency out."""
    relative = write_persistence_files(reference, frequencies, urgency_omitted=True, **kwargs)
    return read_persistence_source(reference, relative, "additive_no_u")


def persistence_state(connection) -> dict[str, list[str]]:
    return {t: v for t, v in snapshot(connection).items() if t in PERSISTENCE_TABLES}


def assert_nothing_stored(connection) -> None:
    for table in (*TABLES, *PERSISTENCE_TABLES):
        assert scalar(connection, f"select count(*) from {table}") == 0, table


# ---------------------------------------------------------------------------------------------
# What is stored.
# ---------------------------------------------------------------------------------------------


def test_the_numbers_are_stored_with_their_provenance_and_the_flag_follows_the_threshold(
    connection, reference
):  # PE1, PE2
    parsed = source(reference)

    report = load(connection, mixed_records(), persistence=[parsed])

    assert report.persistence == {"additive_u": f"created (4 schools, sha256 {parsed.source_sha256})"}
    stored = store.read_persistence(connection, VERSION)["additive_u"]
    assert stored.set == store.PersistenceSet(
        input_version=VERSION,
        rule_id="additive_u",
        experiment_id=EXPERIMENT,
        source_path=PERSISTENCE_PATH,
        source_sha256=parsed.source_sha256,
        draws=5000,
        threshold=0.8,
        settings=tuple(store.PersistenceSetting(sid, float(top), float(need)) for sid, top, need in SETTINGS),
    )
    assert stored.frequencies == {STORED_NAME[n]: f for n, f in FREQUENCIES.items()}
    flags = {name: stored.is_persistent(STORED_NAME[name]) for name in FREQUENCIES}
    assert flags == {name: name in PERSISTENT for name in FREQUENCIES}
    assert stored.is_persistent("Zed queue") is None  # not in the experiment


def test_a_rerun_with_the_same_file_changes_nothing(connection, reference):  # PE3
    parsed = source(reference)
    load(connection, mixed_records(), persistence=[parsed])
    before = snapshot(connection)

    again = load(connection, mixed_records(), persistence=[parsed])

    assert again.persistence == {"additive_u": f"unchanged (4 schools, sha256 {parsed.source_sha256})"}
    assert snapshot(connection) == before


def test_a_rerun_whose_file_differs_is_refused_and_leaves_the_stored_numbers(connection, reference):  # PE4
    load(connection, mixed_records(), persistence=[source(reference)])
    before = snapshot(connection)

    changed = {**FREQUENCIES, "UPPER Case School": (0.9, 0.9, 0.95)}  # the flag would flip
    with pytest.raises(PersistenceConflict, match="never overwritten"):
        load(connection, mixed_records(), persistence=[source(reference, changed)])
    fewer = {k: v for k, v in FREQUENCIES.items() if k != "Interval No Air"}
    with pytest.raises(PersistenceConflict):
        load(connection, mixed_records(), persistence=[source(reference, fewer)])

    assert snapshot(connection) == before


def test_numbers_cannot_be_attached_to_a_version_that_was_loaded_without_them(connection, reference):  # PE19
    # A pinned response is cached as immutable. Attaching numbers later would change the list and the detail of a
    # version that clients already hold, so the load is refused and the operator loads a new version.
    load(connection, mixed_records())
    before = snapshot(connection)

    with pytest.raises(PersistenceConflict, match="Load a new input version"):
        load(connection, mixed_records(), persistence=[source(reference)])

    assert snapshot(connection) == before
    assert store.read_persistence(connection, VERSION) == {}


def test_a_load_without_the_file_leaves_a_stored_set_alone(connection, reference):  # PE3
    load(connection, mixed_records(), persistence=[source(reference)])
    before = snapshot(connection)

    report = load(connection, mixed_records())

    assert report.persistence == {}
    assert snapshot(connection) == before


def test_a_version_loaded_without_the_file_has_no_numbers_and_no_other_version_lends_its_own(
    connection, reference
):  # PE12
    load(connection, mixed_records(), "with", persistence=[source(reference)])
    load(connection, mixed_records(), "without")

    assert store.read_persistence(connection, "without") == {}
    assert set(store.read_persistence_sets(connection)) == {"with"}


# ---------------------------------------------------------------------------------------------
# Refusals. Each one writes nothing, not even the inputs and runs of the load.
# ---------------------------------------------------------------------------------------------


def test_a_name_that_matches_no_school_refuses_the_whole_load(connection, reference):  # PE5
    parsed = source(reference, {**FREQUENCIES, "Nowhere School": (1.0, 1.0, 1.0)})

    with pytest.raises(ScreeningLoadError, match=r"'Nowhere School' matches no school"):
        load(connection, mixed_records(), persistence=[parsed])

    assert_nothing_stored(connection)


def test_a_name_that_matches_two_schools_only_through_normalisation_refuses_the_whole_load(
    connection, reference
):  # PE6
    records = (*mixed_records(), record("Twin School"), record("twin   school"))
    parsed = source(reference, {**FREQUENCIES, "TWIN SCHOOL": (1.0, 1.0, 1.0)})

    with pytest.raises(ScreeningLoadError, match=r"matches 2 schools: \['Twin School', 'twin   school'\]"):
        load(connection, records, persistence=[parsed])

    assert_nothing_stored(connection)


def test_a_name_equal_to_a_stored_name_is_that_school_even_when_a_twin_normalises_alike(
    connection, reference
):  # PE6
    records = (*mixed_records(), record("Twin School"), record("Twin  School"))
    parsed = source(reference, {**FREQUENCIES, "Twin School": (1.0, 1.0, 1.0)})

    load(connection, records, persistence=[parsed])

    stored = store.read_persistence(connection, VERSION)["additive_u"]
    assert stored.is_persistent("Twin School") is True
    assert stored.is_persistent("Twin  School") is None  # the twin was not named, and is not guessed


def test_two_exact_twins_can_both_be_named(connection, reference):  # PE6
    records = (*mixed_records(), record("Twin School"), record("Twin  School"))
    parsed = source(
        reference, {**FREQUENCIES, "Twin School": (1.0, 1.0, 1.0), "Twin  School": (0.1, 0.1, 0.1)}
    )

    load(connection, records, persistence=[parsed])

    stored = store.read_persistence(connection, VERSION)["additive_u"]
    assert (stored.is_persistent("Twin School"), stored.is_persistent("Twin  School")) == (True, False)


def test_two_names_for_one_school_refuse_the_whole_load(connection, reference):  # PE7
    parsed = source(reference, {**FREQUENCIES, "interval  no air": (0.5, 0.5, 0.5)})

    with pytest.raises(ScreeningLoadError, match="named by two rows"):
        load(connection, mixed_records(), persistence=[parsed])

    assert_nothing_stored(connection)


def test_a_blank_name_matches_no_school(connection, reference):  # PE5
    parsed = source(reference, {**FREQUENCIES, "": (1.0, 1.0, 1.0)})

    with pytest.raises(ScreeningLoadError, match="matches no school"):
        load(connection, mixed_records(), persistence=[parsed])

    assert_nothing_stored(connection)


def test_a_file_that_does_not_hash_to_the_expected_value_is_refused(reference):  # PE8
    relative = write_persistence_files(reference, FREQUENCIES)
    actual = read_persistence_source(reference, relative, "additive_u").source_sha256

    with pytest.raises(ScreeningLoadError, match="not the expected " + "0" * 64):
        read_persistence_source(reference, relative, "additive_u", "0" * 64)
    assert read_persistence_source(reference, relative, "additive_u", actual.upper()).source_sha256 == actual


def test_a_flag_column_that_disagrees_with_the_frequencies_is_refused(reference):  # PE9
    relative = write_persistence_files(reference, FREQUENCIES, flags={"UPPER Case School": True})

    with pytest.raises(ScreeningLoadError, match=r"'UPPER Case School' is True .* but its frequencies"):
        read_persistence_source(reference, relative, "additive_u")


def test_a_receipt_that_names_other_schools_than_the_file_flags_is_refused_by_count(
    connection, reference
):  # PE20
    others = ["Interval No Air"]  # in the experiment, but not persistent
    parsed = source(reference, receipt_names=["Leading Space School", *others])

    with pytest.raises(ScreeningLoadError) as error:
        load(connection, mixed_records(), persistence=[parsed])

    message = str(error.value)
    assert (
        "flags 1 school(s) the receipt does not list, and the receipt lists 1 the file does not flag"
        in message
    )
    assert "Trailing Space School" not in message and "Interval No Air" not in message  # counts, never names
    assert_nothing_stored(connection)


def test_a_receipt_may_spell_a_name_differently_when_it_normalises_alike(connection, reference):  # PE20
    parsed = source(reference, receipt_names=["leading  space school", "Trailing Space School "])

    load(connection, mixed_records(), persistence=[parsed])

    assert store.read_persistence(connection, VERSION)["additive_u"].is_persistent(AWK[0]) is True


def test_a_receipt_that_lists_a_school_the_version_does_not_have_is_refused(connection, reference):  # PE20
    parsed = source(reference, receipt_names=["Leading Space School", "Trailing Space School"])
    parsed = replace(parsed, receipt_flagged=("Leading Space School", "Nowhere School"))

    with pytest.raises(ScreeningLoadError, match=r"persistence receipt: 1 name.* match no school"):
        load(connection, mixed_records(), persistence=[parsed])

    assert_nothing_stored(connection)


def test_a_receipt_without_the_list_of_names_is_refused(reference):  # PE20
    relative = write_persistence_files(reference, FREQUENCIES)
    receipt_path = (reference / relative).parent / "run_receipt.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    del receipt["persistent_investigation_candidates"]
    receipt_path.write_text(json.dumps(receipt), encoding="utf-8")

    with pytest.raises(ScreeningLoadError, match="persistent_investigation_candidates"):
        read_persistence_source(reference, relative, "additive_u")


def test_a_receipt_count_that_disagrees_with_the_flagged_rows_is_refused(reference):  # PE10
    relative = write_persistence_files(reference, FREQUENCIES, receipt_count=9)

    with pytest.raises(ScreeningLoadError, match="flags 2 schools but its receipt states 9"):
        read_persistence_source(reference, relative, "additive_u")


@pytest.mark.parametrize("bad", ["", "abc", "1.5", "-0.1", "nan"])
def test_a_frequency_that_is_not_a_number_from_zero_to_one_is_refused(reference, bad):  # PE11
    relative = write_persistence_files(reference, FREQUENCIES)
    path = reference / relative
    path.write_text(path.read_text(encoding="utf-8").replace("0.99", bad, 1), encoding="utf-8")

    with pytest.raises(ScreeningLoadError, match=r"not a number|outside 0 to 1"):
        read_persistence_source(reference, relative, "additive_u")


def test_a_path_without_an_experiment_folder_is_refused(reference):  # PE13
    target = reference / "results" / "persistent_investigation_candidates.csv"
    write_persistence_files(reference, FREQUENCIES)
    target.parent.mkdir(parents=True)
    (reference / PERSISTENCE_PATH).rename(target)

    with pytest.raises(ScreeningLoadError, match=r"no EXP-\.\.\. folder"):
        read_persistence_source(reference, "results/persistent_investigation_candidates.csv", "additive_u")


# ---------------------------------------------------------------------------------------------
# The schema.
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "rule_id", ["benchmark", "bottleneck_u", "bottleneck_no_u", "need_first_u", "need_first_no_u"]
)
def test_the_numbers_cannot_be_stored_for_any_rule_but_the_two_with_an_experiment(
    connection, reference, rule_id
):  # PE14
    load(connection, mixed_records(), persistence=[source(reference)])

    with pytest.raises(psycopg.errors.CheckViolation) as error:
        connection.execute("update screening_persistence_sets set rule_id = %s", (rule_id,))
    assert error.value.diag.constraint_name == "screening_persistence_sets_rule_id_check"


def test_a_frequency_outside_zero_to_one_is_rejected_by_the_database(connection, reference):  # PE11
    load(connection, mixed_records(), persistence=[source(reference)])

    with pytest.raises(psycopg.errors.CheckViolation):
        connection.execute("update screening_persistence_frequencies set lower_top20_frequency = 1.2")


def test_the_numbers_go_with_their_school_and_their_version(connection, reference):  # PE15
    load(connection, mixed_records(), persistence=[source(reference)])
    count = scalar(connection, "select count(*) from screening_persistence_frequencies")
    assert count == 12

    connection.execute("delete from screening_inputs where source_school_name = 'Interval No Air'")
    assert scalar(connection, "select count(*) from screening_persistence_frequencies") == 9

    connection.execute("delete from screening_input_versions")
    for table in PERSISTENCE_TABLES:
        assert scalar(connection, f"select count(*) from {table}") == 0


def test_the_persistence_tables_are_closed_to_the_data_api_roles(connection):  # PE16
    for table in PERSISTENCE_TABLES:
        assert scalar(connection, "select relrowsecurity from pg_class where oid = %s::regclass", (table,))
        for role in ("anon", "authenticated"):
            for privilege in ("select", "insert", "update", "delete", "truncate", "references", "trigger"):
                assert not scalar(
                    connection,
                    "select has_table_privilege(%s, %s, %s)",
                    (role, f"public.{table}", privilege),
                ), f"{role} holds {privilege} on {table}"


def test_the_migration_applies_a_second_time_and_keeps_the_numbers(connection, reference):  # PE17
    load(connection, mixed_records(), persistence=[source(reference)])
    before = persistence_state(connection)

    apply_migrations(connection)

    assert persistence_state(connection) == before
    assert before["screening_persistence_frequencies"]


def test_a_failed_apply_leaves_no_persistence_table_behind(connection_before_persistence):  # PE17
    connection = connection_before_persistence
    original = (SQL_DIR / "006_screening_persistence.sql").read_text(encoding="utf-8")
    broken = original.replace("\ncommit;", "\nselect 1 / 0;\ncommit;")
    assert broken != original

    # `psql -f` sends one statement at a time and stops at the first error; the file's own transaction rolls back.
    code = "\n".join(line for line in broken.splitlines() if not line.lstrip().startswith("--"))
    with pytest.raises(psycopg.errors.DivisionByZero):
        for statement in (part.strip() for part in code.split(";") if part.strip()):
            connection.execute(statement)
    connection.execute("rollback")

    assert (
        scalar(
            connection,
            "select count(*) from pg_class where relname like %s and relkind = 'r'",
            ("screening\\_persistence\\_%",),
        )
        == 0
    )


# ---------------------------------------------------------------------------------------------
# One set per rule: the circulated paper's experiment for additive_u, the revised paper's for additive_no_u.
# ---------------------------------------------------------------------------------------------


def test_each_rule_keeps_its_own_set_with_its_own_numbers_and_provenance(connection, reference):  # PE21
    first, second = source(reference), source_no_u(reference)

    report = load(connection, mixed_records(), persistence=[first, second])

    assert report.persistence == {
        "additive_u": f"created (4 schools, sha256 {first.source_sha256})",
        "additive_no_u": f"created (4 schools, sha256 {second.source_sha256})",
    }
    stored = store.read_persistence(connection, VERSION)
    assert sorted(stored) == ["additive_no_u", "additive_u"]
    assert (stored["additive_u"].set.experiment_id, stored["additive_no_u"].set.experiment_id) == (
        EXPERIMENT,
        EXPERIMENT_NO_U,
    )
    assert stored["additive_no_u"].set.source_path == PERSISTENCE_PATH_NO_U
    assert stored["additive_u"].frequencies == {STORED_NAME[n]: f for n, f in FREQUENCIES.items()}
    assert stored["additive_no_u"].frequencies == {STORED_NAME[n]: f for n, f in FREQUENCIES_NO_U.items()}
    assert store.read_persistence(connection, VERSION, "additive_no_u").keys() == {"additive_no_u"}
    assert store.read_persistence(connection, VERSION, "benchmark") == {}


def test_a_school_that_is_persistent_under_one_rule_need_not_be_under_the_other(
    connection, reference
):  # PE21
    load(connection, mixed_records(), persistence=[source(reference), source_no_u(reference)])

    stored = store.read_persistence(connection, VERSION)

    assert stored["additive_u"].is_persistent(AWK[2]) is False
    assert stored["additive_no_u"].is_persistent(AWK[2]) is False
    assert stored["additive_u"].is_persistent(AWK[0]) is True
    assert stored["additive_no_u"].lowest_frequency(AWK[0]) == 0.9
    assert stored["additive_u"].lowest_frequency(AWK[0]) == 0.98


def test_the_threshold_band_is_the_rules_own_one_standard_error_for_the_circulated_rule_two_for_the_revised(
    connection, reference
):  # PE22
    both = {"Leading Space School": (0.808, 0.9, 0.9), "Trailing Space School": (0.9, 0.9, 0.9)}
    load(
        connection,
        mixed_records(),
        persistence=[source(reference, both), source_no_u(reference, both)],
    )

    stored = store.read_persistence(connection, VERSION)

    # 0.808 is 0.008 above 0.80. One standard error is about 0.0057 and two about 0.0113.
    assert stored["additive_u"].set.adjacency_standard_errors == 1
    assert stored["additive_no_u"].set.adjacency_standard_errors == 2
    assert stored["additive_u"].is_threshold_adjacent(AWK[0]) is False
    assert stored["additive_no_u"].is_threshold_adjacent(AWK[0]) is True
    assert stored["additive_no_u"].is_threshold_adjacent(AWK[1]) is False


def test_a_rerun_with_both_files_changes_nothing_and_a_changed_file_of_one_rule_is_refused(
    connection, reference
):  # PE23
    first, second = source(reference), source_no_u(reference)
    load(connection, mixed_records(), persistence=[first, second])
    before = snapshot(connection)

    again = load(connection, mixed_records(), persistence=[first, second])
    assert set(again.persistence) == {"additive_u", "additive_no_u"}
    assert all(state.startswith("unchanged") for state in again.persistence.values())
    assert snapshot(connection) == before

    changed = source_no_u(reference, {**FREQUENCIES_NO_U, "UPPER Case School": (0.9, 0.9, 0.95)})
    with pytest.raises(PersistenceConflict, match=r"additive_no_u .*never overwritten"):
        load(connection, mixed_records(), persistence=[first, changed])
    assert snapshot(connection) == before


def test_a_set_cannot_be_attached_later_to_a_version_that_has_the_other_rules_set(
    connection, reference
):  # PE24
    # The first load carried the circulated experiment only. A response naming that version is cached as immutable,
    # so the revised experiment's numbers are not added to it.
    first = source(reference)
    load(connection, mixed_records(), persistence=[first])
    before = snapshot(connection)

    with pytest.raises(PersistenceConflict, match="without persistence numbers for additive_no_u"):
        load(connection, mixed_records(), persistence=[first, source_no_u(reference)])

    assert snapshot(connection) == before
    assert sorted(store.read_persistence(connection, VERSION)) == ["additive_u"]


def test_two_files_for_one_rule_in_one_load_are_refused_and_nothing_is_stored(connection, reference):  # PE25
    with pytest.raises(ScreeningLoadError, match="more than once for one rule"):
        load(connection, mixed_records(), persistence=[source(reference), source(reference)])

    assert_nothing_stored(connection)


@pytest.mark.parametrize("rule_id", ["benchmark", "need_first_no_u", "bottleneck_u", "nonsense"])
def test_a_rule_that_cannot_have_persistence_numbers_is_refused_before_the_file_is_read(
    reference, rule_id
):  # PE26
    relative = write_persistence_files(reference, FREQUENCIES)

    with pytest.raises(ScreeningLoadError, match="cannot have persistence numbers"):
        read_persistence_source(reference, relative, rule_id)


def test_an_experiment_that_gave_urgency_a_weight_is_not_stored_for_the_urgency_omitted_rule(
    reference,
):  # PE27
    relative = write_persistence_files(reference, FREQUENCIES)

    with pytest.raises(
        ScreeningLoadError, match="gave urgency a weight, but rule additive_no_u does not read"
    ):
        read_persistence_source(reference, relative, "additive_no_u")


def test_an_experiment_that_left_urgency_out_is_not_stored_for_the_urgency_included_rule(reference):  # PE27
    relative = write_persistence_files(reference, FREQUENCIES_NO_U, urgency_omitted=True)

    with pytest.raises(ScreeningLoadError, match="did not give urgency a weight, but rule additive_u reads"):
        read_persistence_source(reference, relative, "additive_u")


def test_a_receipt_that_does_not_say_whether_urgency_had_a_weight_is_refused(reference):  # PE27
    relative = write_persistence_files(reference, FREQUENCIES)
    receipt_path = (reference / relative).parent / "run_receipt.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    del receipt["recommended_weights"]
    receipt_path.write_text(json.dumps(receipt), encoding="utf-8")

    with pytest.raises(ScreeningLoadError, match="recommended_weights"):
        read_persistence_source(reference, relative, "additive_u")


def test_a_file_that_differs_from_the_hash_its_experiment_recorded_is_refused(reference):  # PE28
    relative = write_persistence_files(
        reference, FREQUENCIES_NO_U, urgency_omitted=True, hash_record="a" * 64
    )

    with pytest.raises(ScreeningLoadError, match="but its experiment records " + "a" * 64):
        read_persistence_source(reference, relative, "additive_no_u")


def test_a_file_that_was_edited_after_its_hash_was_recorded_is_refused(reference):  # PE28
    relative = write_persistence_files(reference, FREQUENCIES_NO_U, urgency_omitted=True)
    path = reference / relative
    path.write_text(path.read_text(encoding="utf-8").replace("0.808", "0.809"), encoding="utf-8")

    with pytest.raises(ScreeningLoadError, match="records"):
        read_persistence_source(reference, relative, "additive_no_u")


def test_a_record_of_hashes_that_does_not_list_the_file_is_refused(reference):  # PE28
    relative = write_persistence_files(
        reference, FREQUENCIES_NO_U, urgency_omitted=True, hash_record="unlisted"
    )

    with pytest.raises(
        ScreeningLoadError, match=r"records 0 hash\(es\) for persistent_investigation_candidates.csv"
    ):
        read_persistence_source(reference, relative, "additive_no_u")


def test_a_pin_is_checked_as_well_as_the_recorded_hash(reference):  # PE28
    relative = write_persistence_files(reference, FREQUENCIES_NO_U, urgency_omitted=True)
    actual = read_persistence_source(reference, relative, "additive_no_u").source_sha256

    with pytest.raises(ScreeningLoadError, match="not the expected " + "b" * 64):
        read_persistence_source(reference, relative, "additive_no_u", "b" * 64)
    assert read_persistence_source(reference, relative, "additive_no_u", actual).source_sha256 == actual


def test_an_experiment_with_no_recorded_hash_is_read_on_its_receipt_alone_or_with_a_pin(reference):  # PE28
    relative = write_persistence_files(reference, FREQUENCIES)
    assert not (reference / relative).parent.joinpath("artifact_hashes.json").exists()

    assert read_persistence_source(reference, relative, "additive_u").experiment_id == EXPERIMENT


def test_a_count_near_the_threshold_that_disagrees_with_the_table_is_refused(reference):  # PE29
    relative = write_persistence_files(reference, FREQUENCIES_NO_U, urgency_omitted=True, adjacent_count=3)

    with pytest.raises(
        ScreeningLoadError, match=r"states cutoff 0.8, 5000 draws and 3 school\(s\) near the threshold"
    ):
        read_persistence_source(reference, relative, "additive_no_u")


def test_an_experiment_that_counts_no_school_near_the_threshold_must_have_none_in_its_table(
    reference,
):  # PE29
    # Zero in the file, one in the table: a school sits 0.008 above the line, inside two standard errors.
    relative = write_persistence_files(reference, FREQUENCIES_NO_U, urgency_omitted=True, adjacent_count=0)

    with pytest.raises(
        ScreeningLoadError, match=r"0 school\(s\) near the threshold, but the table gives .* 1 within 2"
    ):
        read_persistence_source(reference, relative, "additive_no_u")


def test_the_adjacency_count_of_an_urgency_included_experiment_uses_one_standard_error(reference):  # PE29
    # The same table is counted with a band of one standard error under the circulated rule: 0.008 is outside it.
    relative = write_persistence_files(reference, FREQUENCIES_NO_U, adjacency=True)

    assert read_persistence_source(reference, relative, "additive_u").experiment_id == EXPERIMENT


# ---------------------------------------------------------------------------------------------
# The schema, rule by rule, and the upgrade from 006.
# ---------------------------------------------------------------------------------------------


def test_the_revised_rule_can_hold_a_set_in_the_database(connection, reference):  # PE30
    load(connection, mixed_records(), persistence=[source_no_u(reference)])

    assert scalar(connection, "select rule_id from screening_persistence_sets") == "additive_no_u"


def test_007_lets_the_revised_rule_store_a_set_and_keeps_the_numbers_stored_under_006(
    connection_before_per_rule_persistence, reference
):  # PE31
    connection = connection_before_per_rule_persistence
    load(connection, mixed_records(), "old", persistence=[source(reference)])
    before = persistence_state(connection)

    # Under 006 the check refuses the revised rule, whatever the loader accepted.
    with pytest.raises(psycopg.errors.CheckViolation) as error:
        load(connection, mixed_records(), "new", persistence=[source_no_u(reference)])
    assert error.value.diag.constraint_name == "screening_persistence_sets_rule_id_check"
    assert persistence_state(connection) == before

    connection.execute((SQL_DIR / "007_screening_persistence_per_rule.sql").read_text(encoding="utf-8"))
    load(connection, mixed_records(), "new", persistence=[source_no_u(reference)])

    sets = store.read_persistence_sets(connection)
    assert {version: sorted(by_rule) for version, by_rule in sets.items()} == {
        "old": ["additive_u"],
        "new": ["additive_no_u"],
    }
    assert store.read_persistence(connection, "old")["additive_u"].frequencies == {
        STORED_NAME[n]: f for n, f in FREQUENCIES.items()
    }


def test_a_failed_apply_of_007_leaves_the_rule_check_as_006_made_it(
    connection_before_per_rule_persistence,
):  # PE32
    connection = connection_before_per_rule_persistence
    original = (SQL_DIR / "007_screening_persistence_per_rule.sql").read_text(encoding="utf-8")
    broken = original.replace("\ncommit;", "\nselect 1 / 0;\ncommit;")
    assert broken != original

    code = "\n".join(line for line in broken.splitlines() if not line.lstrip().startswith("--"))
    with pytest.raises(psycopg.errors.DivisionByZero):
        for statement in (part.strip() for part in code.split(";") if part.strip()):
            connection.execute(statement)
    connection.execute("rollback")

    definition = scalar(
        connection,
        "select pg_get_constraintdef(oid) from pg_constraint where conname = 'screening_persistence_sets_rule_id_check'",
    )
    assert "additive_no_u" not in definition and "additive_u" in definition


# ---------------------------------------------------------------------------------------------
# The command.
# ---------------------------------------------------------------------------------------------


def run_command(database_url: str, reference: Path, datasets: Path, *extra: str):
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "app.ingestion.load_screening_inputs",
            "--input-version",
            VERSION,
            "--reference-root",
            str(reference),
            "--datasets-root",
            str(datasets),
            *extra,
        ],
        cwd=API_ROOT,
        env={**os.environ, "DATABASE_URL": database_url},
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_the_command_stores_the_numbers_and_a_rerun_changes_nothing(
    connection, database_url, tmp_path
):  # PE18
    reference, datasets = tmp_path / "reference", tmp_path / "datasets"
    write_source_files(mixed_records(), reference, datasets)
    write_persistence_files(reference, FREQUENCIES)
    sha = read_persistence_source(reference, PERSISTENCE_PATH, "additive_u").source_sha256

    first = run_command(
        database_url,
        reference,
        datasets,
        "--persistence",
        f"additive_u={PERSISTENCE_PATH}",
        "--persistence-sha256",
        f"additive_u={sha}",
    )

    assert first.returncode == 0, first.stderr
    assert f"persistence additive_u: created (4 schools, sha256 {sha})" in first.stdout
    before = snapshot(connection)

    second = run_command(database_url, reference, datasets, "--persistence", f"additive_u={PERSISTENCE_PATH}")

    assert second.returncode == 0, second.stderr
    assert f"persistence additive_u: unchanged (4 schools, sha256 {sha})" in second.stdout
    assert snapshot(connection) == before


def test_the_command_refuses_a_wrong_hash_without_a_traceback_and_stores_nothing(
    connection, database_url, tmp_path
):  # PE8, PE18
    reference, datasets = tmp_path / "reference", tmp_path / "datasets"
    write_source_files(mixed_records(), reference, datasets)
    write_persistence_files(reference, FREQUENCIES)

    result = run_command(
        database_url,
        reference,
        datasets,
        "--persistence",
        f"additive_u={PERSISTENCE_PATH}",
        "--persistence-sha256",
        f"additive_u={'1' * 64}",
    )

    assert result.returncode == 1
    assert "not the expected " + "1" * 64 in result.stderr and "Traceback" not in result.stderr
    assert_nothing_stored(connection)


def test_the_hash_alone_is_a_usage_error(connection, database_url, tmp_path):  # PE18
    result = run_command(database_url, tmp_path, tmp_path, "--persistence-sha256", f"additive_u={'1' * 64}")

    assert result.returncode == 2 and "needs --persistence for the same rule" in result.stderr


def test_the_command_stores_both_sets_and_a_rerun_changes_nothing(connection, database_url, tmp_path):  # PE33
    reference, datasets = tmp_path / "reference", tmp_path / "datasets"
    write_source_files(mixed_records(), reference, datasets)
    write_persistence_files(reference, FREQUENCIES)
    write_persistence_files(reference, FREQUENCIES_NO_U, urgency_omitted=True)
    pin = read_persistence_source(reference, PERSISTENCE_PATH, "additive_u").source_sha256
    other = read_persistence_source(reference, PERSISTENCE_PATH_NO_U, "additive_no_u").source_sha256
    arguments = (
        "--persistence",
        f"additive_u={PERSISTENCE_PATH}",
        "--persistence",
        f"additive_no_u={PERSISTENCE_PATH_NO_U}",
        "--persistence-sha256",
        f"additive_u={pin}",
    )

    first = run_command(database_url, reference, datasets, *arguments)

    assert first.returncode == 0, first.stderr
    assert f"persistence additive_u: created (4 schools, sha256 {pin})" in first.stdout
    assert f"persistence additive_no_u: created (4 schools, sha256 {other})" in first.stdout
    before = snapshot(connection)

    second = run_command(database_url, reference, datasets, *arguments)

    assert second.returncode == 0, second.stderr
    assert f"persistence additive_u: unchanged (4 schools, sha256 {pin})" in second.stdout
    assert f"persistence additive_no_u: unchanged (4 schools, sha256 {other})" in second.stdout
    assert snapshot(connection) == before


def test_the_command_refuses_a_set_under_the_wrong_rule_and_stores_nothing(
    connection, database_url, tmp_path
):  # PE27, PE33
    reference, datasets = tmp_path / "reference", tmp_path / "datasets"
    write_source_files(mixed_records(), reference, datasets)
    write_persistence_files(reference, FREQUENCIES)

    result = run_command(
        database_url, reference, datasets, "--persistence", f"additive_no_u={PERSISTENCE_PATH}"
    )

    assert result.returncode == 1
    assert "gave urgency a weight" in result.stderr and "Traceback" not in result.stderr
    assert_nothing_stored(connection)


@pytest.mark.parametrize(
    ("arguments", "message"),
    [
        (("--persistence", "additive_u"), "must be RULE=VALUE"),
        (("--persistence", "=somewhere.csv"), "must be RULE=VALUE"),
        (
            ("--persistence", "additive_u=a.csv", "--persistence", "additive_u=b.csv"),
            "given twice for additive_u",
        ),
        (
            (
                "--persistence-sha256",
                "additive_u=" + "1" * 64,
                "--persistence-sha256",
                "additive_u=" + "2" * 64,
            ),
            "given twice",
        ),
        (
            ("--persistence", "additive_u=a.csv", "--persistence-sha256", "additive_no_u=" + "1" * 64),
            "for the same rule",
        ),
    ],
)
def test_malformed_persistence_arguments_are_a_usage_error(
    connection, database_url, tmp_path, arguments, message
):  # PE33
    result = run_command(database_url, tmp_path, tmp_path, *arguments)

    assert result.returncode == 2 and message in result.stderr
    assert "Traceback" not in result.stderr
