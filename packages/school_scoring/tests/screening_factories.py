"""Builders for small synthetic screening inputs. Names and values are invented."""

from __future__ import annotations

import dataclasses
import math
import random
from dataclasses import replace

import pandas as pd
from school_scoring.screening import INPUT_CONTRACT, SchoolRecord, Table

BASELINE = SchoolRecord(
    school_name="Baseline School",
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
    urgency_source_scalar=0.0,
    walking_catchment_population=1000.0,
    aqi_p95_selected=30.0,
    emissions_co2e_100yr_10km_tonnes=0.0,
    water_flooded_vegetation_fraction_500m=0.1,
)


def record(name: str = "Baseline School", **overrides) -> SchoolRecord:
    return replace(BASELINE, school_name=name, **overrides)


def ladder(field: str, value=lambda i: float(i), count: int = 21, **shared) -> tuple[SchoolRecord, ...]:
    """Records S00..S20 whose ``field`` takes ``value(i)``. With 21 values 0..20 the p05 and p95 anchors are 1 and 19."""
    return tuple(record(f"S{i:02d}", **{field: value(i)}, **shared) for i in range(count))


def expm1_ladder(field: str, **shared) -> tuple[SchoolRecord, ...]:
    """Raw values whose log1p is 0..20, for log-transformed fields."""
    return ladder(field, lambda i: math.expm1(i), **shared)


def source_tables(frame: pd.DataFrame) -> dict[Table, pd.DataFrame]:
    """Split a canonical frame into the three source tables, under their original column names."""
    tables: dict[Table, dict[str, list]] = {t: {"School Name": frame["school_name"].tolist()} for t in Table}
    for field in INPUT_CONTRACT:
        tables[field.source_table][field.source_column] = frame[field.name].tolist()
    return {t: pd.DataFrame(columns) for t, columns in tables.items()}


def random_records(count: int = 40, seed: int = 0) -> tuple[SchoolRecord, ...]:
    """Mixed synthetic records: queue schools, missing AQI, missing land, repeated values and exact duplicates."""
    rng = random.Random(seed)
    records = []
    for i in range(count):
        records.append(
            record(
                f"School {i:03d}",
                permanent_classrooms=float(rng.randint(0, 8)),
                teacher_houses=float(rng.randint(0, 10)),
                teachers=None if rng.random() < 0.1 else 10.0,
                walking_catchment_population=float(rng.choice([0, 10, 100, 1000, 1e5])),
                urgency_source_scalar=float(rng.choice([0.0, 0.01, 0.05, 0.3, 0.7])),
                aqi_p95_selected=None if rng.random() < 0.15 else float(rng.randint(20, 150)),
                emissions_co2e_100yr_10km_tonnes=float(rng.choice([0, 5, 50, 5000])),
                water_flooded_vegetation_fraction_500m=rng.choice([0.0, 0.1, 0.5, None]),
                locality=rng.choice(["Remote", "Accessible", "Very Remote"]),
                secondary_students_per_1000=float(rng.randint(5, 200)),
                conflict_population_exposure=float(rng.choice([0, 10, 1000])),
            )
        )
    # exact duplicates under other names, so that equal scores and equal need exist
    records += [dataclasses.replace(records[i], school_name=f"Copy {i:03d}") for i in range(0, count, 7)]
    return tuple(records)


def frame_of_records(records) -> pd.DataFrame:
    return pd.DataFrame([dataclasses.asdict(r) for r in records])
