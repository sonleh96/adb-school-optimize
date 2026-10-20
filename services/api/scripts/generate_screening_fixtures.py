"""Save the screening API's responses for invented schools as the web tests' fixtures.

    python services/api/scripts/generate_screening_fixtures.py \
        --database-url postgresql://postgres:local@localhost:55432/postgres

The script starts from the synthetic factories of the API tests, creates a throwaway database on the server
named by ``--database-url``, applies every migration, loads invented records through the real ingestion
function and calls the real application with a test client. Each response it saves is exactly what the API
sent, except for the volatile values listed in ``PINNED``, which are replaced by fixed ones so that a rerun
writes identical files. The throwaway database is dropped at the end.

``index.json`` lists every captured request with its file. ``apps/web/scripts/mock-api.mjs`` serves those and
nothing else, so a web test can only see responses the API really produced.

Nothing in the output comes from a real school, place or value: the records are invented here.
The server must be local, like the API's own database tests require.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from dataclasses import replace
from pathlib import Path
from urllib.parse import quote

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo

REPO = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(REPO / "services" / "api"), str(REPO / "packages" / "school_scoring")]
sys.path.append(str(REPO / "services" / "api" / "tests"))

from app.main import app  # noqa: E402
from app.settings import get_settings  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from school_scoring.screening import RULES, SchoolRecord  # noqa: E402
from screening_db_factories import record  # noqa: E402
from screening_db_helpers import (  # noqa: E402
    DatabaseTestsUnavailable,
    apply_migrations,
    load,
    server_url,
)

DEFAULT_OUT = REPO / "apps" / "web" / "e2e" / "fixtures" / "screening"
VERSION = "synthetic-fixture-v1"
API = "/api/v1/screening"
MAIN_RULES = ("additive_u", "additive_no_u")

# What the web tests rely on, written down so a reviewer sees the shape of the data without reading the loop.
COMPLETE, INTERVAL, QUEUED = 16, 5, 4
# Names without a ``schools`` row, so their coordinates are unknown: one complete school and one queued school.
WITHOUT_COORDINATES = ("Sample School 05", "Sample School 22")

# Roles that a plain PostGIS server lacks and the lockdown migration refers to (Supabase provides them).
BOOTSTRAP_ROLES = """
do $$
begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end
$$
"""

# Replaced after capture, because the database or the clock chooses them and they would change on every run.
PINNED = "uuids (run ids, school ids) and timestamps"
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
TIMESTAMP = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+00:00)")
FIXED_TIMESTAMP = "2026-01-01T00:00:00Z"

PLACES = (
    ("North Province", "North One", -5.6, 145.2),
    ("North Province", "North Two", -5.4, 146.4),
    ("South Province", "South One", -7.4, 146.2),
    ("South Province", "South Two", -7.0, 144.8),
    ("East Province", "East One", -6.2, 147.6),
)
LOCALITIES = ("Accessible", "Remote", "Very remote", "Highly accessible", "Moderately accessible")


def invented_records() -> tuple[SchoolRecord, ...]:
    """Sixteen complete schools, five interval schools and four queued ones under the urgency-included additive rule."""
    complete = [
        record(
            f"Sample School {i + 1:02d}",
            locality=LOCALITIES[i % len(LOCALITIES)],
            permanent_classrooms=float(i % 7),
            teacher_houses=float(i % 5),
            libraries=float(i % 2),
            workshops=float(i % 3 == 0),
            computer_labs=float(i % 4 == 1),
            secondary_students_per_1000=40.0 + 13 * i,
            conflict_population_exposure=float(i % 4) / 10,
            progression_g10_corrected_pct=50.0 + (i * 7) % 40,
            progression_g12_corrected_pct=10.0 + (i * 11) % 30,
            walking_catchment_population=100.0 * (i + 1),
            aqi_p95_selected=20.0 + 9 * i,
            emissions_co2e_100yr_10km_tonnes=float(i * i * 10),
            water_flooded_vegetation_fraction_500m=round(0.05 * i, 2),
            urgency_source_scalar=round(0.05 * ((i * 5) % 16), 2),
        )
        for i in range(COMPLETE)
    ]
    interval = [
        record("Sample School 17", aqi_p95_selected=None, permanent_classrooms=1.0),
        record("Sample School 18", water_flooded_vegetation_fraction_500m=None, permanent_classrooms=2.0),
        record("Sample School 19", emissions_co2e_100yr_10km_tonnes=None, permanent_classrooms=3.0),
        record("Café Sample 20", aqi_p95_selected=None, emissions_co2e_100yr_10km_tonnes=None),
    ]
    queued = [
        record("Sample School 21", teachers=None),
        record("Sample School 22", locality="Nowhere"),
        record("Sample School 23", urgency_source_scalar=None),
        # Nothing in this record feeds a normalization anchor, so it changes no other school's score.
        record(
            "Sample School 24",
            teachers=None,
            secondary_students_per_1000=None,
            district_luminosity_area_integral=None,
            conflict_population_exposure=None,
            urgency_source_scalar=None,
            walking_catchment_population=None,
            aqi_p95_selected=None,
            emissions_co2e_100yr_10km_tonnes=None,
            water_flooded_vegetation_fraction_500m=None,
        ),
    ]
    # Last, so that adding it moves no other school's place. Its record is so little in need that even with the
    # worst possible air-quality reading it stays below every other school: its best and worst place are the same.
    exact_range = record(
        "Sample School 25",
        aqi_p95_selected=None,
        locality="Highly accessible",
        permanent_classrooms=8.0,
        teacher_houses=10.0,
        libraries=1.0,
        workshops=1.0,
        practical_skills_buildings=1.0,
        home_economics_buildings=1.0,
        computer_labs=1.0,
        specialized_classrooms=1.0,
        power_source="Grid",
        water_source="Piped",
        secondary_students_per_1000=900.0,
        progression_g10_corrected_pct=100.0,
        progression_g12_corrected_pct=100.0,
        walking_catchment_population=1e6,
        emissions_co2e_100yr_10km_tonnes=0.0,
        water_flooded_vegetation_fraction_500m=0.0,
        urgency_source_scalar=0.0,
    )
    placed = []
    for i, r in enumerate([*complete, *interval, *queued, exact_range]):
        province, district, _, _ = PLACES[i % len(PLACES)]
        placed.append(replace(r, province=province, district=district))
    return tuple(placed)


def position(index: int) -> tuple[float, float]:
    """Latitude and longitude of the invented school at ``index``: its place's centre plus a fixed offset."""
    _, _, lat, lon = PLACES[index % len(PLACES)]
    return lat + 0.45 * (((index * 37) % 11) / 10 - 0.5), lon + 0.45 * (((index * 53) % 13) / 12 - 0.5)


def add_schools(connection: psycopg.Connection, records: tuple[SchoolRecord, ...]) -> None:
    """One ``schools`` row per record, except those without coordinates, so the ingestion links the rest."""
    for i, r in enumerate(records):
        if r.school_name in WITHOUT_COORDINATES:
            continue
        lat, lon = position(i)
        connection.execute(
            "insert into schools (school_name, province, district, latitude, longitude, geom) "
            "values (%s, %s, %s, %s, %s, st_setsrid(st_makepoint(%s, %s), 4326))",
            (r.school_name, r.province, r.district, lat, lon, lon, lat),
        )


def create_database(admin: psycopg.Connection, url: str) -> str:
    name = f"rise_screening_fixtures_{uuid.uuid4().hex[:8]}"
    admin.execute(BOOTSTRAP_ROLES)
    admin.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
    with psycopg.connect(make_conninfo(url, dbname=name), autocommit=True) as connection:
        apply_migrations(connection)
        records = invented_records()
        add_schools(connection, records)
        load(connection, records, VERSION)
    return name


class Capture:
    """Calls the real application and remembers each request with the exact body it answered."""

    def __init__(self, client: TestClient):
        self.client = client
        self.entries: list[dict] = []
        self.bodies: dict[str, str] = {}

    def get(self, path: str, file: str, **params: str) -> dict:
        """``path`` is written as the API defines it; a school key goes in percent-encoded by the caller."""
        response = self.client.get(path, params=params)
        if response.status_code != 200:
            raise SystemExit(f"{path} {params} answered {response.status_code}: {response.text[:300]}")
        self.entries.append({"path": path, "query": dict(sorted(params.items())), "file": file})
        self.bodies[file] = response.text
        return response.json()


def capture_all(client: TestClient) -> Capture:
    cap = Capture(client)
    cap.get(f"{API}/rules", "rules.json")
    rows_by_rule = {}
    for rule_id in RULES:
        rows_by_rule[rule_id] = cap.get(f"{API}/results", f"results/{rule_id}.json", rule=rule_id)["rows"]
    for rule_id in MAIN_RULES:
        cap.get(f"{API}/results", f"results/{rule_id}.upper.json", rule=rule_id, placement="upper")
    # School detail for the first listed school, one range school, one queued school and one without coordinates.
    default_rows = rows_by_rule["additive_u"]
    wanted = {
        "first": default_rows[0],
        "range": next(r for r in default_rows if r["cohort"] == "interval"),
        "queued": next(r for r in default_rows if r["cohort"] == "verification_queue"),
        "no_coordinates": next(
            r for r in default_rows if r["school"]["latitude"] is None and r["cohort"] == "complete"
        ),
    }
    for row in wanted.values():
        key = row["school"]["school_key"]
        encoded = quote(key, safe="")
        cap.get(f"{API}/schools/by-key/{encoded}", f"schools/{encoded}.json")
    cap.get(f"{API}/compare", "compare/additive_u__additive_no_u.json", a="additive_u", b="additive_no_u")
    return cap


def pin(bodies: dict[str, str]) -> dict[str, str]:
    """Replace uuids and timestamps by fixed values, in the order the files are written, so a rerun is identical."""
    mapping: dict[str, str] = {}
    for file in sorted(bodies):
        for found in UUID.findall(bodies[file]):
            mapping.setdefault(
                found, str(uuid.uuid5(uuid.NAMESPACE_URL, f"rise-screening-fixture/{len(mapping)}"))
            )
    pinned = {}
    for file, body in bodies.items():
        body = UUID.sub(lambda m: mapping[m.group(0)], body)
        pinned[file] = TIMESTAMP.sub(FIXED_TIMESTAMP, body)
    return pinned


def write(out: Path, cap: Capture) -> None:
    for file, body in pin(cap.bodies).items():
        path = out / file
        path.parent.mkdir(parents=True, exist_ok=True)
        # Parse and write back with sorted keys: the content is the API's, the bytes are stable.
        path.write_text(
            json.dumps(json.loads(body), sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    index = {"pinned": PINNED, "input_version": VERSION, "requests": cap.entries}
    (out / "index.json").write_text(json.dumps(index, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--database-url", default=os.environ.get("DATABASE_URL"), help="A local PostGIS server."
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    try:
        url = server_url({"DATABASE_URL": args.database_url} if args.database_url else {})
    except DatabaseTestsUnavailable as error:
        print(f"refused: {error}", file=sys.stderr)
        return 2

    with psycopg.connect(url, autocommit=True) as admin:
        name = create_database(admin, url)
        try:
            os.environ["DATABASE_URL"] = make_conninfo(url, dbname=name)
            os.environ["SUPABASE_URL"] = "https://example.supabase.co"
            os.environ.pop("AUTH_REQUIRED", None)
            get_settings.cache_clear()
            with TestClient(app) as client:
                cap = capture_all(client)
            write(args.out, cap)
        finally:
            admin.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name)))
            get_settings.cache_clear()
    print(f"wrote {len(cap.bodies)} responses to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
