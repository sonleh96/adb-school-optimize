"""Small helpers shared by the screening database tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import psycopg
from app.ingestion.load_screening_inputs import LoadReport, load_screening
from psycopg.rows import dict_row
from school_scoring.screening import SchoolRecord

SQL_DIR = Path(__file__).resolve().parents[3] / "infra" / "sql"
VERSION = "synthetic-v1"
SOURCE_MANIFEST = [{"table": "synthetic", "root": "datasets", "path": "synthetic.csv", "sha256": "0" * 64}]
TABLES = ("screening_input_versions", "screening_inputs", "screening_runs", "screening_results")


SCREENING_MIGRATION = SQL_DIR / "005_screening.sql"


def migration_files() -> list[Path]:
    return sorted(SQL_DIR.glob("*.sql"))


def apply_migrations(connection: psycopg.Connection, files: list[Path] | None = None) -> None:
    """Apply the files of infra/sql in order (all of them by default), as an operator would."""
    for path in migration_files() if files is None else files:
        connection.execute(path.read_text(encoding="utf-8"))


def load(
    connection: psycopg.Connection, records: tuple[SchoolRecord, ...], version: str = VERSION
) -> LoadReport:
    return load_screening(
        connection,
        input_version=version,
        records=records,
        source_manifest=SOURCE_MANIFEST,
        description="invented records",
    )


def rows(connection: psycopg.Connection, query: str, params: tuple = ()) -> list[dict[str, Any]]:
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(query, params)
        return cursor.fetchall()


def scalar(connection: psycopg.Connection, query: str, params: tuple = ()) -> Any:
    return connection.execute(query, params).fetchone()[0]


def snapshot(connection: psycopg.Connection) -> dict[str, list[str]]:
    """Every row of the four screening tables as sorted JSON text, including ids and timestamps."""
    return {
        table: sorted(
            json.dumps(row["row"], sort_keys=True)
            for row in rows(connection, f"select to_jsonb(t) as row from {table} t")
        )
        for table in TABLES
    }


def add_school(connection: psycopg.Connection, name: str) -> Any:
    return scalar(
        connection,
        "insert into schools (school_name, province, district, latitude, longitude, geom) "
        "values (%s, 'Province One', 'District One', -6.0, 147.0, st_setsrid(st_makepoint(147.0, -6.0), 4326)) "
        "returning school_id",
        (name,),
    )
