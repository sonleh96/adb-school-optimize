"""Load the screening inputs of the study and materialize every screening rule from them.

    python -m app.ingestion.load_screening_inputs --input-version <id> \
        --reference-root <methodology dir> --datasets-root <datasets dir> [--description <text>]

The three source tables go through the engine's input contract (``assemble_frame``, ``parse_records``),
the records are stored as one input version, and all registered rules are run and stored.
Everything is written in one transaction.

Rerunning with identical inputs changes nothing.
An existing version with a different input hash is refused, and so is a stored run that no longer equals the engine's output.
Schools that match no row of ``schools`` are stored with a null ``school_id`` and listed in the output.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

import pandas as pd
import psycopg
from psycopg import sql
from psycopg.rows import tuple_row
from psycopg.types.json import Json
from school_scoring.screening import (
    INPUT_CONTRACT,
    InputContractError,
    SchoolRecord,
    ScreeningRun,
    Table,
    assemble_frame,
    parse_records,
    prepare,
    records_sha256,
    screen_all,
)

from .. import screening_store as store
from ..settings import get_settings

# Where each source table of the study lives, relative to the root named by ``root``.
SOURCE_FILES: tuple[tuple[Table, str, str], ...] = (
    (Table.RAW_SCHOOLS, "datasets", "png_curated_sec_schools_access_v3_clean.csv"),
    (
        Table.PREPARED_SCHOOLS,
        "reference",
        "experiments/nightlights/EXP-15-v0.1.0-20261008/results/tables/prepared_current_school_data.csv",
    ),
    (
        Table.ENVIRONMENT_FEATURES,
        "reference",
        "experiments/environment/EXP-20-v0.1.0-20261012/features/results/environment_features.csv",
    ),
)


# Every source table lists the schools under this column; the engine joins the tables on it.
KEY_COLUMN = INPUT_CONTRACT[0].source_column


class ScreeningLoadError(Exception):
    """The load was refused. Nothing was written."""


class VersionConflict(ScreeningLoadError):
    """The input version exists with a different input hash."""


class InputsConflict(ScreeningLoadError):
    """The stored input rows of a version no longer equal its records."""


class RunConflict(ScreeningLoadError):
    """A stored run differs from what the engine produces for the same version, rule and package version."""


@dataclass(frozen=True)
class LoadReport:
    input_version: str
    version_created: bool
    record_count: int
    input_sha256: str
    runs_created: tuple[str, ...]
    runs_unchanged: tuple[str, ...]
    matched: int
    unmatched: tuple[str, ...]
    ambiguous: tuple[str, ...]
    links_changed: int

    def lines(self) -> list[str]:
        state = "created" if self.version_created else "already present with identical inputs"
        lines = [
            f"input version {self.input_version}: {state} ({self.record_count} records, sha256 {self.input_sha256})",
            f"runs created: {', '.join(self.runs_created) or 'none'}",
            f"runs unchanged: {', '.join(self.runs_unchanged) or 'none'}",
            f"schools: matched {self.matched}, unmatched {len(self.unmatched)}, "
            f"ambiguous {len(self.ambiguous)}, links changed {self.links_changed}",
        ]
        lines += [f"  unmatched: {name!r}" for name in self.unmatched]
        lines += [f"  ambiguous: {name!r}" for name in self.ambiguous]
        return lines


def read_source_tables(
    reference_root: Path, datasets_root: Path
) -> tuple[dict[Table, pd.DataFrame], list[dict[str, str]]]:
    """Read the study's source tables and describe each by its relative path and SHA-256."""
    roots = {"reference": Path(reference_root), "datasets": Path(datasets_root)}
    tables: dict[Table, pd.DataFrame] = {}
    manifest = []
    for table, root, relative in SOURCE_FILES:
        path = roots[root] / relative
        if not path.is_file():
            raise ScreeningLoadError(f"source table not found: {root} root / {relative}")
        try:
            tables[table] = pd.read_csv(path, float_precision="round_trip")
        except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError) as error:
            raise ScreeningLoadError(
                f"source table {root} root / {relative} cannot be read: {error}"
            ) from error
        if KEY_COLUMN not in tables[table].columns:
            raise ScreeningLoadError(f"{table.value} has no column {KEY_COLUMN!r}")
        manifest.append(
            {
                "table": table.value,
                "root": root,
                "path": relative,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    return tables, manifest


# ---------------------------------------------------------------------------------------------
# Writes. Each helper runs inside the caller's transaction.
# ---------------------------------------------------------------------------------------------


def _fetch(connection: psycopg.Connection, query: str, params: Any) -> list[tuple]:
    """Rows as tuples whatever row factory the caller's connection uses (the API pool uses dict_row)."""
    with connection.cursor(row_factory=tuple_row) as cursor:
        cursor.execute(query, params)
        return cursor.fetchall()


def _insert_version(
    connection: psycopg.Connection,
    input_version: str,
    description: str | None,
    source_manifest: Sequence[Mapping[str, str]],
    input_sha256: str,
    records: Sequence[SchoolRecord],
) -> None:
    connection.execute(
        "insert into screening_input_versions "
        "(input_version, description, source_manifest, input_sha256, record_count) values (%s, %s, %s, %s, %s)",
        (input_version, description, Json(list(source_manifest)), input_sha256, len(records)),
    )
    query = sql.SQL(
        "insert into screening_inputs (input_version, record_position, {columns}) values ({marks})"
    ).format(
        columns=sql.SQL(", ").join(map(sql.Identifier, store.INPUT_COLUMNS)),
        marks=sql.SQL(", ").join(sql.Placeholder() for _ in range(len(store.INPUT_COLUMNS) + 2)),
    )
    names = [field.name for field in INPUT_CONTRACT]
    with connection.cursor() as cursor:
        cursor.executemany(
            query,
            [
                (input_version, position, *(getattr(record, name) for name in names))
                for position, record in enumerate(records)
            ],
        )


def _result_values(row: store.ResultRow) -> list[Any]:
    values: list[Any] = []
    for column in store.RESULT_COLUMNS:
        if column == "school_id":
            continue
        value = getattr(row, column)
        if column == "cohort":
            value = value.value
        elif column == "gate_failures":
            value = [failure.value for failure in value]
        elif column in store.RESULT_JSON_COLUMNS and value is not None:
            value = Json(value)
        values.append(value)
    return values


def _insert_run(connection: psycopg.Connection, input_version: str, run: ScreeningRun) -> None:
    manifest = run.manifest
    ((run_id,),) = _fetch(
        connection,
        "insert into screening_runs (input_version, rule_id, provenance, policy_role, score_kind, manifest, "
        "input_sha256, anchors_sha256, package_version) values (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
        "returning run_id",
        (
            input_version,
            manifest.rule_id,
            manifest.provenance,
            manifest.policy_role,
            manifest.score_kind,
            Json(manifest.to_dict()),
            manifest.input_sha256,
            manifest.anchors_sha256,
            manifest.package_version,
        ),
    )
    columns = [c for c in store.RESULT_COLUMNS if c != "school_id"]
    query = sql.SQL(
        "insert into screening_results (run_id, input_version, {columns}) values ({marks})"
    ).format(
        columns=sql.SQL(", ").join(map(sql.Identifier, columns)),
        marks=sql.SQL(", ").join(sql.Placeholder() for _ in range(len(columns) + 2)),
    )
    with connection.cursor() as cursor:
        cursor.executemany(
            query,
            [
                (run_id, input_version, *_result_values(store.result_row(result, manifest)))
                for result in run.results
            ],
        )


def _check_stored_run(connection: psycopg.Connection, stored: store.StoredRun, run: ScreeningRun) -> None:
    """A stored run must equal the engine's output exactly; otherwise the load is refused."""
    where = f"{stored.input_version}/{stored.rule_id}/{stored.package_version}"
    if stored.manifest != run.manifest.to_dict():
        raise RunConflict(
            f"stored manifest of {where} differs from the engine's. "
            "Bump the engine package version for a changed method, or investigate the stored run."
        )
    expected = {r.school_name: store.result_row(r, run.manifest) for r in run.results}
    actual = {
        r.source_school_name: replace(r, school_id=None)
        for r in store.read_results(connection, stored.run_id)
    }
    if actual != expected:
        differing = sorted(n for n in expected.keys() | actual.keys() if expected.get(n) != actual.get(n))
        raise RunConflict(
            f"stored results of {where} differ from the engine's for {len(differing)} school(s); "
            "the run is not overwritten."
        )


_LINK_INPUTS = """
with wanted as (
    select i.input_version, i.source_school_name,
           case when count(*) over (partition by i.source_school_name_norm) = 1 then s.school_id end as school_id
    from screening_inputs i
    left join schools s on s.school_name_norm = i.source_school_name_norm
    where i.input_version = %(version)s
)
update screening_inputs i set school_id = w.school_id
from wanted w
where i.input_version = w.input_version
  and i.source_school_name = w.source_school_name
  and i.school_id is distinct from w.school_id
"""

_LINK_RESULTS = """
update screening_results r set school_id = i.school_id
from screening_inputs i
where r.input_version = %(version)s
  and i.input_version = r.input_version
  and i.source_school_name = r.source_school_name
  and r.school_id is distinct from i.school_id
"""

_LINK_STATE = """
select source_school_name, school_id,
       count(*) over (partition by source_school_name_norm) as same_key
from screening_inputs
where input_version = %(version)s
order by record_position
"""


def _link_schools(
    connection: psycopg.Connection, input_version: str
) -> tuple[int, tuple[str, ...], tuple[str, ...], int]:
    """Match inputs to ``schools`` through ``normalize_join_key``.

    A key shared by two input names links neither, because the link would be a guess.
    Rerunning converges: schools loaded or removed since the last run change the links.
    """
    params = {"version": input_version}
    changed = connection.execute(_LINK_INPUTS, params).rowcount
    connection.execute(_LINK_RESULTS, params)
    rows = _fetch(connection, _LINK_STATE, params)
    matched = sum(1 for _, school_id, _ in rows if school_id is not None)
    ambiguous = tuple(name for name, _, same_key in rows if same_key > 1)
    unmatched = tuple(name for name, school_id, same_key in rows if school_id is None and same_key == 1)
    return matched, unmatched, ambiguous, changed


def _check_stored_inputs(
    connection: psycopg.Connection, input_version: str, records: tuple[SchoolRecord, ...], input_sha256: str
) -> None:
    """The version hash says the inputs are identical; the stored rows must say so too.

    The hash covers every field, the order and the names, bit for bit, so one comparison decides.
    """
    stored = store.read_inputs(connection, input_version)
    if records_sha256(stored) == input_sha256:
        return
    by_name = {r.school_name: r for r in stored}
    differing = sorted(r.school_name for r in records if by_name.get(r.school_name) != r)
    extra = sorted(by_name.keys() - {r.school_name for r in records})
    raise InputsConflict(
        f"stored input rows of version {input_version!r} no longer equal its records: "
        f"{len(stored)} stored for {len(records)} supplied, {len(differing)} supplied school(s) missing or different, "
        f"{len(extra)} stored school(s) not supplied. Rows were edited after the load; the version is not repaired."
    )


def load_screening(
    connection: psycopg.Connection,
    *,
    input_version: str,
    records: tuple[SchoolRecord, ...],
    source_manifest: Sequence[Mapping[str, str]],
    description: str | None = None,
) -> LoadReport:
    """Store the records as ``input_version`` and every rule's run on them, atomically and idempotently."""
    if not records:
        raise ScreeningLoadError("no records to load: the source tables list no schools")
    input_sha256 = records_sha256(records)
    runs = screen_all(prepare(records))  # pure: nothing has touched the database yet
    with connection.transaction():
        # Two loads of one version queue here; the second then finds the first and changes nothing.
        connection.execute(
            "select pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"screening-input-version:{input_version}",),
        )
        existing = store.get_input_version(connection, input_version)
        if existing is not None and existing.input_sha256 != input_sha256:
            raise VersionConflict(
                f"input version {input_version!r} already exists with input hash {existing.input_sha256}, "
                f"but these inputs hash to {input_sha256}. Use a new version id; a version is never overwritten."
            )
        if existing is None:
            _insert_version(connection, input_version, description, source_manifest, input_sha256, records)
        else:
            _check_stored_inputs(connection, input_version, records, input_sha256)

        created, unchanged = [], []
        for rule_id, run in runs.items():
            stored = store.find_run(connection, input_version, rule_id, run.manifest.package_version)
            if stored is None:
                _insert_run(connection, input_version, run)
                created.append(rule_id)
            else:
                _check_stored_run(connection, stored, run)
                unchanged.append(rule_id)

        matched, unmatched, ambiguous, changed = _link_schools(connection, input_version)
    return LoadReport(
        input_version=input_version,
        version_created=existing is None,
        record_count=len(records),
        input_sha256=input_sha256,
        runs_created=tuple(created),
        runs_unchanged=tuple(unchanged),
        matched=matched,
        unmatched=unmatched,
        ambiguous=ambiguous,
        links_changed=changed,
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Load screening inputs and materialize every screening rule."
    )
    parser.add_argument("--input-version", required=True, help="Version id, for example paper-2026-10-12.")
    parser.add_argument(
        "--reference-root", type=Path, required=True, help="Methodology folder with the EXP tables."
    )
    parser.add_argument("--datasets-root", type=Path, required=True, help="Folder with the raw school table.")
    parser.add_argument("--description", default=None)
    args = parser.parse_args(argv)

    input_version = args.input_version
    if not input_version or input_version != input_version.strip():
        print("error: --input-version must be non-empty and have no surrounding whitespace", file=sys.stderr)
        return 2
    database_url = get_settings().database_url
    if not database_url:
        print("error: DATABASE_URL is not set", file=sys.stderr)
        return 2
    try:
        tables, source_manifest = read_source_tables(args.reference_root, args.datasets_root)
        records = parse_records(assemble_frame(tables))
        with psycopg.connect(database_url) as connection:
            report = load_screening(
                connection,
                input_version=input_version,
                records=records,
                source_manifest=source_manifest,
                description=args.description,
            )
    except (ScreeningLoadError, InputContractError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    except psycopg.Error as error:
        print(f"error: database: {error}", file=sys.stderr)
        return 1
    print("\n".join(report.lines()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
