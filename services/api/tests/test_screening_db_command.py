"""The ingestion command, run as a process against a real database with invented source tables."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pandas as pd
from app import screening_store as store
from school_scoring.screening import RULES, Table, prepare, records_sha256, screen_all
from screening_db_factories import mixed_records, read_back, write_source_files
from screening_db_helpers import TABLES, VERSION, add_school, scalar, snapshot

API_ROOT = Path(__file__).resolve().parents[1]


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


def test_command_end_to_end(connection, database_url, tmp_path):  # DB17, DB8
    reference, datasets = tmp_path / "reference", tmp_path / "datasets"
    paths = write_source_files(mixed_records(), reference, datasets)
    add_school(connection, "interval no air")
    expected = read_back(paths)

    first = run_command(database_url, reference, datasets, "--description", "invented")

    assert first.returncode == 0, first.stderr
    assert f"input version {VERSION}: created (14 records, sha256 {records_sha256(expected)})" in first.stdout
    assert "runs created: " + ", ".join(RULES) in first.stdout
    assert "schools: matched 1, unmatched 13, ambiguous 0, links changed 1" in first.stdout
    assert "  unmatched: 'Zed queue'" in first.stdout
    assert "  unmatched: ' Leading Space School'" in first.stdout  # printed exactly, not trimmed
    version = store.get_input_version(connection, VERSION)
    assert version.description == "invented" and version.record_count == 14
    assert [(m["table"], m["root"], len(m["sha256"])) for m in version.source_manifest] == [
        (Table.RAW_SCHOOLS.value, "datasets", 64),
        (Table.PREPARED_SCHOOLS.value, "reference", 64),
        (Table.ENVIRONMENT_FEATURES.value, "reference", 64),
    ]
    assert store.read_inputs(connection, VERSION) == expected
    engine = screen_all(prepare(expected))
    for stored in store.list_runs(connection, VERSION):
        assert stored.manifest == engine[stored.rule_id].manifest.to_dict()

    before = snapshot(connection)
    second = run_command(database_url, reference, datasets)

    assert second.returncode == 0, second.stderr
    assert "already present with identical inputs" in second.stdout
    assert "runs created: none" in second.stdout
    assert "links changed 0" in second.stdout
    assert snapshot(connection) == before


def test_command_refuses_changed_inputs_under_the_same_version(
    connection, database_url, tmp_path
):  # DB5, DB17
    reference, datasets = tmp_path / "reference", tmp_path / "datasets"
    write_source_files(mixed_records(), reference, datasets)
    assert run_command(database_url, reference, datasets).returncode == 0
    before = snapshot(connection)

    raw = datasets / "png_curated_sec_schools_access_v3_clean.csv"
    frame = pd.read_csv(raw)
    frame.loc[0, "Number of Libraries"] += 1
    frame.to_csv(raw, index=False)
    result = run_command(database_url, reference, datasets)

    assert result.returncode == 1
    assert "already exists with input hash" in result.stderr and "never overwritten" in result.stderr
    assert snapshot(connection) == before


def test_command_rejects_a_source_table_that_breaks_the_contract(connection, database_url, tmp_path):  # DB17
    reference, datasets = tmp_path / "reference", tmp_path / "datasets"
    paths = write_source_files(mixed_records(), reference, datasets)
    environment = paths[Table.ENVIRONMENT_FEATURES.value]
    pd.read_csv(environment).drop(columns=["aqi_selected_p95"]).to_csv(environment, index=False)

    result = run_command(database_url, reference, datasets)

    assert result.returncode == 1
    assert "has no column 'aqi_selected_p95'" in result.stderr
    assert {t: scalar(connection, f"select count(*) from {t}") for t in TABLES} == dict.fromkeys(TABLES, 0)


def test_command_names_a_missing_source_table(connection, database_url, tmp_path):  # DB17
    result = run_command(database_url, tmp_path / "nothing", tmp_path / "nowhere")

    assert result.returncode == 1
    assert "source table not found" in result.stderr
    assert scalar(connection, "select count(*) from screening_input_versions") == 0
