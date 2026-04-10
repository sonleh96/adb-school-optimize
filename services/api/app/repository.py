from __future__ import annotations

import json
import math
from io import BytesIO
from typing import Any

import pandas as pd
from psycopg.types.json import Json

from school_scoring import ScoringConfig, get_default_config, run_scoring
from school_scoring.explainability import build_score_breakdown

from .errors import ApiError
from .queries import (
    DEFAULT_SCENARIO_SQL,
    DISTRICT_GEOMETRY_SQL,
    DISTRICTS_CHOROPLETH_SQL,
    DISTRICTS_SQL,
    LAYERS_SQL,
    PROVINCES_SQL,
    RANKED_EXPORT_SQL,
    SCENARIO_SQL,
    SCENARIOS_SQL,
    SCHOOL_DETAIL_SQL,
    SCHOOLS_SQL,
    VECTOR_LAYER_FEATURES_SQL,
)
from .settings import get_settings


INDICATOR_OPTIONS = [
    "Average AQI",
    "Maximum AQI",
    "Fixed Broadband Download Speed (MB/s)",
    "Fixed Broadband Upload Speed (MB/s)",
    "Mobile Internet Download Speed (MB/s)",
    "Mobile Internet Upload Speed (MB/s)",
    "Access Walking (%)",
    "Access Driving (%)",
    "Access Cycling (%)",
    "Total Nighttime Luminosity",
    "CO2e-20yr Total Emissions (tonnes)",
    "CO2e-100yr Total Emissions (tonnes)",
    "Secondary students per 1000 people",
    "Rate of Grade 7 who progressed to Grade 10 (%)",
    "Conflict Events",
    "Conflict Fatalities",
    "Conflict Population Exposure",
]


def fetch_all(connection, query: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with connection.cursor() as cursor:
        cursor.execute(query, params or {})
        return [_json_safe(row) for row in cursor.fetchall()]


def fetch_one(connection, query: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    with connection.cursor() as cursor:
        cursor.execute(query, params or {})
        row = cursor.fetchone()
        return _json_safe(row) if row is not None else None


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_json_safe(item) for item in value)
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    return value


def fetch_layers(connection) -> list[dict[str, Any]]:
    settings = get_settings()
    rows = fetch_all(connection, LAYERS_SQL)
    raster_paths = {
        "flood": settings.raster_source_path("flood"),
        "landcover": settings.raster_source_path("landcover"),
    }
    for row in rows:
        if row.get("source_kind") != "gcs":
            continue
        layer_key = str(row.get("layer_key") or "").lower()
        normalized_key = "landcover" if layer_key == "land_cover" else layer_key
        source_path = raster_paths.get(normalized_key)
        if source_path:
            row["source_path"] = source_path
    return rows


def fetch_vector_layer_features(
    connection,
    layer_key: str,
    province: str | None = None,
    district: str | None = None,
    limit: int = 5000,
    bbox_4326: tuple[float, float, float, float] | None = None,
) -> dict[str, Any]:
    layers = fetch_layers(connection)
    layer = next((item for item in layers if item.get("layer_key") == layer_key), None)
    if not layer:
        raise ApiError(
            "Layer not found.",
            status_code=404,
            code="layer_not_found",
            details={"layer_key": layer_key},
        )
    if layer.get("layer_type") != "vector":
        raise ApiError(
            "Layer is not a vector layer.",
            status_code=400,
            code="layer_not_vector",
            details={"layer_key": layer_key, "layer_type": layer.get("layer_type")},
        )

    items = fetch_all(
        connection,
        VECTOR_LAYER_FEATURES_SQL,
        {
            "layer_key": layer_key,
            "province": province,
            "district": district,
            "limit": limit,
            "min_lon": bbox_4326[0] if bbox_4326 else None,
            "min_lat": bbox_4326[1] if bbox_4326 else None,
            "max_lon": bbox_4326[2] if bbox_4326 else None,
            "max_lat": bbox_4326[3] if bbox_4326 else None,
        },
    )
    return {
        "layer": layer,
        "count": len(items),
        "items": items,
    }


def fetch_indicators() -> list[str]:
    return INDICATOR_OPTIONS


def fetch_provinces(connection) -> list[dict[str, Any]]:
    return fetch_all(connection, PROVINCES_SQL)


def fetch_districts(connection, province: str | None = None) -> list[dict[str, Any]]:
    return fetch_all(connection, DISTRICTS_SQL, {"province": province})


def fetch_district_geometry(connection, district: str, province: str | None = None) -> dict[str, Any]:
    rows = fetch_all(connection, DISTRICT_GEOMETRY_SQL, {"district": district, "province": province})
    if not rows:
        raise ApiError(
            "District not found.",
            status_code=404,
            code="district_not_found",
            details={"district": district, "province": province},
        )
    if province is None and len(rows) > 1:
        raise ApiError(
            "District name is ambiguous across provinces. Provide the province parameter.",
            status_code=400,
            code="district_ambiguous",
            details={"district": district, "matches": [row["province"] for row in rows]},
        )
    return rows[0]


def fetch_district_choropleth(
    connection,
    province: str | None = None,
    district: str | None = None,
) -> list[dict[str, Any]]:
    return fetch_all(connection, DISTRICTS_CHOROPLETH_SQL, {"province": province, "district": district})


def fetch_schools(
    connection,
    province: str | None = None,
    district: str | None = None,
    scenario_id: str | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    return fetch_all(
        connection,
        SCHOOLS_SQL,
        {
            "province": province,
            "district": district,
            "scenario_id": scenario_id,
            "limit": limit,
        },
    )


def fetch_school_detail(connection, school_id: str, scenario_id: str | None = None) -> dict[str, Any] | None:
    row = fetch_one(connection, SCHOOL_DETAIL_SQL, {"school_id": school_id, "scenario_id": scenario_id})
    if row and not row.get("component_breakdown"):
        row["component_breakdown"] = build_score_breakdown(row, {})
    return row


def fetch_scenarios(connection) -> list[dict[str, Any]]:
    return fetch_all(connection, SCENARIOS_SQL)


def fetch_scenario(connection, scenario_id: str) -> dict[str, Any] | None:
    return fetch_one(connection, SCENARIO_SQL, {"scenario_id": scenario_id})


def insert_scenario(connection, payload: dict[str, Any]) -> dict[str, Any]:
    db_payload = {
        **payload,
        "weights": Json(payload["weights"]),
        "config": Json(payload["config"]) if payload.get("config") is not None else None,
    }
    query = """
    insert into scoring_scenarios (scenario_name, description, weights, config, created_by, is_default)
    values (%(scenario_name)s, %(description)s, %(weights)s, %(config)s, %(created_by)s, %(is_default)s)
    on conflict (scenario_name_norm) do update
    set description = excluded.description,
        weights = excluded.weights,
        config = excluded.config,
        created_by = excluded.created_by,
        is_default = excluded.is_default,
        updated_at = now()
    returning scenario_id, scenario_name, description, weights, config, created_by, is_default, created_at, updated_at
    """
    with connection.cursor() as cursor:
        cursor.execute(query, db_payload)
        row = cursor.fetchone()
        if payload.get("is_default") and row:
            cursor.execute(
                """
                update scoring_scenarios
                set is_default = false, updated_at = now()
                where scenario_id <> %(scenario_id)s::uuid
                """,
                {"scenario_id": row["scenario_id"]},
            )
    connection.commit()
    return row


def update_scenario(connection, scenario_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    existing = fetch_scenario(connection, scenario_id)
    if not existing:
        return None

    merged = {
        "scenario_name": payload.get("scenario_name", existing["scenario_name"]),
        "description": payload.get("description", existing["description"]),
        "weights": Json(payload.get("weights", existing["weights"])),
        "config": Json(payload.get("config", existing["config"])) if payload.get("config", existing["config"]) is not None else None,
        "created_by": payload.get("created_by", existing["created_by"]),
        "is_default": payload.get("is_default", existing["is_default"]),
        "scenario_id": scenario_id,
    }

    query = """
    update scoring_scenarios
    set scenario_name = %(scenario_name)s,
        description = %(description)s,
        weights = %(weights)s,
        config = %(config)s,
        created_by = %(created_by)s,
        is_default = %(is_default)s,
        updated_at = now()
    where scenario_id = %(scenario_id)s::uuid
    returning scenario_id, scenario_name, description, weights, config, created_by, is_default, created_at, updated_at
    """
    with connection.cursor() as cursor:
        cursor.execute(query, merged)
        row = cursor.fetchone()
        if merged.get("is_default") and row:
            cursor.execute(
                """
                update scoring_scenarios
                set is_default = false, updated_at = now()
                where scenario_id <> %(scenario_id)s::uuid
                """,
                {"scenario_id": row["scenario_id"]},
            )
    connection.commit()
    return row


def _fetch_school_dataframe(connection) -> pd.DataFrame:
    query = """
    select school_name as "School Name",
           locality as "Locality",
           number_of_available_teachers as "Number of Available Teachers",
           total_number_of_classrooms as "Total Number of Classrooms",
           number_of_permanent_classrooms as "Number of Permanent Classrooms",
           number_of_semi_permanent_classrooms as "Number of Semi-Permanent Classrooms",
           number_of_bush_material_classrooms as "Number of Bush Material Classrooms",
           number_of_houses_for_teachers as "Number of Houses for Teachers",
           number_of_libraries as "Number of Libraries",
           number_of_workshops as "Number of Workshops",
           number_of_practical_skills_buildings as "Number of Practical Skills Buildings",
           number_of_home_economics_buildings as "Number of Home Economics Buildings",
           number_of_computer_labs as "Number of Computer Labs",
           power_source as "Power Source",
           water_source as "Water Source",
           toilets as "Toilets",
           latitude as "Latitude",
           longitude as "Longitude",
           province as "Province",
           district as "District",
           cachment_area_walking_wkt as "cachment_area_walking",
           cachment_area_cycling_wkt as "cachment_area_cycling",
           cachment_area_driving_wkt as "cachment_area_driving",
           pop_with_access_walking as "pop_with_access_walking",
           pop_with_access_driving as "pop_with_access_driving",
           pop_with_access_cycling as "pop_with_access_cycling",
           number_of_specialized_classrooms as "Number of Specialized Classrooms",
           lc_landterr_score as "lc_landterr_score",
           r as "R",
           average_aqi as "Average AQI",
           maximum_aqi as "Maximum AQI",
           fixed_broadband_download_speed_mbps as "Fixed Broadband Download Speed (MB/s)",
           fixed_broadband_upload_speed_mbps as "Fixed Broadband Upload Speed (MB/s)",
           mobile_internet_download_speed_mbps as "Mobile Internet Download Speed (MB/s)",
           mobile_internet_upload_speed_mbps as "Mobile Internet Upload Speed (MB/s)",
           access_walking_pct as "Access Walking (%)",
           access_driving_pct as "Access Driving (%)",
           access_cycling_pct as "Access Cycling (%)",
           total_nighttime_luminosity as "Total Nighttime Luminosity",
           co2e_20yr_total_emissions_tonnes as "CO2e-20yr Total Emissions (tonnes)",
           co2e_100yr_total_emissions_tonnes as "CO2e-100yr Total Emissions (tonnes)",
           grade_7_students as "Grade 7 Students",
           grade_8_students as "Grade 8 Students",
           grade_9_students as "Grade 9 Students",
           grade_10_students as "Grade 10 Students",
           grade_11_students as "Grade 11 Students",
           grade_12_students as "Grade 12 Students",
           total_population as "Total Population",
           female_students_grade_7_12 as "Female students grade 7-12",
           total_enrollment_grade_7_12 as "Total enrollment Grade 7-12",
           secondary_students_per_1000_people as "Secondary students per 1000 people",
           rate_grade_7_progressed_to_grade_12_pct as "Rate of Grade 7 who progressed to Grade 12 (%)",
           total_enrollment_grade_7_10 as "Total enrollment Grade 7-10",
           grade_7_10_students_per_1000_population as "Grade 7-10 Students per 1000 Population",
           rate_grade_7_progressed_to_grade_10_pct as "Rate of Grade 7 who progressed to Grade 10 (%)",
           school_aged_population as "School-Aged Population",
           conflict_events as "Conflict Events",
           conflict_fatalities as "Conflict Fatalities",
           conflict_population_exposure as "Conflict Population Exposure"
    from schools
    """
    with connection.cursor() as cursor:
        cursor.execute(query)
        rows = list(cursor.fetchall())

    df = pd.DataFrame(rows)

    # Defensive cleanup: if a header-like row was ever inserted during a bad load,
    # do not let it poison scoring validation.
    if "School Name" in df.columns:
        df = df[df["School Name"].astype(str).str.strip() != "School Name"].copy()

    return df


def run_and_persist_scenario(
    connection,
    weight_overrides: dict[str, Any] | None = None,
    config_overrides: dict[str, Any] | None = None,
    scenario_name: str | None = None,
    description: str | None = None,
    created_by: str | None = None,
    persist: bool = True,
    is_default: bool = False,
) -> dict[str, Any]:
    config = ScoringConfig.from_dict(config_overrides or {}) if config_overrides else get_default_config()
    schools_df = _fetch_school_dataframe(connection)
    result = run_scoring(schools_df, config=config, weight_overrides=weight_overrides)

    if not persist:
        return {
            "scenario": None,
            "summary": result.summary,
            "warnings": result.warnings,
            "top_rows": _serialize_preview_rows(result.scored_data),
        }

    scenario_payload = {
        "scenario_name": scenario_name or "Custom Scenario",
        "description": description,
        "weights": result.applied_weights,
        "config": result.applied_config,
        "created_by": created_by,
        "is_default": is_default,
    }
    scenario = insert_scenario(connection, scenario_payload)

    with connection.cursor() as cursor:
        cursor.execute("delete from school_scores where scenario_id = %(scenario_id)s::uuid", {"scenario_id": scenario["scenario_id"]})
    connection.commit()

    school_id_map = {
        row["School Name"]: row["school_id"]
        for row in fetch_all(connection, 'select school_id, school_name as "School Name" from schools')
    }

    insert_query = """
    insert into school_scores (
        scenario_id, school_id, s, a, r_phys, g, i, p,
        need_score, priority_score, data_confidence, stage1_selected,
        rank_priority, rank_need, component_breakdown
    )
    values (
        %(scenario_id)s::uuid, %(school_id)s::uuid, %(s)s, %(a)s, %(r_phys)s, %(g)s, %(i)s, %(p)s,
        %(need_score)s, %(priority_score)s, %(data_confidence)s, %(stage1_selected)s,
        %(rank_priority)s, %(rank_need)s, %(component_breakdown)s
    )
    """

    rows = []
    for record in result.scored_data.to_dict(orient="records"):
        school_id = school_id_map.get(record["School Name"])
        if not school_id:
            continue
        rows.append(
            {
                "scenario_id": scenario["scenario_id"],
                "school_id": school_id,
                "s": record.get("S"),
                "a": record.get("A"),
                "r_phys": record.get("R_phys"),
                "g": record.get("G"),
                "i": record.get("I"),
                "p": record.get("P"),
                "need_score": record.get("Need"),
                "priority_score": record.get("Priority"),
                "data_confidence": record.get("data_confidence"),
                "stage1_selected": bool(record.get("stage1_selected")),
                "rank_priority": int(record.get("rank_priority")),
                "rank_need": int(record.get("rank_need")),
                "component_breakdown": Json(build_score_breakdown(record, result.applied_weights)),
            }
        )

    with connection.cursor() as cursor:
        cursor.executemany(insert_query, rows)
    connection.commit()

    return {
        "scenario": scenario,
        "summary": result.summary,
        "warnings": result.warnings,
        "top_rows": _serialize_preview_rows(result.scored_data),
    }


def _serialize_preview_rows(df: pd.DataFrame) -> list[dict[str, Any]]:
    preview = []
    for record in df.head(25).to_dict(orient="records"):
        preview.append(
            {
                "school_name": record.get("School Name"),
                "province": record.get("Province"),
                "district": record.get("District"),
                "priority": record.get("Priority"),
                "need": record.get("Need"),
            }
        )
    return preview


def export_ranked_csv(connection, scenario_id: str | None = None) -> bytes:
    df = pd.read_sql(RANKED_EXPORT_SQL, connection, params={"scenario_id": scenario_id})
    return df.to_csv(index=False).encode("utf-8")


def export_ranked_xlsx(connection, scenario_id: str | None = None) -> bytes:
    df = pd.read_sql(RANKED_EXPORT_SQL, connection, params={"scenario_id": scenario_id})
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="ranked_schools")
    output.seek(0)
    return output.read()
