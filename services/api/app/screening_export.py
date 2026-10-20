"""CSV and XLSX exports of screening lists, each with the method record needed to read and rebuild it.

An export is a table plus a method record.
The CSV opens with the record as ``#`` lines, then one header row and the data rows.
Skip the leading lines that start with ``#`` before parsing.
The XLSX holds the record on its own first sheet.
Floats are written in full precision, and a missing value is an empty cell, never zero.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import math
import threading
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from openpyxl import Workbook
from openpyxl.cell import _writer as openpyxl_cell_writer
from school_scoring.screening import INPUT_CONTRACT, Component, GateFailure, Provenance, SchoolRecord

from . import screening_store as store
from .models.screening import AnchorOut, ManifestOut, WeightOut
from .screening_lists import Filters, TopSelection
from .screening_queries import SchoolRow

Cell = str | int | float | None

GATE_FAILURE_DETAILS: dict[GateFailure, str] = {
    GateFailure.MISSING_STOCK_FIELD: "A stock count, facility count, power source or water source is missing.",
    GateFailure.NEGATIVE_STOCK_VALUE: "A stock count is negative.",
    GateFailure.NONPOSITIVE_DENOMINATOR: "Total classrooms or available teachers is zero or negative.",
    GateFailure.UNRECOGNIZED_SERVICE_CODING: "The power or water source text matches no recognized category.",
    GateFailure.UNRECOGNIZED_LOCALITY: "The locality category is missing or not recognized.",
    GateFailure.UNRESOLVED_AREA_CONTEXT: "A district-level input of area context is missing or invalid.",
    GateFailure.UNRESOLVED_REACH: "The walking catchment population is missing or negative.",
    GateFailure.URGENCY_UNKNOWN: "This rule reads urgency and the urgency source value is missing.",
}

PROVENANCE_NOTES: dict[Provenance, str] = {
    Provenance.CIRCULATED_PAPER: "A rule of the circulated paper.",
    Provenance.PROPOSED_FOLLOW_UP_PENDING_AUTHOR_REVIEW: (
        "A proposed follow-up scenario pending author review. It is not a result of the circulated paper."
    ),
}

CAVEAT = (
    "Research prototype for screening. The list orders existing school records for closer inspection. "
    "It does not establish condition accuracy, site safety, intervention benefit or an optimal investment portfolio. "
    "A missing input is unknown, not zero. "
    "Normalized AQI, reported greenhouse-gas emissions and modal land-cover classes are different contextual measures, "
    "and together they are not a validated health or hazard scale. "
    "Ranks have different scopes: read each with its scope label."
)
CAVEAT_URGENCY_USED = (
    " Urgency enters this rule; how its source value was extracted and what it means are unresolved."
)
CAVEAT_URGENCY_OMITTED = (
    " Urgency is omitted because its primary measurement is inadmissible. "
    "A zero weight does not mean that no hazard was observed."
)

PLACEMENT_CONVENTION = (
    "Range schools are interval schools: an environmental input is missing, so they have a score range and a rank range "
    "and no point rank or point score. "
    "They appear in their own rows (row_kind=range), after the point rows, ordered by best possible rank. "
    "They are not placed in the point order. "
    "The JSON list places them at their lower-score position by default, and at their upper-score position "
    "only when placement=upper is asked for as a labelled sensitivity."
)

TOP_KEYS_NOTE = (
    "k cuts the rule's full list: point rows have rank_point <= k, and range rows have a best possible rank "
    "(rank_best) <= k. Filters then hide rows; they never renumber a rank."
)

TIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def _format_weight(weight: WeightOut) -> str:
    return f"{weight.component.value} {weight.fraction} ({weight.value!r})"


def _format_anchor(anchor: AnchorOut) -> str:
    bounds = "natural 0..1 fraction" if anchor.p05 is None else f"p05={anchor.p05!r}, p95={anchor.p95!r}"
    return f"{anchor.name} ({anchor.component.value}): {anchor.transformation}; {bounds}; valid {anchor.n_valid} of {anchor.n_records}"


def method_record(
    *,
    export: str,
    manifest: ManifestOut,
    run: store.StoredRun,
    version: store.InputVersion,
    filters: Filters,
    generated_at: dt.datetime,
    top: TopSelection | None = None,
    queue_count: int | None = None,
) -> list[tuple[str, str]]:
    """The facts a reader needs to interpret an export and rebuild its list, as ordered key/value pairs."""
    sort_keys = ", ".join(manifest.sort_columns)
    record: list[tuple[str, str]] = [
        ("export", export),
        ("rule_id", manifest.rule_id),
        ("rule_label", manifest.rule_label),
        ("rule_provenance", manifest.provenance.value),
        ("rule_provenance_note", PROVENANCE_NOTES[manifest.provenance]),
        ("policy_role", manifest.policy_role.value),
        ("score_kind", manifest.score_kind),
        ("formula", manifest.rule_formula),
        ("weights", "; ".join(_format_weight(w) for w in manifest.weights)),
        ("uses_urgency", "yes" if manifest.uses_urgency else "no"),
        ("input_version", version.input_version),
        ("input_sha256", run.input_sha256),
        ("anchors_sha256", run.anchors_sha256),
        ("normalization_anchors", " | ".join(_format_anchor(a) for a in manifest.anchors)),
        ("run_id", str(run.run_id)),
        ("package_version", run.package_version),
        ("tie_rule", manifest.tie_rule),
        ("sort_columns", ",".join(manifest.sort_columns)),
        ("sort_keys", f"{sort_keys} descending, then source_school_name ascending"),
        ("point_rank_scope", manifest.point_rank_scope),
        ("rank_bounds_scope", manifest.rank_bounds_scope),
        ("cohort_counts", ", ".join(f"{name}={count}" for name, count in manifest.cohort_counts.items())),
        ("filters", filters.describe()),
        ("filters_effect", "Filters only hide rows. Ranks, bounds and anchors are those of the full run."),
    ]
    if top is not None:
        record += [
            ("k", str(top.k)),
            ("k_meaning", TOP_KEYS_NOTE),
            ("include_ranges", "yes" if top.include_ranges else "no"),
            ("range_schools_reaching_k", str(len(top.ranges_reaching_k))),
            ("range_schools_included", "yes" if top.include_ranges else "no"),
            ("range_school_convention", PLACEMENT_CONVENTION),
            ("rows_listed", f"point={len(top.point_rows)}, range={len(top.range_rows)}"),
            (
                "how_to_rebuild",
                "Keep rows with row_kind=point. Sort by "
                f"{sort_keys} descending, then source_school_name ascending in Unicode code point order. "
                "The result lists the rows in rank_point order.",
            ),
        ]
    if queue_count is not None:
        record += [
            (
                "queue_definition",
                "Schools with a gate failure under this rule, or whose rule reads urgency and urgency is unknown.",
            ),
            ("rows_listed", f"queue={queue_count}"),
        ]
    record += [
        ("generated_at", generated_at.astimezone(dt.timezone.utc).strftime(TIME_FORMAT)),
        (
            "caveat",
            CAVEAT + (CAVEAT_URGENCY_USED if manifest.uses_urgency else CAVEAT_URGENCY_OMITTED),
        ),
    ]
    return record


# ---------------------------------------------------------------------------------------------
# Tables.
# ---------------------------------------------------------------------------------------------

COMPONENT_COLUMNS = tuple(c.value for c in Component)
NEED_PART_NAMES = (
    "permanent_classroom_deficit",
    "teacher_housing_deficit",
    "facility_presence_deficit",
    "service_deficit",
    "locality_disadvantage",
)


@dataclass(frozen=True)
class Table:
    columns: tuple[str, ...]
    rows: tuple[tuple[Cell, ...], ...]


def _identity_columns() -> tuple[str, ...]:
    return (
        "row_kind", "rule_id", "rule_label", "provenance", "policy_role", "score_kind",
        "input_version", "input_sha256", "anchors_sha256", "package_version",
        "school_id", "source_school_name", "province", "district", "locality", "latitude", "longitude",
        "cohort", "gate_failures", "missing_environmental",
    )  # fmt: skip


def _identity_values(kind: str, row: SchoolRow, manifest: ManifestOut, input_version: str) -> list[Cell]:
    i, r = row.identity, row.result
    components = r.components
    return [
        kind, manifest.rule_id, manifest.rule_label, manifest.provenance.value, manifest.policy_role.value,
        manifest.score_kind, input_version, manifest.input_sha256, manifest.anchors_sha256, manifest.package_version,
        None if i.school_id is None else str(i.school_id), i.source_school_name, i.province, i.district, i.locality,
        i.latitude, i.longitude, r.cohort.value, ";".join(f.value for f in r.gate_failures),
        ";".join(c for c in ("Q", "E", "L") if components[c] is None),
    ]  # fmt: skip


def top_table(selection: TopSelection, manifest: ManifestOut, input_version: str) -> Table:
    """Point rows, then range rows. Range rows carry bounds only: no point score and no point rank."""
    contribution_columns = tuple(
        f"contribution_{w.component.value}_{side}" for w in manifest.weights for side in ("lower", "upper")
    )
    has_need_parts = manifest.primary_sort_key is None
    has_maximum = bool(manifest.maximum_components)
    columns = (
        *_identity_columns(),
        *COMPONENT_COLUMNS,
        "sort_key_primary",
        *contribution_columns,
        *(f"need_part_contribution_{name}" for name in NEED_PART_NAMES if has_need_parts),
        *(("maximum_component", "maximum_attained_by", "maximum_term") if has_maximum else ()),
        "score_lower", "score_upper", "score_point",
        "rank_point", "rank_point_scope", "rank_best", "rank_worst", "rank_bounds_scope",
    )  # fmt: skip

    def values(kind: str, row: SchoolRow) -> tuple[Cell, ...]:
        r = row.result
        by_component = {c["component"]: c for c in r.contributions}
        cells = [*_identity_values(kind, row, manifest, input_version)]
        cells += [r.components[c] for c in COMPONENT_COLUMNS]
        cells.append(r.sort_key_primary)
        for w in manifest.weights:
            contribution = by_component.get(w.component.value)
            cells += [None, None] if contribution is None else [contribution["lower"], contribution["upper"]]
        if has_need_parts:
            cells += [
                None if r.need_part_contributions is None else r.need_part_contributions[name]
                for name in NEED_PART_NAMES
            ]
        if has_maximum:
            m = r.maximum_term
            cells += (
                [None, None, None]
                if m is None
                else [m["value"], ";".join(m["attained_by"]), m["contribution"]]
            )
        cells += [
            r.score_lower, r.score_upper, r.score_point,
            r.rank_point, r.rank_point_scope,
            r.rank_best, r.rank_worst, r.rank_bounds_scope,
        ]  # fmt: skip
        return tuple(cells)

    rows = [values("point", r) for r in selection.point_rows] + [
        values("range", r) for r in selection.range_rows
    ]
    return Table(columns, tuple(rows))


def missing_input_fields(record: SchoolRecord) -> tuple[str, ...]:
    """Names of the input-contract fields that are unknown for a school."""
    return tuple(f.name for f in INPUT_CONTRACT if getattr(record, f.name) is None)


def incomplete_table(
    rows: Sequence[SchoolRow], records: dict[str, SchoolRecord], manifest: ManifestOut, input_version: str
) -> Table:
    """The verification queue: why each school was held back and which inputs are unknown."""
    columns = (
        *_identity_columns(),
        "gate_failure_details",
        "missing_input_fields",
        *COMPONENT_COLUMNS,
        "rank_point_scope",
        "rank_bounds_scope",
    )
    body = []
    for row in rows:
        r = row.result
        body.append(
            (
                *_identity_values("queue", row, manifest, input_version),
                " ".join(GATE_FAILURE_DETAILS[f] for f in r.gate_failures),
                ";".join(missing_input_fields(records[row.name])),
                *(r.components[c] for c in COMPONENT_COLUMNS),
                r.rank_point_scope,
                r.rank_bounds_scope,
            )
        )
    return Table(columns, tuple(body))


# ---------------------------------------------------------------------------------------------
# Rendering.
# ---------------------------------------------------------------------------------------------


def _csv_cell(value: Cell) -> str | int | float:
    return "" if value is None else value


def render_csv(record: Sequence[tuple[str, str]], table: Table) -> bytes:
    """``#`` lines for the method record, then the header, then the rows. Floats print with their shortest exact repr."""
    buffer = io.StringIO()
    for key, value in record:
        buffer.write(f"# {key}: {' '.join(str(value).split())}\n")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(table.columns)
    for row in table.rows:
        writer.writerow([_csv_cell(v) for v in row])
    return buffer.getvalue().encode("utf-8")


_xlsx_lock = threading.Lock()


def _exact_number_text(value: Any) -> str:
    """openpyxl prints floats with 16 significant digits, which can change the last bit. repr is exact."""
    if isinstance(value, float) and math.isfinite(value):
        return repr(value)
    return _openpyxl_safe_string(value)


_openpyxl_safe_string = openpyxl_cell_writer.safe_string


def render_xlsx(record: Sequence[tuple[str, str]], data_sheet: str, table: Table) -> bytes:
    """A workbook with the sheet "Method record" first and the data second. Text is always stored as text."""
    workbook = Workbook()
    method = workbook.active
    method.title = "Method record"
    data = workbook.create_sheet(data_sheet)
    for sheet, rows in ((method, [("key", "value"), *record]), (data, [table.columns, *table.rows])):
        for r, values in enumerate(rows, start=1):
            for c, value in enumerate(values, start=1):
                cell = sheet.cell(row=r, column=c, value=value)
                if isinstance(value, str):
                    cell.data_type = "s"  # a name that starts with "=" must not become a formula
    method.column_dimensions["A"].width = 26
    method.column_dimensions["B"].width = 120
    data.freeze_panes = "A2"
    buffer = io.BytesIO()
    # The writer's number formatter is module state, so swap it only while this workbook is written.
    with _xlsx_lock:
        openpyxl_cell_writer.safe_string = _exact_number_text
        try:
            workbook.save(buffer)
        finally:
            openpyxl_cell_writer.safe_string = _openpyxl_safe_string
    return buffer.getvalue()
