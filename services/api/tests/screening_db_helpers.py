"""Small helpers shared by the screening database tests."""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import psycopg
from app.ingestion.load_screening_inputs import LoadReport, PersistenceSource, load_screening
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row, tuple_row
from school_scoring.screening import SchoolRecord

SQL_DIR = Path(__file__).resolve().parents[3] / "infra" / "sql"
VERSION = "synthetic-v1"
SOURCE_MANIFEST = [{"table": "synthetic", "root": "datasets", "path": "synthetic.csv", "sha256": "0" * 64}]
TABLES = ("screening_input_versions", "screening_inputs", "screening_runs", "screening_results")
PERSISTENCE_TABLES = (
    "screening_persistence_sets",
    "screening_persistence_settings",
    "screening_persistence_frequencies",
)


SCREENING_MIGRATION = SQL_DIR / "005_screening.sql"

NO_DATABASE = "set DATABASE_URL to a PostGIS server to run the screening database tests"
LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")
# Each of these can point a connection at a server that DATABASE_URL does not name.
REDIRECTING_ENVIRONMENT = ("PGHOST", "PGHOSTADDR", "PGSERVICE")


class DatabaseTestsUnavailable(Exception):
    """The database tests cannot run here; the message says why."""


def server_url(environ: Mapping[str, str]) -> str:
    """The server the database tests may create databases on, or the reason they must not run.

    The tests create and drop whole databases, so the URL must name a local host explicitly.
    A host-less URL, ``hostaddr``, a service entry or a ``PG*`` variable could each reach another server.
    """
    url = environ.get("DATABASE_URL")
    if not url:
        raise DatabaseTestsUnavailable(NO_DATABASE)
    for name in REDIRECTING_ENVIRONMENT:
        if environ.get(name):
            raise DatabaseTestsUnavailable(f"refusing to create test databases while {name} is set")
    try:
        params = conninfo_to_dict(url)
    except psycopg.ProgrammingError as error:
        raise DatabaseTestsUnavailable(f"DATABASE_URL cannot be parsed: {error}") from error
    for key in ("hostaddr", "service"):
        if key in params:
            raise DatabaseTestsUnavailable(f"refusing to create test databases: DATABASE_URL sets {key}")
    if params.get("host") not in LOCAL_HOSTS:
        raise DatabaseTestsUnavailable(
            f"refusing to create test databases: DATABASE_URL must name host {' or '.join(LOCAL_HOSTS)} explicitly"
        )
    return url


def require_database_tests(environ: Mapping[str, str]) -> bool:
    """CI sets this so that a missing database fails the job instead of skipping its tests."""
    return environ.get("REQUIRE_DATABASE_TESTS", "").strip().lower() in {"1", "true", "yes"}


def migration_files() -> list[Path]:
    return sorted(SQL_DIR.glob("*.sql"))


def apply_migrations(connection: psycopg.Connection, files: list[Path] | None = None) -> None:
    """Apply the files of infra/sql in order (all of them by default), as an operator would."""
    for path in migration_files() if files is None else files:
        connection.execute(path.read_text(encoding="utf-8"))


def load(
    connection: psycopg.Connection,
    records: tuple[SchoolRecord, ...],
    version: str = VERSION,
    persistence: PersistenceSource | None = None,
) -> LoadReport:
    return load_screening(
        connection,
        input_version=version,
        records=records,
        source_manifest=SOURCE_MANIFEST,
        description="invented records",
        persistence=persistence,
    )


def rows(connection: psycopg.Connection, query: str, params: tuple = ()) -> list[dict[str, Any]]:
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(query, params)
        return cursor.fetchall()


def scalar(connection: psycopg.Connection, query: str, params: tuple = ()) -> Any:
    with connection.cursor(row_factory=tuple_row) as cursor:
        cursor.execute(query, params)
        return cursor.fetchone()[0]


def snapshot(connection: psycopg.Connection) -> dict[str, list[str]]:
    """Every row of the screening tables, persistence included, as sorted JSON text with ids and timestamps."""
    return {
        table: sorted(
            json.dumps(row["row"], sort_keys=True)
            for row in rows(connection, f"select to_jsonb(t) as row from {table} t")
        )
        for table in (*TABLES, *PERSISTENCE_TABLES)
    }


def add_school(connection: psycopg.Connection, name: str) -> Any:
    return scalar(
        connection,
        "insert into schools (school_name, province, district, latitude, longitude, geom) "
        "values (%s, 'Province One', 'District One', -6.0, 147.0, st_setsrid(st_makepoint(147.0, -6.0), 4326)) "
        "returning school_id",
        (name,),
    )
