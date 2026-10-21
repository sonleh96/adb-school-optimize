"""Typed access to the stored screening inputs, runs and per-school results.

The tables are created by ``infra/sql/005_screening.sql``.
This module owns the row shapes: the ingestion command writes them and the API reads them, so both agree.
Reads never recompute anything. A stored value is exactly what the engine produced.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import asdict, dataclass, fields
from typing import Any

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from school_scoring.screening import (
    INPUT_CONTRACT,
    Cohort,
    Component,
    GateFailure,
    RunManifest,
    SchoolRecord,
    SchoolResult,
)

# The engine's ``school_name`` is stored as ``source_school_name``: the name exactly as the source table has it.
INPUT_COLUMNS: tuple[str, ...] = tuple(
    "source_school_name" if field.name == "school_name" else field.name for field in INPUT_CONTRACT
)

# Reading order of a run: point rank, then best possible rank, unranked last, then name in code point order.
# It matches the index ``screening_results_run_rank_idx``.
RESULT_ORDER = sql.SQL('rank_point asc nulls last, rank_best asc nulls last, source_school_name collate "C"')


@dataclass(frozen=True)
class InputVersion:
    input_version: str
    description: str | None
    source_manifest: list[dict[str, Any]]
    input_sha256: str
    record_count: int
    created_at: dt.datetime


@dataclass(frozen=True)
class StoredRun:
    run_id: uuid.UUID
    input_version: str
    rule_id: str
    provenance: str
    policy_role: str
    score_kind: str
    manifest: dict[str, Any]
    input_sha256: str
    anchors_sha256: str
    package_version: str
    created_at: dt.datetime


@dataclass(frozen=True)
class ResultRow:
    """One school under one run, in the shape of ``screening_results``.

    ``school_id`` is the link to ``schools`` and is the only field the engine does not produce.
    """

    source_school_name: str
    cohort: Cohort
    gate_failures: tuple[GateFailure, ...]
    components: dict[str, float | None]
    need_parts: dict[str, float | None]
    area_parts: dict[str, float | None]
    contributions: list[dict[str, Any]]
    need_part_contributions: dict[str, float | None] | None
    maximum_term: dict[str, Any] | None
    score_lower: float | None
    score_upper: float | None
    score_point: float | None
    sort_key_primary: float | None
    rank_point: int | None
    rank_point_scope: str
    rank_point_count: int
    rank_best: int | None
    rank_worst: int | None
    rank_bounds_scope: str
    rank_bounds_count: int
    school_id: uuid.UUID | None = None


RESULT_COLUMNS: tuple[str, ...] = tuple(f.name for f in fields(ResultRow))
RESULT_JSON_COLUMNS = frozenset(
    {"components", "need_parts", "area_parts", "contributions", "need_part_contributions", "maximum_term"}
)


def result_row(result: SchoolResult, manifest: RunManifest) -> ResultRow:
    """The row the engine's result is stored as. Pure: nothing is added, rounded or filled."""
    return ResultRow(
        source_school_name=result.school_name,
        cohort=result.cohort,
        gate_failures=result.gate_failures,
        components={c.value: result.components.get(c) for c in Component},
        need_parts=asdict(result.need_parts),
        area_parts=asdict(result.area_parts),
        contributions=[
            {"component": c.component.value, "weight": c.weight, "lower": c.lower, "upper": c.upper}
            for c in result.contributions
        ],
        need_part_contributions=None
        if result.need_part_contributions is None
        else asdict(result.need_part_contributions),
        maximum_term=None
        if result.maximum is None
        else {
            "share": result.maximum.share,
            "value": result.maximum.value,
            "attained_by": [c.value for c in result.maximum.attained_by],
            "contribution": result.maximum.contribution,
        },
        score_lower=result.score_lower,
        score_upper=result.score_upper,
        score_point=result.score_point,
        sort_key_primary=None
        if manifest.primary_sort_key is None
        else result.components.get(Component(manifest.primary_sort_key)),
        rank_point=result.rank_point,
        rank_point_scope=manifest.point_rank_scope,
        rank_point_count=manifest.point_rank_count,
        rank_best=result.rank_best,
        rank_worst=result.rank_worst,
        rank_bounds_scope=manifest.rank_bounds_scope,
        rank_bounds_count=manifest.rank_bounds_count,
    )


def _select(
    connection: psycopg.Connection, query: sql.Composable, params: tuple = ()
) -> list[dict[str, Any]]:
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(query, params)
        return cursor.fetchall()


def get_input_version(connection: psycopg.Connection, input_version: str) -> InputVersion | None:
    rows = _select(
        connection,
        sql.SQL(
            "select input_version, description, source_manifest, input_sha256, record_count, created_at "
            "from screening_input_versions where input_version = %s"
        ),
        (input_version,),
    )
    return InputVersion(**rows[0]) if rows else None


def read_inputs(connection: psycopg.Connection, input_version: str) -> tuple[SchoolRecord, ...]:
    """The stored records of a version, in the order they were supplied."""
    query = sql.SQL(
        "select {columns} from screening_inputs where input_version = %s order by record_position"
    ).format(columns=sql.SQL(", ").join(map(sql.Identifier, INPUT_COLUMNS)))
    names = [field.name for field in INPUT_CONTRACT]
    return tuple(
        SchoolRecord(**dict(zip(names, (row[column] for column in INPUT_COLUMNS), strict=True)))
        for row in _select(connection, query, (input_version,))
    )


_RUN_COLUMNS = sql.SQL(
    "run_id, input_version, rule_id, provenance, policy_role, score_kind, manifest, "
    "input_sha256, anchors_sha256, package_version, created_at"
)


def list_runs(connection: psycopg.Connection, input_version: str) -> tuple[StoredRun, ...]:
    query = sql.SQL(
        "select {columns} from screening_runs where input_version = %s order by rule_id, package_version"
    ).format(columns=_RUN_COLUMNS)
    return tuple(StoredRun(**row) for row in _select(connection, query, (input_version,)))


def get_run(connection: psycopg.Connection, run_id: uuid.UUID) -> StoredRun | None:
    query = sql.SQL("select {columns} from screening_runs where run_id = %s").format(columns=_RUN_COLUMNS)
    rows = _select(connection, query, (run_id,))
    return StoredRun(**rows[0]) if rows else None


def find_run(
    connection: psycopg.Connection, input_version: str, rule_id: str, package_version: str
) -> StoredRun | None:
    query = sql.SQL(
        "select {columns} from screening_runs where input_version = %s and rule_id = %s and package_version = %s"
    ).format(columns=_RUN_COLUMNS)
    rows = _select(connection, query, (input_version, rule_id, package_version))
    return StoredRun(**rows[0]) if rows else None


def read_results(connection: psycopg.Connection, run_id: uuid.UUID) -> tuple[ResultRow, ...]:
    """Every school of a run in reading order (see ``RESULT_ORDER``)."""
    query = sql.SQL("select {columns} from screening_results where run_id = %s order by {order}").format(
        columns=sql.SQL(", ").join(map(sql.Identifier, RESULT_COLUMNS)), order=RESULT_ORDER
    )
    return tuple(
        ResultRow(
            **{
                **row,
                "cohort": Cohort(row["cohort"]),
                "gate_failures": tuple(GateFailure(v) for v in row["gate_failures"]),
            }
        )
        for row in _select(connection, query, (run_id,))
    )
