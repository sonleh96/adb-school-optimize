"""Input contract of the screening engine and the boundary that parses it.

``INPUT_CONTRACT`` is the single description of every field the engine reads:
its meaning, unit and the source table and column it comes from in the study.
``SchoolRecord`` is the parsed, typed form.
Everything past ``parse_records`` trusts those types.
"""

from __future__ import annotations

import hashlib
import json
import math
import numbers
from collections.abc import Mapping
from dataclasses import asdict, dataclass, fields
from enum import Enum
from typing import Any

import pandas as pd

from ..exceptions import SchoolScoringError


class InputContractError(SchoolScoringError, ValueError):
    """Raised when supplied data does not satisfy the input contract."""


class FieldKind(str, Enum):
    IDENTITY = "identity"
    RAW = "raw"
    PREPARED = "prepared"


class Table(str, Enum):
    """Source tables of the frozen study, named by role."""

    RAW_SCHOOLS = "datasets/png_curated_sec_schools_access_v3_clean.csv"
    PREPARED_SCHOOLS = "EXP-15 results/tables/prepared_current_school_data.csv"
    ENVIRONMENT_FEATURES = "EXP-20 features/results/environment_features.csv"


@dataclass(frozen=True)
class InputField:
    name: str
    kind: FieldKind
    numeric: bool
    unit: str
    meaning: str
    source_table: Table
    source_column: str


_RAW, _PREP, _IDENT = FieldKind.RAW, FieldKind.PREPARED, FieldKind.IDENTITY
_T_RAW, _T_PREP, _T_ENV = Table.RAW_SCHOOLS, Table.PREPARED_SCHOOLS, Table.ENVIRONMENT_FEATURES

INPUT_CONTRACT: tuple[InputField, ...] = (
    InputField(
        "school_name",
        _IDENT,
        False,
        "text",
        "School name, the unique record key. Kept byte for byte.",
        _T_RAW,
        "School Name",
    ),
    InputField(
        "province",
        _IDENT,
        False,
        "text",
        "Province after the recorded spatial-join correction.",
        _T_PREP,
        "Province_corrected",
    ),
    InputField(
        "district",
        _IDENT,
        False,
        "text",
        "District after the recorded spatial-join correction.",
        _T_PREP,
        "District_corrected",
    ),
    InputField(
        "locality",
        _IDENT,
        False,
        "text",
        "Locality category as recorded. Coded to locality disadvantage inside the engine.",
        _T_RAW,
        "Locality",
    ),
    InputField(
        "permanent_classrooms",
        _RAW,
        True,
        "count",
        "Permanent classrooms.",
        _T_RAW,
        "Number of Permanent Classrooms",
    ),
    InputField(
        "total_classrooms",
        _RAW,
        True,
        "count",
        "All classrooms. Denominator of the permanent share.",
        _T_RAW,
        "Total Number of Classrooms",
    ),
    InputField(
        "teachers",
        _RAW,
        True,
        "count",
        "Available teachers. Denominator of the housing share.",
        _T_RAW,
        "Number of Available Teachers",
    ),
    InputField(
        "teacher_houses", _RAW, True, "count", "Houses for teachers.", _T_RAW, "Number of Houses for Teachers"
    ),
    InputField("libraries", _RAW, True, "count", "Libraries.", _T_RAW, "Number of Libraries"),
    InputField("workshops", _RAW, True, "count", "Workshops.", _T_RAW, "Number of Workshops"),
    InputField(
        "practical_skills_buildings",
        _RAW,
        True,
        "count",
        "Practical skills buildings.",
        _T_RAW,
        "Number of Practical Skills Buildings",
    ),
    InputField(
        "home_economics_buildings",
        _RAW,
        True,
        "count",
        "Home economics buildings.",
        _T_RAW,
        "Number of Home Economics Buildings",
    ),
    InputField(
        "computer_labs", _RAW, True, "count", "Computer laboratories.", _T_RAW, "Number of Computer Labs"
    ),
    InputField(
        "specialized_classrooms",
        _RAW,
        True,
        "count",
        "Specialized classrooms.",
        _T_RAW,
        "Number of Specialized Classrooms",
    ),
    InputField(
        "power_source",
        _RAW,
        False,
        "text",
        "Power source as recorded. Coded to power deficit inside the engine.",
        _T_RAW,
        "Power Source",
    ),
    InputField(
        "water_source",
        _RAW,
        False,
        "text",
        "Water source as recorded. Coded to water deficit inside the engine.",
        _T_RAW,
        "Water Source",
    ),
    InputField(
        "secondary_students_per_1000",
        _RAW,
        True,
        "students per 1,000 people",
        "District secondary-student rate.",
        _T_RAW,
        "Secondary students per 1000 people",
    ),
    InputField(
        "female_students_g7_12",
        _RAW,
        True,
        "students",
        "Female enrollment, grades 7 to 12.",
        _T_RAW,
        "Female students grade 7-12",
    ),
    InputField(
        "total_enrollment_g7_12",
        _RAW,
        True,
        "students",
        "Total enrollment, grades 7 to 12.",
        _T_RAW,
        "Total enrollment Grade 7-12",
    ),
    InputField(
        "conflict_population_exposure",
        _RAW,
        True,
        "people",
        "Population exposed to conflict events.",
        _T_RAW,
        "Conflict Population Exposure",
    ),
    InputField(
        "progression_g10_corrected_pct",
        _PREP,
        True,
        "percent",
        "Grade 7 to Grade 10 progression, bounded to 0..100 by the recorded correction.",
        _T_PREP,
        "progression10_corrected",
    ),
    InputField(
        "progression_g12_corrected_pct",
        _PREP,
        True,
        "percent",
        "Grade 7 to Grade 12 progression, bounded to 0..100 by the recorded correction.",
        _T_PREP,
        "progression12_corrected",
    ),
    InputField(
        "district_luminosity_area_integral",
        _PREP,
        True,
        "nW cm^-2 sr^-1 km^2",
        "Corrected district nighttime-light area integral (EXP-14 scenario m6_half2__mean__area_integral) mapped to the school.",
        _T_PREP,
        "activity_area_integral",
    ),
    InputField(
        "urgency_source_scalar",
        _RAW,
        True,
        "unitless, construct unresolved",
        "Supplied hazard-related scalar. Not the reach component R. Lineage is unresolved.",
        _T_RAW,
        "R",
    ),
    InputField(
        "walking_catchment_population",
        _RAW,
        True,
        "people",
        "Population within the modeled walking catchment. Source of the reach component R.",
        _T_RAW,
        "pop_with_access_walking",
    ),
    InputField(
        "aqi_p95_selected",
        _PREP,
        True,
        "US AQI",
        "School-assigned p95 of daily overall AQI. Missing when no assignment is supported.",
        _T_ENV,
        "aqi_selected_p95",
    ),
    InputField(
        "emissions_co2e_100yr_10km_tonnes",
        _PREP,
        True,
        "tonnes CO2e",
        "Eligible point-source 100-year CO2e mass within 10 km.",
        _T_ENV,
        "emissions_co2e_100yr_mass_10km_tonnes",
    ),
    InputField(
        "water_flooded_vegetation_fraction_500m",
        _PREP,
        True,
        "fraction 0..1",
        "Natural 500 m fraction classified as water plus flooded vegetation.",
        _T_ENV,
        "lulc_500m_water_plus_flooded_vegetation_fraction",
    ),
)


@dataclass(frozen=True)
class SchoolRecord:
    """One parsed input record. ``None`` means unknown and is never replaced."""

    school_name: str
    province: str | None
    district: str | None
    locality: str | None
    permanent_classrooms: float | None
    total_classrooms: float | None
    teachers: float | None
    teacher_houses: float | None
    libraries: float | None
    workshops: float | None
    practical_skills_buildings: float | None
    home_economics_buildings: float | None
    computer_labs: float | None
    specialized_classrooms: float | None
    power_source: str | None
    water_source: str | None
    secondary_students_per_1000: float | None
    female_students_g7_12: float | None
    total_enrollment_g7_12: float | None
    conflict_population_exposure: float | None
    progression_g10_corrected_pct: float | None
    progression_g12_corrected_pct: float | None
    district_luminosity_area_integral: float | None
    urgency_source_scalar: float | None
    walking_catchment_population: float | None
    aqi_p95_selected: float | None
    emissions_co2e_100yr_10km_tonnes: float | None
    water_flooded_vegetation_fraction_500m: float | None


def assemble_frame(tables: Mapping[Table, pd.DataFrame]) -> pd.DataFrame:
    """Build the canonical input frame from the study's source tables.

    All tables must list the same school names in the same order.
    """
    key_column = INPUT_CONTRACT[0].source_column
    reference_names: list[str] | None = None
    columns: dict[str, list[Any]] = {}
    for field in INPUT_CONTRACT:
        table = tables.get(field.source_table)
        if table is None:
            raise InputContractError(f"source table {field.source_table.value!r} was not supplied")
        if field.source_column not in table.columns:
            raise InputContractError(f"{field.source_table.value} has no column {field.source_column!r}")
        names = table[key_column].tolist()
        if reference_names is None:
            reference_names = names
        elif names != reference_names:
            raise InputContractError(
                f"{field.source_table.value} lists different schools or a different order"
            )
        columns[field.name] = table[field.source_column].tolist()
    return pd.DataFrame(columns)


def _is_missing(value: Any) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value)) or value is pd.NA


def _parse_text(value: Any, field: InputField, row: int) -> str | None:
    if _is_missing(value):
        return None
    if not isinstance(value, str):
        raise InputContractError(f"{field.name} row {row}: expected text, got {type(value).__name__}")
    return value


def _parse_number(value: Any, field: InputField, row: int) -> float | None:
    if _is_missing(value):
        return None
    if isinstance(value, (bool, str)) or not isinstance(value, numbers.Real):
        raise InputContractError(f"{field.name} row {row}: expected a number, got {value!r}")
    number = float(value)
    if math.isnan(number):
        return None
    if math.isinf(number):
        raise InputContractError(f"{field.name} row {row}: non-finite number {value!r}")
    return number


def parse_records(frame: pd.DataFrame) -> tuple[SchoolRecord, ...]:
    """Parse a canonical frame into typed records, in input order.

    Missing cells become ``None``. Nothing is filled, trimmed, coded or clipped here.
    """
    missing_columns = [f.name for f in INPUT_CONTRACT if f.name not in frame.columns]
    if missing_columns:
        raise InputContractError(f"missing input columns: {missing_columns}")
    parsed: dict[str, list[Any]] = {}
    for field in INPUT_CONTRACT:
        parse = _parse_number if field.numeric else _parse_text
        parsed[field.name] = [
            parse(value, field, row) for row, value in enumerate(frame[field.name].tolist())
        ]
    names = parsed["school_name"]
    if any(name is None or name.strip() == "" for name in names):
        raise InputContractError("school_name must be present on every record")
    if len(set(names)) != len(names):
        duplicates = sorted({name for name in names if names.count(name) > 1})
        raise InputContractError(f"school_name must be unique; duplicated: {len(duplicates)} name(s)")
    for name in ("progression_g10_corrected_pct", "progression_g12_corrected_pct"):
        if any(v is not None and not 0.0 <= v <= 100.0 for v in parsed[name]):
            raise InputContractError(f"{name} must be the corrected rate within 0..100")
    return tuple(
        SchoolRecord(**{name: values[row] for name, values in parsed.items()}) for row in range(len(names))
    )


def records_sha256(records: tuple[SchoolRecord, ...]) -> str:
    """Hash of the parsed records in order, independent of how they were supplied."""
    payload = json.dumps(
        [asdict(r) for r in records], sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


RECORD_FIELD_NAMES = tuple(f.name for f in fields(SchoolRecord))
