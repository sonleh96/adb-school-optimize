"""Invented screening inputs for the database tests. No real school, place or value appears here."""

from __future__ import annotations

import csv
import json
from dataclasses import replace
from pathlib import Path

import pandas as pd
from app.ingestion.load_screening_inputs import SOURCE_FILES
from school_scoring.screening import INPUT_CONTRACT, SchoolRecord, assemble_frame, parse_records

BASE = SchoolRecord(
    school_name="Base",
    province="Province One",
    district="District One",
    locality="Remote",
    permanent_classrooms=6.0,
    total_classrooms=8.0,
    teachers=10.0,
    teacher_houses=5.0,
    libraries=1.0,
    workshops=0.0,
    practical_skills_buildings=0.0,
    home_economics_buildings=0.0,
    computer_labs=1.0,
    specialized_classrooms=1.0,
    power_source="Generator",
    water_source="Tank Water",
    secondary_students_per_1000=100.0,
    female_students_g7_12=200.0,
    total_enrollment_g7_12=500.0,
    conflict_population_exposure=0.0,
    progression_g10_corrected_pct=80.0,
    progression_g12_corrected_pct=20.0,
    district_luminosity_area_integral=1000.0,
    urgency_source_scalar=0.2,
    walking_catchment_population=1000.0,
    aqi_p95_selected=30.0,
    emissions_co2e_100yr_10km_tonnes=0.0,
    water_flooded_vegetation_fraction_500m=0.1,
)


def record(name: str, **overrides) -> SchoolRecord:
    return replace(BASE, school_name=name, **overrides)


# Names chosen to be mangled by trimming, case folding, Unicode normalization or locale-aware sorting.
AWKWARD_NAMES = (
    " Leading Space School",
    "Trailing Space School ",
    "UPPER Case School",
    "Double  Space School",
    "Café School",  # decomposed accent
    "Café School",  # composed accent
    "Tab\tName School",
    'Quote\'d "Name" School',
    "Line\nBreak School",
)


def mixed_records() -> tuple[SchoolRecord, ...]:
    """Fourteen records with known cohorts under the urgency-included additive rule.

    9 complete (the awkward names), 2 interval (no AQI, no land cover), 3 queued
    (a missing stock field, an unrecognized locality, an unknown urgency).
    Without urgency the unknown-urgency school is complete: 10 complete, 2 interval, 2 queued.
    """
    complete = [
        record(
            name,
            permanent_classrooms=float(i % 7),
            teacher_houses=float(i % 5),
            secondary_students_per_1000=40.0 + 13 * i,
            walking_catchment_population=100.0 * (i + 1),
            aqi_p95_selected=20.0 + 9 * i,
            emissions_co2e_100yr_10km_tonnes=float(i * i * 10),
            water_flooded_vegetation_fraction_500m=round(0.05 * i, 2),
            urgency_source_scalar=0.05 * i,
        )
        for i, name in enumerate(AWKWARD_NAMES)
    ]
    return (
        *complete,
        record("Interval No Air", aqi_p95_selected=None, permanent_classrooms=1.0),
        record("Interval No Land", water_flooded_vegetation_fraction_500m=None, permanent_classrooms=2.0),
        record("Zed queue", teachers=None),
        record("alpha queue", locality="Nowhere"),
        record("Éclair queue", urgency_source_scalar=None),
    )


def awkward_number_records() -> tuple[SchoolRecord, ...]:
    """Values that survive a text round trip only if nothing is rounded: float noise, a denormal, the largest double, negative zero."""
    return (
        *mixed_records(),
        record("Noise", conflict_population_exposure=0.1 + 0.2, secondary_students_per_1000=1 / 3),
        record(
            "Extremes", emissions_co2e_100yr_10km_tonnes=1.7976931348623157e308, urgency_source_scalar=5e-324
        ),
        record("Negative Zero", teacher_houses=-0.0, libraries=123456789.12345678),
    )


def source_tables(records: tuple[SchoolRecord, ...]):
    """Split records into the study's three source tables under their original column names."""
    frame = pd.DataFrame([{f.name: getattr(r, f.name) for f in INPUT_CONTRACT} for r in records])
    tables: dict = {}
    for table, _, _ in SOURCE_FILES:
        tables[table] = {"School Name": frame["school_name"].tolist()}
    for field in INPUT_CONTRACT:
        tables[field.source_table][field.source_column] = frame[field.name].tolist()
    return {table: pd.DataFrame(columns) for table, columns in tables.items()}


def write_source_files(
    records: tuple[SchoolRecord, ...], reference_root: Path, datasets_root: Path
) -> dict[str, Path]:
    """Write the records where the command expects the study's tables. Returns the paths by table value."""
    roots = {"reference": reference_root, "datasets": datasets_root}
    paths = {}
    for table, frame in source_tables(records).items():
        root, relative = next((r, p) for t, r, p in SOURCE_FILES if t is table)
        path = roots[root] / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        frame.to_csv(path, index=False)
        paths[table.value] = path
    return paths


def read_back(paths: dict[str, Path]) -> tuple[SchoolRecord, ...]:
    """What the command will parse from the written files: the oracle for the end-to-end test."""
    frames = {
        table: pd.read_csv(paths[table.value], float_precision="round_trip") for table, _, _ in SOURCE_FILES
    }
    return parse_records(assemble_frame(frames))


# ---------------------------------------------------------------------------------------------
# Invented persistence files, in the layout of the recorded experiment.
# ---------------------------------------------------------------------------------------------

EXPERIMENT = "EXP-99-v0.0.0-20000101"
PERSISTENCE_PATH = f"experiments/decision_rules/{EXPERIMENT}/results/persistent_investigation_candidates.csv"
SETTINGS = (
    ("concentration_20_15", 20, 15),
    ("concentration_40_35", 40, 35),
    ("concentration_100_80", 100, 80),
)
DRAWS = 5000


def write_persistence_files(
    reference_root: Path,
    frequencies: dict[str, tuple[float, float, float]],
    *,
    flags: dict[str, bool] | None = None,
    receipt_count: int | None = None,
    receipt_names: list[str] | None = None,
    threshold: float = 0.8,
) -> str:
    """Write a persistence table and its receipt under ``reference_root``. Returns the path relative to the root.

    The flag column is derived from the frequencies unless ``flags`` overrides a school's value.
    ``receipt_count`` defaults to the number of flagged schools, and ``receipt_names`` to their names as the file spells them.
    """
    path = reference_root / PERSISTENCE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    flagged = {name: all(f >= threshold for f in freqs) for name, freqs in frequencies.items()}
    flagged.update(flags or {})
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["School Name", *(s[0] for s in SETTINGS), "persistent_at_0_80_all_settings"])
        for name, freqs in frequencies.items():
            writer.writerow([name, *freqs, flagged[name]])
    receipt = {
        "concentration_settings": [
            {
                "setting_id": sid,
                "top_level_concentration": top,
                "school_need_concentration": need,
                "draws": DRAWS,
            }
            for sid, top, need in SETTINGS
        ],
        "persistent_investigation_candidates": [
            n for n, f in frequencies.items() if f and all(x >= threshold for x in f)
        ]
        if receipt_names is None
        else receipt_names,
        "persistent_investigation_count_at_0_80_all_settings": sum(
            all(f >= threshold for f in freqs) for freqs in frequencies.values()
        )
        if receipt_count is None
        else receipt_count,
    }
    (path.parent / "run_receipt.json").write_text(json.dumps(receipt), encoding="utf-8")
    return PERSISTENCE_PATH
