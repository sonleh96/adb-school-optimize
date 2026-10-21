"""Invented data and parsing helpers for the screening API tests. No real school, place or value appears here."""

from __future__ import annotations

import csv
import io
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, replace

import psycopg
from app.ingestion.load_screening_inputs import PersistenceSource
from school_scoring.screening import SchoolRecord, ScreeningRun, prepare, screen_all
from screening_db_factories import AWKWARD_NAMES, mixed_records, record
from screening_db_helpers import VERSION, load

# (province, district) of each invented school. Chosen so that the queue order by province, district and name
# differs from the order by name alone.
PLACES = {
    AWKWARD_NAMES[0]: ("North", "North One"),
    AWKWARD_NAMES[1]: ("North", "North One"),
    AWKWARD_NAMES[2]: ("North", "North One"),
    AWKWARD_NAMES[3]: ("North", "North Two"),
    AWKWARD_NAMES[4]: ("North", "North Two"),
    AWKWARD_NAMES[5]: ("South", "South One"),
    AWKWARD_NAMES[6]: ("South", "South One"),
    AWKWARD_NAMES[7]: ("South", "South Two"),
    AWKWARD_NAMES[8]: ("South", "South Two"),
    "Interval No Air": ("North", "North One"),
    "Interval No Land": ("South", "South One"),
    "Zed queue": ("North", "North Two"),
    "alpha queue": ("North", "North Two"),
    "Éclair queue": ("North", "North One"),
    "Beta queue": ("South", "South One"),
}


def api_records() -> tuple[SchoolRecord, ...]:
    """Nine complete schools, two interval schools and four queued ones, under the urgency-included additive rule.

    Under the urgency-omitted rules "Éclair queue" is complete, because only its urgency is unknown.
    """
    # "Beta queue" has no value that feeds a normalization anchor, so it changes no score of the other schools.
    beta = record(
        "Beta queue",
        teachers=None,
        secondary_students_per_1000=None,
        district_luminosity_area_integral=None,
        conflict_population_exposure=None,
        urgency_source_scalar=None,
        walking_catchment_population=None,
        aqi_p95_selected=None,
        emissions_co2e_100yr_10km_tonnes=None,
        water_flooded_vegetation_fraction_500m=None,
    )
    placed = (*mixed_records(), beta)
    return tuple(
        replace(r, province=PLACES[r.school_name][0], district=PLACES[r.school_name][1]) for r in placed
    )


def add_schools(connection: psycopg.Connection, records: tuple[SchoolRecord, ...]) -> dict[str, uuid.UUID]:
    """One ``schools`` row per record, at a distinct invented position, so the ingestion links every name."""
    ids = {}
    for i, r in enumerate(records):
        latitude, longitude = -6.0 - 0.1 * i, 147.0 + 0.05 * i
        ids[r.school_name] = connection.execute(
            "insert into schools (school_name, province, district, latitude, longitude, geom) "
            "values (%s, %s, %s, %s, %s, st_setsrid(st_makepoint(%s, %s), 4326)) returning school_id",
            (r.school_name, r.province, r.district, latitude, longitude, longitude, latitude),
        ).fetchone()[0]
    return ids


@dataclass(frozen=True)
class Loaded:
    records: tuple[SchoolRecord, ...]
    runs: dict[str, ScreeningRun]
    school_ids: dict[str, uuid.UUID]
    input_version: str


def load_synthetic(
    connection: psycopg.Connection,
    records: tuple[SchoolRecord, ...] | None = None,
    version: str = VERSION,
    persistence: Sequence[PersistenceSource] = (),
) -> Loaded:
    """Store schools, then load the records through the ingestion function. ``runs`` is the engine's own output."""
    records = records or api_records()
    ids = add_schools(connection, records)
    load(connection, records, version, persistence)
    return Loaded(records, screen_all(prepare(records)), ids, version)


def parse_csv_export(content: bytes) -> tuple[dict[str, str], list[dict[str, str]]]:
    """Split an export into its method record and its data rows, as a reader of the documented format would.

    Decode with a byte order mark, parse as CSV, take the leading one-cell rows that start with ``# `` as the record.
    Names are returned exactly as written.
    """
    parsed = list(csv.reader(io.StringIO(content.decode("utf-8-sig"), newline="")))
    method = {}
    position = 0
    while len(parsed[position]) == 1 and parsed[position][0].startswith("# "):
        key, value = parsed[position][0][2:].split(": ", 1)
        method[key] = value
        position += 1
    header = parsed[position]
    return method, [dict(zip(header, row, strict=True)) for row in parsed[position + 1 :]]
