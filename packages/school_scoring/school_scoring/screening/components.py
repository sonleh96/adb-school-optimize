"""Deterministic component preparation: parts, normalization anchors and the evidence gate.

Cohorts are not decided here. They depend on the rule, so ``engine.screen`` decides them.

Anchors are fit on every supplied record, never on a filtered subset.
A value that cannot be computed stays ``None``; nothing is imputed.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
from enum import Enum
from fractions import Fraction

import numpy as np

from .inputs import SchoolRecord, records_sha256
from .rules import Component, GateFailure

# ---------------------------------------------------------------------------------------------
# Coding tables. Order matters: the first matching token group wins, as in the study code.
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class CodingTable:
    entries: tuple[tuple[tuple[str, ...], float], ...]

    def code(self, text: str | None) -> float | None:
        if text is None:
            return None
        lowered = text.strip().lower()
        for tokens, value in self.entries:
            if any(token in lowered for token in tokens):
                return value
        return None


POWER_DEFICIT = CodingTable(
    (
        (("generator",), 0.7),
        (("solar",), 0.4),
        (("hydro",), 0.3),
        (("png power", "grid", "mains"), 0.2),
    )
)
WATER_DEFICIT = CodingTable(
    (
        (("river", "stream", "creek", "lake", "bringing", "brining"), 1.0),
        (("tank", "well", "rain", "bore"), 0.5),
        (("piped", "town supply", "tap", "reticulated"), 0.2),
    )
)
LOCALITY_DISADVANTAGE = {
    "highly accessible": 0.0,
    "accessible": 0.2,
    "moderately accessible": 0.45,
    "remote": 0.7,
    "very remote": 0.9,
    "extremely remote": 1.0,
}

AREA_WEIGHTS = tuple(float(Fraction(w)) for w in ("0.25", "0.15", "0.25", "0.15", "0.10", "0.10"))

# ---------------------------------------------------------------------------------------------
# Typed outputs.
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class NeedParts:
    permanent_classroom_deficit: float | None
    teacher_housing_deficit: float | None
    facility_presence_deficit: float | None
    service_deficit: float | None
    locality_disadvantage: float | None


@dataclass(frozen=True)
class AreaParts:
    progression_g10_deficit: float | None
    progression_g12_deficit: float | None
    secondary_participation_deficit: float | None
    activity_scale_deficit: float | None
    conflict_exposure: float | None
    female_disadvantage: float | None


@dataclass(frozen=True)
class ComponentValues:
    N: float | None = None
    A: float | None = None
    U: float | None = None
    R: float | None = None
    Q: float | None = None
    E: float | None = None
    L: float | None = None

    def get(self, component: Component) -> float | None:
        return getattr(self, component.value)


@dataclass(frozen=True)
class Anchor:
    component: Component
    name: str
    source_field: str
    transformation: str
    n_records: int
    n_valid: int
    p05: float | None
    p95: float | None


@dataclass(frozen=True)
class PreparedRecord:
    record: SchoolRecord
    gate_failures: tuple[GateFailure, ...]
    missing_components: tuple[Component, ...]
    need_parts: NeedParts
    area_parts: AreaParts
    components: ComponentValues


@dataclass(frozen=True)
class PreparedRecords:
    records: tuple[PreparedRecord, ...]
    anchors: tuple[Anchor, ...]
    input_sha256: str


# ---------------------------------------------------------------------------------------------
# Normalization.
# ---------------------------------------------------------------------------------------------


class Transform(str, Enum):
    IDENTITY = "observed 5th/95th percentile scaling"
    LOG1P = "log1p then observed 5th/95th percentile scaling"
    LOG1P_FLOORED = "log1p of the value floored at 0, then observed 5th/95th percentile scaling"


@dataclass(frozen=True)
class ScaleSpec:
    component: Component
    name: str
    source_field: str
    transform: Transform
    inverse: bool = False
    minimum: float | None = None


SCALES = (
    ScaleSpec(
        Component.A,
        "secondary_participation",
        "secondary_students_per_1000",
        Transform.IDENTITY,
        inverse=True,
    ),
    ScaleSpec(
        Component.A,
        "activity_scale",
        "district_luminosity_area_integral",
        Transform.LOG1P_FLOORED,
        inverse=True,
    ),
    ScaleSpec(Component.A, "conflict_exposure", "conflict_population_exposure", Transform.LOG1P, minimum=0.0),
    ScaleSpec(Component.U, "urgency", "urgency_source_scalar", Transform.IDENTITY),
    ScaleSpec(Component.R, "reach", "walking_catchment_population", Transform.LOG1P, minimum=0.0),
    ScaleSpec(Component.Q, "aqi", "aqi_p95_selected", Transform.IDENTITY, minimum=0.0),
    ScaleSpec(Component.E, "emissions", "emissions_co2e_100yr_10km_tonnes", Transform.LOG1P, minimum=0.0),
)
LAND_FIELD = "water_flooded_vegetation_fraction_500m"


def _column(records: tuple[SchoolRecord, ...], name: str) -> np.ndarray:
    return np.array([np.nan if (v := getattr(r, name)) is None else v for r in records], dtype=float)


def _scale(values: np.ndarray, spec: ScaleSpec) -> tuple[np.ndarray, Anchor]:
    valid = np.isfinite(values)
    if spec.minimum is not None:
        valid &= values >= spec.minimum
    observed = values[valid]
    if spec.transform is Transform.LOG1P:
        observed = np.log1p(observed)
    elif spec.transform is Transform.LOG1P_FLOORED:
        observed = np.log1p(np.maximum(observed, 0.0))
    scaled = np.full(values.shape, np.nan)
    if observed.size == 0:
        anchor = Anchor(
            spec.component, spec.name, spec.source_field, spec.transform.value, len(values), 0, None, None
        )
        return scaled, anchor
    p05 = float(np.quantile(observed, 0.05))
    p95 = float(np.quantile(observed, 0.95))
    if p95 <= p05:
        scaled[valid] = 0.5
    else:
        scaled[valid] = (np.clip(observed, p05, p95) - p05) / (p95 - p05)
    if spec.inverse:
        scaled = np.clip(1 - scaled, 0, 1)
    anchor = Anchor(
        spec.component,
        spec.name,
        spec.source_field,
        spec.transform.value,
        len(values),
        int(valid.sum()),
        p05,
        p95,
    )
    return scaled, anchor


def _natural_fraction(values: np.ndarray) -> tuple[np.ndarray, Anchor]:
    with np.errstate(invalid="ignore"):
        valid = np.isfinite(values) & (values >= 0.0) & (values <= 1.0)
    scaled = np.where(valid, values, np.nan)
    anchor = Anchor(
        Component.L, "land", LAND_FIELD, "natural 0..1 fraction", len(values), int(valid.sum()), None, None
    )
    return scaled, anchor


# ---------------------------------------------------------------------------------------------
# Parts.
# ---------------------------------------------------------------------------------------------

_FACILITY_FIELDS = (
    "libraries",
    "workshops",
    "practical_skills_buildings",
    "home_economics_buildings",
    "computer_labs",
    "specialized_classrooms",
)
_STOCK_NUMERIC = ("permanent_classrooms", "total_classrooms", "teachers", "teacher_houses", *_FACILITY_FIELDS)


def _bounded_share_deficit(numerator: np.ndarray, denominator: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        share = np.where(denominator > 0, numerator / denominator, np.nan)
    return 1 - np.clip(share, 0, 1)


def _need_part_arrays(records: tuple[SchoolRecord, ...]) -> dict[str, np.ndarray]:
    permanent = _bounded_share_deficit(
        _column(records, "permanent_classrooms"), _column(records, "total_classrooms")
    )
    housing = _bounded_share_deficit(_column(records, "teacher_houses"), _column(records, "teachers"))
    facilities = np.column_stack([_column(records, name) for name in _FACILITY_FIELDS])
    with np.errstate(invalid="ignore"):
        present = (facilities > 0).sum(axis=1)
    facility = np.where(np.isnan(facilities).any(axis=1), np.nan, 1 - present / len(_FACILITY_FIELDS))
    power = np.array(
        [np.nan if (c := POWER_DEFICIT.code(r.power_source)) is None else c for r in records], dtype=float
    )
    water = np.array(
        [np.nan if (c := WATER_DEFICIT.code(r.water_source)) is None else c for r in records], dtype=float
    )
    locality = np.array(
        [
            np.nan if r.locality is None else LOCALITY_DISADVANTAGE.get(r.locality.strip().lower(), np.nan)
            for r in records
        ],
        dtype=float,
    )
    return {
        "permanent_classroom_deficit": permanent,
        "teacher_housing_deficit": housing,
        "facility_presence_deficit": facility,
        "service_deficit": (power + water) / 2,
        "locality_disadvantage": locality,
    }


def _sequential_sum(arrays: list[np.ndarray]) -> np.ndarray:
    total = arrays[0]
    for array in arrays[1:]:
        total = total + array
    return total


def _optional(value: float) -> float | None:
    return None if np.isnan(value) else float(value)


def _gate_failures(
    record: SchoolRecord, need: dict[str, np.ndarray], row: int, area_known: bool, reach_known: bool
):
    stock = [getattr(record, name) for name in _STOCK_NUMERIC]
    failures = []
    if any(v is None for v in stock) or record.power_source is None or record.water_source is None:
        failures.append(GateFailure.MISSING_STOCK_FIELD)
    if any(v is not None and v < 0 for v in stock):
        failures.append(GateFailure.NEGATIVE_STOCK_VALUE)
    if any(v is not None and v <= 0 for v in (record.total_classrooms, record.teachers)):
        failures.append(GateFailure.NONPOSITIVE_DENOMINATOR)
    if (
        record.power_source is not None
        and record.water_source is not None
        and np.isnan(need["service_deficit"][row])
    ):
        failures.append(GateFailure.UNRECOGNIZED_SERVICE_CODING)
    if np.isnan(need["locality_disadvantage"][row]):
        failures.append(GateFailure.UNRECOGNIZED_LOCALITY)
    if not area_known:
        failures.append(GateFailure.UNRESOLVED_AREA_CONTEXT)
    if not reach_known:
        failures.append(GateFailure.UNRESOLVED_REACH)
    return tuple(failures)


def prepare(records: tuple[SchoolRecord, ...]) -> PreparedRecords:
    """Compute parts, components, anchors, gate failures and missing components for the full record set."""
    need = _need_part_arrays(records)
    need_mean = _sequential_sum([need[f.name] for f in fields(NeedParts)]) / len(fields(NeedParts))

    scaled: dict[str, np.ndarray] = {}
    anchors: list[Anchor] = []
    for spec in SCALES:
        scaled[spec.name], anchor = _scale(_column(records, spec.source_field), spec)
        anchors.append(anchor)
    scaled["land"], land_anchor = _natural_fraction(_column(records, LAND_FIELD))
    anchors.append(land_anchor)

    enrollment = _column(records, "total_enrollment_g7_12")
    with np.errstate(divide="ignore", invalid="ignore"):
        female_share = np.clip(
            _column(records, "female_students_g7_12") / np.where(enrollment == 0, np.nan, enrollment), 0, 1
        )
    area = {
        "progression_g10_deficit": 1 - _column(records, "progression_g10_corrected_pct") / 100,
        "progression_g12_deficit": 1 - _column(records, "progression_g12_corrected_pct") / 100,
        "secondary_participation_deficit": scaled["secondary_participation"],
        "activity_scale_deficit": scaled["activity_scale"],
        "conflict_exposure": scaled["conflict_exposure"],
        "female_disadvantage": np.clip((0.5 - female_share) / 0.5, 0, 1),
    }
    weighted = [weight * area[f.name] for weight, f in zip(AREA_WEIGHTS, fields(AreaParts), strict=True)]
    area_context = np.clip(_sequential_sum(weighted), 0, 1)

    values = {
        Component.N: need_mean,
        Component.A: area_context,
        Component.U: scaled["urgency"],
        Component.R: scaled["reach"],
        Component.Q: scaled["aqi"],
        Component.E: scaled["emissions"],
        Component.L: scaled["land"],
    }
    prepared = []
    for row, record in enumerate(records):
        failures = _gate_failures(
            record,
            need,
            row,
            area_known=not np.isnan(area_context[row]),
            reach_known=not np.isnan(values[Component.R][row]),
        )
        prepared.append(
            PreparedRecord(
                record=record,
                gate_failures=failures,
                missing_components=tuple(c for c in Component if np.isnan(values[c][row])),
                need_parts=NeedParts(**{f.name: _optional(need[f.name][row]) for f in fields(NeedParts)}),
                area_parts=AreaParts(**{f.name: _optional(area[f.name][row]) for f in fields(AreaParts)}),
                components=ComponentValues(**{c.value: _optional(values[c][row]) for c in Component}),
            )
        )
    return PreparedRecords(tuple(prepared), tuple(anchors), records_sha256(records))
