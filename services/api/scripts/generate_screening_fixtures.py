"""Save the screening API's responses for invented schools as the web tests' fixtures.

    python services/api/scripts/generate_screening_fixtures.py \
        --database-url postgresql://postgres:local@localhost:55432/postgres

The script starts from the synthetic factories of the API tests, creates a throwaway database on the server
named by ``--database-url`` for each dataset below, applies every migration, loads invented records (and invented
persistence numbers) through the real ingestion function and calls the real application with a test client.
Each response it saves is exactly what the API sent, except for the volatile values listed in ``PINNED``,
which are replaced by fixed ones so that a rerun writes identical files. Each throwaway database is dropped
at the end.

Every dataset has its own directory under the output folder, and ``index.json`` in it lists every captured
request with its file and, when it is not 200, its status. The default dataset sits in the folder itself.
``apps/web/scripts/mock-api.mjs`` serves those and nothing else, so a web test can only see responses the API
really produced.

Nothing in the output comes from a real school, place or value: the records are invented here.
The server must be local, like the API's own database tests require.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import uuid
from collections.abc import Callable
from dataclasses import dataclass, replace
from pathlib import Path
from urllib.parse import quote

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo

REPO = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(REPO / "services" / "api"), str(REPO / "packages" / "school_scoring")]
sys.path.append(str(REPO / "services" / "api" / "tests"))

from app.ingestion.load_screening_inputs import read_persistence_source  # noqa: E402
from app.main import app  # noqa: E402
from app.screening_queries import school_key  # noqa: E402
from app.settings import get_settings  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from school_scoring.screening import RULES, GateFailure, SchoolRecord  # noqa: E402
from screening_db_factories import record, write_persistence_files  # noqa: E402
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

# What the web tests rely on in the default dataset, written down so a reviewer sees the shape of the data
# without reading the loop.
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

# Names and places that a layout has to survive. Each length is asserted where the data is checked.
NAME_72_WITH_DIACRITICS = "Écôle Intermédiaire Supérieure de la Vallée Ŝainte-Zoé des Hautes Terres"
NAME_59_NO_BREAK = ("Unbroken" * 8)[:59]
PROVINCE_33 = "Province of the Far Eastern Isles"
DISTRICT_70 = "District of the Upper Western Highlands and the Southern Lowlands, Bay"
# The engine refuses a name that is empty or only whitespace, so no stored school has a blank name.
# A zero-width space is the nearest a stored name can come: it passes every check and shows as nothing.
NAME_LOOKS_BLANK = "\u200b"
SPACED_PAIR = ("Spaced Name School", "Spaced  Name School")


def complete_record(i: int, name: str, **overrides) -> SchoolRecord:
    """A school with every input known. ``i`` varies the values so that the schools differ."""
    values = dict(
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
    return record(name, **{**values, **overrides})


def placed(
    records: list[SchoolRecord], overrides: dict[str, tuple[str, str]] | None = None
) -> tuple[SchoolRecord, ...]:
    """Give each record a province and district: the cycle of ``PLACES``, or the one named in ``overrides``."""
    result = []
    for i, r in enumerate(records):
        province, district, _, _ = PLACES[i % len(PLACES)]
        province, district = (overrides or {}).get(r.school_name, (province, district))
        result.append(replace(r, province=province, district=district))
    return tuple(result)


# ---------------------------------------------------------------------------------------------
# The datasets. Each one is a database of its own and a directory of its own.
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Dataset:
    name: str
    directory: str  # relative to the output folder; empty for the default dataset
    records: tuple[SchoolRecord, ...]
    # Lower top-20 frequencies of the invented experiment, by school name, in the order of the three settings.
    persistence: dict[str, tuple[float, float, float]]
    without_coordinates: tuple[str, ...] = ()
    # Schools whose detail is saved, besides the first, a range, a queued and an unlocated school of the list.
    details: tuple[str, ...] = ()
    # Claims about the data that a web test relies on; the generator refuses to write a dataset that breaks one.
    claims: tuple[tuple[str, Callable[[list[dict]], bool]], ...] = ()


def main_records() -> tuple[SchoolRecord, ...]:
    """Sixteen complete schools, five interval schools and four queued ones under the urgency-included additive rule."""
    complete = [complete_record(i, f"Sample School {i + 1:02d}") for i in range(COMPLETE)]
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
    return placed([*complete, *interval, *queued, exact_range])


def worst_names_records() -> tuple[SchoolRecord, ...]:
    ordinary = [complete_record(i, f"Worst Case {i + 1:02d}") for i in range(10)]
    odd = [
        complete_record(10, NAME_72_WITH_DIACRITICS),
        complete_record(11, NAME_59_NO_BREAK),
        complete_record(12, "Worst Case Long Place"),
        complete_record(13, NAME_LOOKS_BLANK),
        complete_record(14, "Worst Case Blank District"),
        complete_record(15, SPACED_PAIR[0]),
        complete_record(16, SPACED_PAIR[1]),
    ]
    return placed(
        [*ordinary, *odd],
        {
            "Worst Case Long Place": (PROVINCE_33, DISTRICT_70),
            NAME_LOOKS_BLANK: ("North Province", ""),
            "Worst Case Blank District": ("South Province", ""),
        },
    )


def ties_and_ranges_records() -> tuple[SchoolRecord, ...]:
    ranked = [complete_record(i, f"Ranked {i + 1:02d}") for i in range(12)]
    # Same inputs, so the same scores under every rule: the name alone decides their order.
    ties = [complete_record(7, name) for name in ("Tie Alpha", "Tie Bravo", "Tie Charlie")]
    ranges = [
        complete_record(3, "Range Air", aqi_p95_selected=None),
        complete_record(5, "Range Emissions", emissions_co2e_100yr_10km_tonnes=None),
        complete_record(8, "Range Land", water_flooded_vegetation_fraction_500m=None),
        complete_record(
            9,
            "Range All",
            aqi_p95_selected=None,
            emissions_co2e_100yr_10km_tonnes=None,
            water_flooded_vegetation_fraction_500m=None,
        ),
    ]
    # One school for each reason the engine can hold a school for verification.
    queued = [
        complete_record(2, "Queue Missing Stock", teachers=None),
        complete_record(4, "Queue Negative Stock", libraries=-1.0),
        complete_record(6, "Queue Zero Denominator", total_classrooms=0.0),
        complete_record(1, "Queue Service Coding", power_source="Candles"),
        complete_record(3, "Queue Locality", locality="Nowhere"),
        complete_record(5, "Queue Area Context", progression_g10_corrected_pct=None),
        complete_record(7, "Queue Reach", walking_catchment_population=None),
        complete_record(9, "Queue Urgency", urgency_source_scalar=None),
    ]
    return placed([*ranked, *ties, *ranges, *queued])


def one_record() -> tuple[SchoolRecord, ...]:
    return placed([complete_record(0, "Only School")])


def _name(row: dict) -> str:
    return row["school"]["source_school_name"]


def _has_72_character_name_with_diacritics(rows: list[dict]) -> bool:
    return any(len(_name(r)) == 72 and not _name(r).isascii() for r in rows)


def _has_59_character_name_with_no_break(rows: list[dict]) -> bool:
    return any(len(_name(r)) == 59 and not any(c.isspace() or c == "-" for c in _name(r)) for r in rows)


def _has_long_place(rows: list[dict]) -> bool:
    return any(
        len(r["school"]["district"] or "") == 70 and len(r["school"]["province"] or "") == 33 for r in rows
    )


def _has_name_that_looks_blank(rows: list[dict]) -> bool:
    return any(_name(r).strip("\u200b") == "" for r in rows)


def _has_blank_district(rows: list[dict]) -> bool:
    return any(r["school"]["district"] == "" for r in rows)


def _has_names_that_differ_only_by_spaces(rows: list[dict]) -> bool:
    names = [_name(r) for r in rows]
    return any(a != b and a.split() == b.split() for a in names for b in names)


def _has_three_way_tie(rows: list[dict]) -> bool:
    points = [r["scores"]["point"] for r in rows if r["cohort"] == "complete"]
    return any(points.count(p) >= 3 for p in points)


def _has_ranges_that_mix_scopes(rows: list[dict]) -> bool:
    """Range schools have no point rank, and their bounds count a different set of schools than a point rank does."""
    ranges = [r for r in rows if r["cohort"] == "interval"]
    return len(ranges) >= 3 and all(
        r["point_rank"]["rank"] is None
        and r["rank_bounds"]["best"] is not None
        and r["point_rank"]["scope_code"] != r["rank_bounds"]["scope_code"]
        and r["point_rank"]["scope"] != r["rank_bounds"]["scope"]
        for r in ranges
    )


def _has_every_queue_reason(rows: list[dict]) -> bool:
    return {f for r in rows for f in r["gate_failures"]} == {f.value for f in GateFailure}


def _is_one_complete_school(rows: list[dict]) -> bool:
    return len(rows) == 1 and rows[0]["cohort"] == "complete"


WORST_NAMES_CLAIMS = (
    ("a 72-character name with diacritics", _has_72_character_name_with_diacritics),
    ("a 59-character name with no break opportunity", _has_59_character_name_with_no_break),
    ("a 70-character district and a 33-character province", _has_long_place),
    ("a name that looks blank", _has_name_that_looks_blank),
    ("a blank district", _has_blank_district),
    ("two names that differ only by spaces", _has_names_that_differ_only_by_spaces),
)
TIES_CLAIMS = (
    ("three schools with exactly equal scores under the main rule", _has_three_way_tie),
    ("range schools whose bounds and point rank count different schools", _has_ranges_that_mix_scopes),
    ("a school for each reason the engine holds one for verification", _has_every_queue_reason),
)
ONE_CLAIMS = (("exactly one complete school", _is_one_complete_school),)


def datasets() -> tuple[Dataset, ...]:
    return (
        Dataset(
            name="main",
            directory="",
            records=main_records(),
            # Sample School 01, 02 and 06 are persistent: 01 well above the line, 02 exactly on it and 06 0.0014 above
            # it, both within one standard error. 03 is one setting short, 04 is far below, and 17 shows that a
            # range school can be in the experiment too.
            persistence={
                "Sample School 01": (0.99, 0.97, 1.0),
                "Sample School 02": (0.8, 0.8, 0.8),
                "Sample School 03": (0.9, 0.7999, 0.95),
                "Sample School 04": (0.2, 0.3, 0.4),
                "Sample School 06": (0.8014, 0.9, 0.95),
                "Sample School 17": (0.1, 0.1, 0.2),
            },
            without_coordinates=WITHOUT_COORDINATES,
        ),
        Dataset(
            name="worst-names",
            directory="worst-names",
            records=worst_names_records(),
            persistence={NAME_72_WITH_DIACRITICS: (0.95, 0.96, 0.99), "Worst Case 01": (0.5, 0.5, 0.5)},
            # Two names that differ only by spaces cannot be told apart by the school table, so neither is located.
            without_coordinates=SPACED_PAIR,
            details=(NAME_72_WITH_DIACRITICS, NAME_59_NO_BREAK, NAME_LOOKS_BLANK, *SPACED_PAIR),
            claims=WORST_NAMES_CLAIMS,
        ),
        Dataset(
            name="ties-and-ranges",
            directory="ties-and-ranges",
            records=ties_and_ranges_records(),
            persistence={"Ranked 01": (1.0, 1.0, 1.0), "Range Air": (0.3, 0.4, 0.5)},
            details=("Tie Alpha", "Range All", "Queue Reach"),
            claims=TIES_CLAIMS,
        ),
        Dataset(
            name="one",
            directory="one",
            records=one_record(),
            persistence={"Only School": (1.0, 1.0, 1.0)},
            claims=ONE_CLAIMS,
        ),
        # No input version is loaded: the rules list is there, every read of results or inputs is a 404.
        Dataset(name="empty", directory="empty", records=(), persistence={}),
    )


# ---------------------------------------------------------------------------------------------
# Building a dataset's database.
# ---------------------------------------------------------------------------------------------


def position(index: int) -> tuple[float, float]:
    """Latitude and longitude of the invented school at ``index``: its place's centre plus a fixed offset."""
    _, _, lat, lon = PLACES[index % len(PLACES)]
    return lat + 0.45 * (((index * 37) % 11) / 10 - 0.5), lon + 0.45 * (((index * 53) % 13) / 12 - 0.5)


def add_schools(connection: psycopg.Connection, ds: Dataset) -> None:
    """One ``schools`` row per record, except those without coordinates, so the ingestion links the rest."""
    for i, r in enumerate(ds.records):
        if r.school_name in ds.without_coordinates:
            continue
        lat, lon = position(i)
        connection.execute(
            "insert into schools (school_name, province, district, latitude, longitude, geom) "
            "values (%s, %s, %s, %s, %s, st_setsrid(st_makepoint(%s, %s), 4326))",
            (r.school_name, r.province, r.district, lat, lon, lon, lat),
        )


def create_database(admin: psycopg.Connection, url: str, ds: Dataset) -> str:
    name = f"rise_screening_fixtures_{uuid.uuid4().hex[:8]}"
    admin.execute(BOOTSTRAP_ROLES)
    admin.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
    with psycopg.connect(make_conninfo(url, dbname=name), autocommit=True) as connection:
        apply_migrations(connection)
        if not ds.records:
            return name
        add_schools(connection, ds)
        with tempfile.TemporaryDirectory() as folder:
            relative = write_persistence_files(Path(folder), ds.persistence)
            load(connection, ds.records, VERSION, read_persistence_source(Path(folder), relative))
    return name


# ---------------------------------------------------------------------------------------------
# Capturing the responses.
# ---------------------------------------------------------------------------------------------


class Capture:
    """Calls the real application and remembers each request with the exact body it answered."""

    def __init__(self, client: TestClient):
        self.client = client
        self.entries: list[dict] = []
        self.bodies: dict[str, str] = {}

    def get(self, path: str, file: str, status: int = 200, **params: str) -> dict:
        """``path`` is written as the API defines it; a school key goes in percent-encoded by the caller."""
        response = self.client.get(path, params=params)
        if response.status_code != status:
            raise SystemExit(
                f"{path} {params} answered {response.status_code}, not {status}: {response.text[:300]}"
            )
        entry = {"path": path, "query": dict(sorted(params.items())), "file": file}
        if status != 200:
            entry["status"] = status
        self.entries.append(entry)
        self.bodies[file] = response.text
        return response.json()


def school_detail_file(cap: Capture, name: str) -> None:
    encoded = quote(school_key(VERSION, name), safe="")
    cap.get(f"{API}/schools/by-key/{encoded}", f"schools/{encoded}.json")


def capture_all(client: TestClient, ds: Dataset) -> tuple[Capture, list[dict]]:
    """Every request the web tests may make for this dataset. Returns the capture and the circulated rule's rows."""
    cap = Capture(client)
    cap.get(f"{API}/rules", "rules.json")
    if not ds.records:
        cap.get(f"{API}/results", "results/additive_u.json", status=404, rule="additive_u")
        cap.get(f"{API}/inputs", "inputs.json", status=404)
        return cap, []
    rows_by_rule = {}
    for rule_id in RULES:
        rows_by_rule[rule_id] = cap.get(f"{API}/results", f"results/{rule_id}.json", rule=rule_id)["rows"]
    for rule_id in MAIN_RULES:
        cap.get(f"{API}/results", f"results/{rule_id}.upper.json", rule=rule_id, placement="upper")
    cap.get(f"{API}/inputs", "inputs.json")
    cap.get(f"{API}/inputs", "inputs.pinned.json", input_version=VERSION)
    default_rows = rows_by_rule["additive_u"]

    # School detail for the first listed school, one range school, one queued school and one without coordinates,
    # where the dataset has them, then the schools the dataset names.
    wanted = [default_rows[0]]
    for pick in (
        lambda r: r["cohort"] == "interval",
        lambda r: r["cohort"] == "verification_queue",
        lambda r: r["school"]["latitude"] is None and r["cohort"] == "complete",
    ):
        found = next((r for r in default_rows if pick(r)), None)
        if found is not None and found not in wanted:
            wanted.append(found)
    names = [r["school"]["source_school_name"] for r in wanted] + [n for n in ds.details]
    for name in dict.fromkeys(names):
        school_detail_file(cap, name)
    if sum(r["cohort"] == "complete" for r in default_rows) >= 2:
        cap.get(f"{API}/compare", "compare/additive_u__additive_no_u.json", a="additive_u", b="additive_no_u")
    return cap, default_rows


def check_claims(ds: Dataset, rows: list[dict]) -> None:
    broken = [claim for claim, holds in ds.claims if not holds(rows)]
    if broken:
        raise SystemExit(f"dataset {ds.name!r} no longer has: " + "; ".join(broken))


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


def write(out: Path, ds: Dataset, cap: Capture) -> None:
    for file, body in pin(cap.bodies).items():
        path = out / file
        path.parent.mkdir(parents=True, exist_ok=True)
        # Parse and write back with sorted keys: the content is the API's, the bytes are stable.
        path.write_text(
            json.dumps(json.loads(body), sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    index = {
        "dataset": ds.name,
        "pinned": PINNED,
        "input_version": VERSION if ds.records else None,
        "requests": cap.entries,
    }
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
        for ds in datasets():
            name = create_database(admin, url, ds)
            try:
                os.environ["DATABASE_URL"] = make_conninfo(url, dbname=name)
                os.environ["SUPABASE_URL"] = "https://example.supabase.co"
                os.environ.pop("AUTH_REQUIRED", None)
                get_settings.cache_clear()
                with TestClient(app) as client:
                    cap, rows = capture_all(client, ds)
                check_claims(ds, rows)
                write(args.out / ds.directory, ds, cap)
            finally:
                admin.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name)))
                get_settings.cache_clear()
            print(f"{ds.name}: wrote {len(cap.bodies)} responses to {args.out / ds.directory}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
