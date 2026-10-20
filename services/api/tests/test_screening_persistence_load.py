"""Storing the top-20 persistence numbers of an experiment with an input version, against a real database.

The files are invented: the schools, frequencies and experiment id are made up here.
"""

from __future__ import annotations

import os
import subprocess
import sys
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
    PERSISTENCE_PATH,
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
    return read_persistence_source(reference, relative)


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

    report = load(connection, mixed_records(), persistence=parsed)

    assert report.persistence == f"created (4 schools, sha256 {parsed.source_sha256})"
    stored = store.read_persistence(connection, VERSION)
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
    load(connection, mixed_records(), persistence=parsed)
    before = snapshot(connection)

    again = load(connection, mixed_records(), persistence=parsed)

    assert again.persistence == f"unchanged (4 schools, sha256 {parsed.source_sha256})"
    assert snapshot(connection) == before


def test_a_rerun_whose_file_differs_is_refused_and_leaves_the_stored_numbers(connection, reference):  # PE4
    load(connection, mixed_records(), persistence=source(reference))
    before = snapshot(connection)

    changed = {**FREQUENCIES, "UPPER Case School": (0.9, 0.9, 0.95)}  # the flag would flip
    with pytest.raises(PersistenceConflict, match="never overwritten"):
        load(connection, mixed_records(), persistence=source(reference, changed))
    fewer = {k: v for k, v in FREQUENCIES.items() if k != "Interval No Air"}
    with pytest.raises(PersistenceConflict):
        load(connection, mixed_records(), persistence=source(reference, fewer))

    assert snapshot(connection) == before


def test_a_load_without_the_file_leaves_a_stored_set_alone(connection, reference):  # PE3
    load(connection, mixed_records(), persistence=source(reference))
    before = snapshot(connection)

    report = load(connection, mixed_records())

    assert report.persistence is None
    assert snapshot(connection) == before


def test_a_version_loaded_without_the_file_has_no_numbers_and_no_other_version_lends_its_own(
    connection, reference
):  # PE12
    load(connection, mixed_records(), "with", persistence=source(reference))
    load(connection, mixed_records(), "without")

    assert store.read_persistence(connection, "without") is None
    assert set(store.read_persistence_sets(connection)) == {"with"}


# ---------------------------------------------------------------------------------------------
# Refusals. Each one writes nothing, not even the inputs and runs of the load.
# ---------------------------------------------------------------------------------------------


def test_a_name_that_matches_no_school_refuses_the_whole_load(connection, reference):  # PE5
    parsed = source(reference, {**FREQUENCIES, "Nowhere School": (1.0, 1.0, 1.0)})

    with pytest.raises(ScreeningLoadError, match=r"'Nowhere School' matches no school"):
        load(connection, mixed_records(), persistence=parsed)

    assert_nothing_stored(connection)


def test_a_name_that_matches_two_schools_refuses_the_whole_load(connection, reference):  # PE6
    records = (*mixed_records(), record("Twin School"), record("twin   school"))
    parsed = source(reference, {**FREQUENCIES, "Twin School": (1.0, 1.0, 1.0)})

    with pytest.raises(ScreeningLoadError, match=r"matches 2 schools: \['Twin School', 'twin   school'\]"):
        load(connection, records, persistence=parsed)

    assert_nothing_stored(connection)


def test_two_names_for_one_school_refuse_the_whole_load(connection, reference):  # PE7
    parsed = source(reference, {**FREQUENCIES, "interval  no air": (0.5, 0.5, 0.5)})

    with pytest.raises(ScreeningLoadError, match="named by two rows"):
        load(connection, mixed_records(), persistence=parsed)

    assert_nothing_stored(connection)


def test_a_blank_name_matches_no_school(connection, reference):  # PE5
    parsed = source(reference, {**FREQUENCIES, "": (1.0, 1.0, 1.0)})

    with pytest.raises(ScreeningLoadError, match="matches no school"):
        load(connection, mixed_records(), persistence=parsed)

    assert_nothing_stored(connection)


def test_a_file_that_does_not_hash_to_the_expected_value_is_refused(reference):  # PE8
    relative = write_persistence_files(reference, FREQUENCIES)
    actual = read_persistence_source(reference, relative).source_sha256

    with pytest.raises(ScreeningLoadError, match="not the expected " + "0" * 64):
        read_persistence_source(reference, relative, "0" * 64)
    assert read_persistence_source(reference, relative, actual.upper()).source_sha256 == actual


def test_a_flag_column_that_disagrees_with_the_frequencies_is_refused(reference):  # PE9
    relative = write_persistence_files(reference, FREQUENCIES, flags={"UPPER Case School": True})

    with pytest.raises(ScreeningLoadError, match=r"'UPPER Case School' is True .* but its frequencies"):
        read_persistence_source(reference, relative)


def test_a_receipt_count_that_disagrees_with_the_flagged_rows_is_refused(reference):  # PE10
    relative = write_persistence_files(reference, FREQUENCIES, receipt_count=9)

    with pytest.raises(ScreeningLoadError, match="flags 2 schools but its receipt states 9"):
        read_persistence_source(reference, relative)


@pytest.mark.parametrize("bad", ["", "abc", "1.5", "-0.1", "nan"])
def test_a_frequency_that_is_not_a_number_from_zero_to_one_is_refused(reference, bad):  # PE11
    relative = write_persistence_files(reference, FREQUENCIES)
    path = reference / relative
    path.write_text(path.read_text(encoding="utf-8").replace("0.99", bad, 1), encoding="utf-8")

    with pytest.raises(ScreeningLoadError, match=r"not a number|outside 0 to 1"):
        read_persistence_source(reference, relative)


def test_a_path_without_an_experiment_folder_is_refused(reference):  # PE13
    target = reference / "results" / "persistent_investigation_candidates.csv"
    write_persistence_files(reference, FREQUENCIES)
    target.parent.mkdir(parents=True)
    (reference / PERSISTENCE_PATH).rename(target)

    with pytest.raises(ScreeningLoadError, match=r"no EXP-\.\.\. folder"):
        read_persistence_source(reference, "results/persistent_investigation_candidates.csv")


# ---------------------------------------------------------------------------------------------
# The schema.
# ---------------------------------------------------------------------------------------------


def test_the_numbers_cannot_be_stored_for_any_rule_but_the_circulated_one(connection, reference):  # PE14
    load(connection, mixed_records(), persistence=source(reference))

    with pytest.raises(psycopg.errors.CheckViolation) as error:
        connection.execute("update screening_persistence_sets set rule_id = 'additive_no_u'")
    assert error.value.diag.constraint_name == "screening_persistence_sets_rule_id_check"


def test_a_frequency_outside_zero_to_one_is_rejected_by_the_database(connection, reference):  # PE11
    load(connection, mixed_records(), persistence=source(reference))

    with pytest.raises(psycopg.errors.CheckViolation):
        connection.execute("update screening_persistence_frequencies set lower_top20_frequency = 1.2")


def test_the_numbers_go_with_their_school_and_their_version(connection, reference):  # PE15
    load(connection, mixed_records(), persistence=source(reference))
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
    load(connection, mixed_records(), persistence=source(reference))
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
    sha = read_persistence_source(reference, PERSISTENCE_PATH).source_sha256

    first = run_command(
        database_url, reference, datasets, "--persistence-csv", PERSISTENCE_PATH, "--persistence-sha256", sha
    )

    assert first.returncode == 0, first.stderr
    assert f"persistence: created (4 schools, sha256 {sha})" in first.stdout
    before = snapshot(connection)

    second = run_command(database_url, reference, datasets, "--persistence-csv", PERSISTENCE_PATH)

    assert second.returncode == 0, second.stderr
    assert f"persistence: unchanged (4 schools, sha256 {sha})" in second.stdout
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
        "--persistence-csv",
        PERSISTENCE_PATH,
        "--persistence-sha256",
        "1" * 64,
    )

    assert result.returncode == 1
    assert "not the expected " + "1" * 64 in result.stderr and "Traceback" not in result.stderr
    assert_nothing_stored(connection)


def test_the_hash_alone_is_a_usage_error(connection, database_url, tmp_path):  # PE18
    result = run_command(database_url, tmp_path, tmp_path, "--persistence-sha256", "1" * 64)

    assert result.returncode == 2 and "needs --persistence-csv" in result.stderr
