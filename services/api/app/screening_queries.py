"""Reads that the screening API adds to ``screening_store``: version listing, run choice and school identities.

Nothing here recomputes a score.
A school's identity is the source name, byte for byte, with the province, district and locality of the input version,
and the coordinates of the matching row of ``schools`` when the ingestion linked one.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg.rows import dict_row

from . import screening_store as store


@dataclass(frozen=True)
class VersionEntry:
    version: store.InputVersion
    rules_available: tuple[str, ...]


@dataclass(frozen=True)
class SchoolIdentity:
    school_id: uuid.UUID | None
    source_school_name: str
    province: str | None
    district: str | None
    locality: str | None
    latitude: float | None
    longitude: float | None


@dataclass(frozen=True)
class SchoolRow:
    """One school under one run: its identity and the stored result."""

    identity: SchoolIdentity
    result: store.ResultRow

    @property
    def name(self) -> str:
        return self.identity.source_school_name


def list_versions(connection: psycopg.Connection) -> tuple[VersionEntry, ...]:
    """Every input version, newest first, with the rules that have a stored run. The first is the default."""
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            "select v.input_version, v.description, v.source_manifest, v.input_sha256, v.record_count, v.created_at, "
            "coalesce(array_agg(distinct r.rule_id) filter (where r.rule_id is not null), '{}') as rules "
            "from screening_input_versions v left join screening_runs r using (input_version) "
            "group by v.input_version order by v.created_at desc, v.input_version desc"
        )
        rows: list[dict[str, Any]] = cursor.fetchall()
    return tuple(
        VersionEntry(
            store.InputVersion(**{k: v for k, v in row.items() if k != "rules"}), tuple(sorted(row["rules"]))
        )
        for row in rows
    )


def package_version_key(version: str) -> tuple:
    """Order package versions by their numeric parts, so that 0.10.0 is above 0.9.0."""
    return tuple(
        (0, int(part), "") if part.isdigit() else (1, 0, part)
        for part in re.findall(r"\d+|[A-Za-z]+", version)
    )


def current_runs(
    connection: psycopg.Connection, input_version: str, package_version: str | None = None
) -> dict[str, store.StoredRun]:
    """One stored run per rule for a version.

    With ``package_version`` it is the run of that engine version, if there is one.
    Without it, it is the run of the highest engine version, whatever order the runs were stored in.
    """
    chosen: dict[str, store.StoredRun] = {}
    for run in store.list_runs(connection, input_version):
        if package_version is not None and run.package_version != package_version:
            continue
        best = chosen.get(run.rule_id)
        if best is None or package_version_key(run.package_version) > package_version_key(
            best.package_version
        ):
            chosen[run.rule_id] = run
    return chosen


def read_identities(connection: psycopg.Connection, input_version: str) -> dict[str, SchoolIdentity]:
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            "select i.source_school_name, i.school_id, i.province, i.district, i.locality, s.latitude, s.longitude "
            "from screening_inputs i left join schools s on s.school_id = i.school_id "
            "where i.input_version = %s",
            (input_version,),
        )
        return {row["source_school_name"]: SchoolIdentity(**row) for row in cursor.fetchall()}


def read_school_rows(connection: psycopg.Connection, run: store.StoredRun) -> tuple[SchoolRow, ...]:
    """Every school of a run in the store's reading order, joined to its identity."""
    identities = read_identities(connection, run.input_version)
    return tuple(
        SchoolRow(identities[result.source_school_name], result)
        for result in store.read_results(connection, run.run_id)
    )
