"""Configuration models and defaults for the school scoring pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from typing import Any


def _deep_merge(base: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merged[key] = _deep_merge(base[key], value)
        else:
            merged[key] = value
    return merged


def _serialize(value: Any) -> Any:
    if is_dataclass(value):
        return {k: _serialize(v) for k, v in asdict(value).items()}
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    return value


@dataclass
class ColumnConfig:
    school_name: str = "School Name"
    province: str = "Province"
    district: str = "District"
    locality: str = "Locality"
    latitude: str = "Latitude"
    longitude: str = "Longitude"
    catchment_wkt_columns: list[str] = field(
        default_factory=lambda: [
            "cachment_area_walking",
            "cachment_area_cycling",
            "cachment_area_driving",
        ]
    )
    numeric_imputation_columns: list[str] = field(
        default_factory=lambda: [
            "Number of Available Teachers",
            "Total Number of Classrooms",
            "Number of Permanent Classrooms",
            "Number of Semi-Permanent Classrooms",
            "Number of Bush Material Classrooms",
            "Number of Houses for Teachers",
            "Number of Libraries",
            "Number of Workshops",
            "Number of Practical Skills Buildings",
            "Number of Home Economics Buildings",
            "Number of Computer Labs",
            "Number of Specialized Classrooms",
        ]
    )
    categorical_imputation_columns: list[str] = field(
        default_factory=lambda: ["Power Source", "Water Source", "Toilets"]
    )
    required_columns: list[str] = field(
        default_factory=lambda: [
            "School Name",
            "Province",
            "District",
            "Locality",
            "Latitude",
            "Longitude",
            "Number of Available Teachers",
            "Total Number of Classrooms",
            "Number of Permanent Classrooms",
            "Number of Semi-Permanent Classrooms",
            "Number of Bush Material Classrooms",
            "Number of Houses for Teachers",
            "Number of Libraries",
            "Number of Workshops",
            "Number of Practical Skills Buildings",
            "Number of Home Economics Buildings",
            "Number of Computer Labs",
            "Number of Specialized Classrooms",
            "Power Source",
            "Water Source",
            "pop_with_access_walking",
            "pop_with_access_driving",
            "pop_with_access_cycling",
            "Access Walking (%)",
            "Access Driving (%)",
            "Access Cycling (%)",
            "Fixed Broadband Download Speed (MB/s)",
            "Mobile Internet Download Speed (MB/s)",
            "Total Nighttime Luminosity",
            "Secondary students per 1000 people",
            "Rate of Grade 7 who progressed to Grade 10 (%)",
            "Female students grade 7-12",
            "Total enrollment Grade 7-12",
            "Conflict Events",
            "Conflict Fatalities",
            "Conflict Population Exposure",
        ]
    )
    optional_columns: list[str] = field(
        default_factory=lambda: [
            "Toilets",
            "R",
            "lc_landterr_score",
            "cachment_area_walking",
            "cachment_area_cycling",
            "cachment_area_driving",
        ]
    )

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)

    @classmethod
    def from_dict(cls, overrides: dict[str, Any] | None = None) -> "ColumnConfig":
        data = _deep_merge(cls().to_dict(), overrides or {})
        return cls(**data)


@dataclass
class ImputationConfig:
    mode: str = "hierarchical"
    district_group_columns: list[str] = field(default_factory=lambda: ["Province", "District"])
    province_group_column: str = "Province"
    exclude_columns: list[str] = field(default_factory=list)
    preserve_missing_flags: bool = True
    source_crs: str = "EPSG:4326"
    metric_crs: str = "EPSG:3857"

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)

    @classmethod
    def from_dict(cls, overrides: dict[str, Any] | None = None) -> "ImputationConfig":
        data = _deep_merge(cls().to_dict(), overrides or {})
        return cls(**data)


@dataclass
class OutputConfig:
    include_intermediates: bool = True
    include_breakdown_column: bool = False
    sort_by: list[str] = field(default_factory=lambda: ["Priority", "Need"])
    ascending: list[bool] = field(default_factory=lambda: [False, False])

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)

    @classmethod
    def from_dict(cls, overrides: dict[str, Any] | None = None) -> "OutputConfig":
        data = _deep_merge(cls().to_dict(), overrides or {})
        return cls(**data)


@dataclass
class ScreeningConfig:
    quantile: float = 0.65
    fixed_cutoff: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)

    @classmethod
    def from_dict(cls, overrides: dict[str, Any] | None = None) -> "ScreeningConfig":
        data = _deep_merge(cls().to_dict(), overrides or {})
        return cls(**data)


@dataclass
class WeightConfig:
    school_access: dict[str, float] = field(
        default_factory=lambda: {"walking": 0.50, "cycling": 0.20, "driving": 0.30}
    )
    school_need: dict[str, float] = field(
        default_factory=lambda: {
            "locality": 0.25,
            "access_barrier": 0.20,
            "teacher_scarcity": 0.15,
            "classroom_stock_deficit": 0.20,
            "service_deficit": 0.15,
            "infrastructure_balance": 0.05,
        }
    )
    admin_access: dict[str, float] = field(
        default_factory=lambda: {"walking": 0.50, "cycling": 0.20, "driving": 0.30}
    )
    admin_service: dict[str, float] = field(
        default_factory=lambda: {"fixed_download": 0.50, "mobile_download": 0.50}
    )
    admin_socio: dict[str, float] = field(
        default_factory=lambda: {
            "ntl_deficit": 0.45,
            "sec_participation_deficit": 0.35,
            "secondary_students_per_1000_deficit": 0.20,
        }
    )
    admin_conflict: dict[str, float] = field(
        default_factory=lambda: {
            "events": 0.30,
            "fatalities": 0.30,
            "exposure": 0.40,
        }
    )
    admin_context: dict[str, float] = field(
        default_factory=lambda: {
            "access": 0.30,
            "service": 0.20,
            "progression": 0.25,
            "socio": 0.15,
            "conflict": 0.10,
        }
    )
    physical: dict[str, float] = field(
        default_factory=lambda: {"flood_risk": 0.70, "land_terrain": 0.30}
    )
    girls_bonus: dict[str, float] = field(
        default_factory=lambda: {"female_disadvantage": 0.05, "locality": 0.03, "cap": 0.08}
    )
    need: dict[str, float] = field(
        default_factory=lambda: {"S": 0.55, "A": 0.25, "R_phys": 0.20}
    )
    impact: dict[str, float] = field(
        default_factory=lambda: {
            "accessible_pop": 0.45,
            "catchment_area": 0.25,
            "school_gap": 0.30,
        }
    )
    practicality: dict[str, float] = field(
        default_factory=lambda: {"land_terrain_inverse": 0.50, "flood_inverse": 0.50}
    )
    priority: dict[str, float] = field(
        default_factory=lambda: {"Need": 0.70, "I": 0.20, "P": 0.10}
    )

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)

    @classmethod
    def from_dict(cls, overrides: dict[str, Any] | None = None) -> "WeightConfig":
        data = _deep_merge(cls().to_dict(), overrides or {})
        return cls(**data)


@dataclass
class ScoringConfig:
    columns: ColumnConfig = field(default_factory=ColumnConfig)
    imputation: ImputationConfig = field(default_factory=ImputationConfig)
    output: OutputConfig = field(default_factory=OutputConfig)
    screening: ScreeningConfig = field(default_factory=ScreeningConfig)
    duplicate_policy: str = "error"

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)

    @classmethod
    def from_dict(cls, overrides: dict[str, Any] | None = None) -> "ScoringConfig":
        overrides = overrides or {}
        return cls(
            columns=ColumnConfig.from_dict(overrides.get("columns")),
            imputation=ImputationConfig.from_dict(overrides.get("imputation")),
            output=OutputConfig.from_dict(overrides.get("output")),
            screening=ScreeningConfig.from_dict(overrides.get("screening")),
            duplicate_policy=overrides.get("duplicate_policy", cls().duplicate_policy),
        )


def get_default_config() -> ScoringConfig:
    return ScoringConfig()


def get_default_weights() -> WeightConfig:
    return WeightConfig()
