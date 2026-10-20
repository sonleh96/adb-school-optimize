"""Reads that the screening API adds to ``screening_store``: version listing, run choice and school identities.

Nothing here recomputes a score.
A school's identity is the source name, byte for byte, with the province, district and locality of the input version,
and the coordinates of the matching row of ``schools`` when the ingestion linked one.
"""

from __future__ import annotations

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


def current_runs(connection: psycopg.Connection, input_version: str) -> dict[str, store.StoredRun]:
    """The newest stored run of each rule for a version. A run states its own package version."""
    newest: dict[str, store.StoredRun] = {}
    for run in store.list_runs(connection, input_version):
        if run.rule_id not in newest or run.created_at > newest[run.rule_id].created_at:
            newest[run.rule_id] = run
    return newest


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
