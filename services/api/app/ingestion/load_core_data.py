"""CLI entrypoint for loading core school and district data into Postgres."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd
from psycopg.types.json import Json
from shapely.geometry import MultiPolygon, shape
from shapely.wkt import dumps

from ..db import get_db
from .mappings import AUXILIARY_VECTOR_SOURCES
from ..settings import get_settings


ROOT = Path(__file__).resolve().parents[4]
DEFAULT_SCHOOLS_PATH = ROOT / "datasets" / "png_curated_sec_schools_access_v3_clean.csv"
DEFAULT_DISTRICTS_PATH = ROOT / "datasets" / "aggregated_district_data.geojson"
DEFAULT_AUXILIARY_SOURCE_PATHS = {key: ROOT / relative_path for key, relative_path in AUXILIARY_VECTOR_SOURCES.items()}


def _drop_header_like_school_rows(df: pd.DataFrame) -> pd.DataFrame:
    if "School Name" not in df.columns:
        return df
    return df[df["School Name"].astype(str).str.strip() != "School Name"].copy()


def _load_geojson(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["features"]


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _jsonable_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if pd.isna(value):
        return None
    return value


def _feature_name(properties: dict[str, Any]) -> str | None:
    for key in ("name", "Name", "location", "NAM_2", "NAM_1", "NAM_0", "ref"):
        value = _string_or_none(properties.get(key))
        if value:
            return value
    return None


def _feature_geometry_wkt(feature_geometry: dict[str, Any]) -> str:
    geometry = shape(feature_geometry)
    if geometry.geom_type == "Polygon":
        geometry = MultiPolygon([geometry])
    return dumps(geometry)


def _geojson_vector_records(layer_key: str, path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, feature in enumerate(_load_geojson(path)):
        properties = feature.get("properties", {})
        records.append(
            {
                "layer_key": layer_key,
                "source_feature_id": _string_or_none(
                    properties.get("ID")
                    or properties.get("id")
                    or properties.get("osm_id")
                    or properties.get("ADM2CD_c")
                    or properties.get("ADM1CD_c")
                    or index
                ),
                "feature_name": _feature_name(properties),
                "province": _string_or_none(properties.get("NAM_1") or properties.get("Province")),
                "district": _string_or_none(properties.get("NAM_2") or properties.get("District")),
                "properties": Json({key: _jsonable_value(value) for key, value in properties.items()}),
                "geom_wkt": _feature_geometry_wkt(feature["geometry"]),
            }
        )
    return records


def _csv_point_vector_records(layer_key: str, path: Path) -> list[dict[str, Any]]:
    df = pd.read_csv(path)
    records: list[dict[str, Any]] = []
    for row in df.to_dict(orient="records"):
        xcoord = row.get("xcoord")
        ycoord = row.get("ycoord")
        records.append(
            {
                "layer_key": layer_key,
                "source_feature_id": _string_or_none(row.get("ID")),
                "feature_name": None,
                "province": _string_or_none(row.get("NAM_1")),
                "district": _string_or_none(row.get("NAM_2")),
                "properties": Json({key: _jsonable_value(value) for key, value in row.items()}),
                "geom_wkt": f"POINT ({xcoord} {ycoord})",
            }
        )
    return records


def _school_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for row in df.to_dict(orient="records"):
        records.append(
            {
                "school_name": row.get("School Name"),
                "locality": row.get("Locality"),
                "province": row.get("Province"),
                "district": row.get("District"),
                "latitude": row.get("Latitude"),
                "longitude": row.get("Longitude"),
                "number_of_available_teachers": row.get("Number of Available Teachers"),
                "total_number_of_classrooms": row.get("Total Number of Classrooms"),
                "number_of_permanent_classrooms": row.get("Number of Permanent Classrooms"),
                "number_of_semi_permanent_classrooms": row.get("Number of Semi-Permanent Classrooms"),
                "number_of_bush_material_classrooms": row.get("Number of Bush Material Classrooms"),
                "number_of_houses_for_teachers": row.get("Number of Houses for Teachers"),
                "number_of_libraries": row.get("Number of Libraries"),
                "number_of_workshops": row.get("Number of Workshops"),
                "number_of_practical_skills_buildings": row.get("Number of Practical Skills Buildings"),
                "number_of_home_economics_buildings": row.get("Number of Home Economics Buildings"),
                "number_of_computer_labs": row.get("Number of Computer Labs"),
                "power_source": row.get("Power Source"),
                "water_source": row.get("Water Source"),
                "toilets": row.get("Toilets"),
                "cachment_area_walking_wkt": row.get("cachment_area_walking"),
                "cachment_area_cycling_wkt": row.get("cachment_area_cycling"),
                "cachment_area_driving_wkt": row.get("cachment_area_driving"),
                "pop_with_access_walking": row.get("pop_with_access_walking"),
                "pop_with_access_driving": row.get("pop_with_access_driving"),
                "pop_with_access_cycling": row.get("pop_with_access_cycling"),
                "number_of_specialized_classrooms": row.get("Number of Specialized Classrooms"),
                "lc_landterr_score": row.get("lc_landterr_score"),
                "r": row.get("R"),
                "average_aqi": row.get("Average AQI"),
                "maximum_aqi": row.get("Maximum AQI"),
                "fixed_broadband_download_speed_mbps": row.get("Fixed Broadband Download Speed (MB/s)"),
                "fixed_broadband_upload_speed_mbps": row.get("Fixed Broadband Upload Speed (MB/s)"),
                "mobile_internet_download_speed_mbps": row.get("Mobile Internet Download Speed (MB/s)"),
                "mobile_internet_upload_speed_mbps": row.get("Mobile Internet Upload Speed (MB/s)"),
                "access_walking_pct": row.get("Access Walking (%)"),
                "access_driving_pct": row.get("Access Driving (%)"),
                "access_cycling_pct": row.get("Access Cycling (%)"),
                "total_nighttime_luminosity": row.get("Total Nighttime Luminosity"),
                "co2e_20yr_total_emissions_tonnes": row.get("CO2e-20yr Total Emissions (tonnes)"),
                "co2e_100yr_total_emissions_tonnes": row.get("CO2e-100yr Total Emissions (tonnes)"),
                "grade_7_students": row.get("Grade 7 Students"),
                "grade_8_students": row.get("Grade 8 Students"),
                "grade_9_students": row.get("Grade 9 Students"),
                "grade_10_students": row.get("Grade 10 Students"),
                "grade_11_students": row.get("Grade 11 Students"),
                "grade_12_students": row.get("Grade 12 Students"),
                "total_population": row.get("Total Population"),
                "female_students_grade_7_12": row.get("Female students grade 7-12"),
                "total_enrollment_grade_7_12": row.get("Total enrollment Grade 7-12"),
                "secondary_students_per_1000_people": row.get("Secondary students per 1000 people"),
                "rate_grade_7_progressed_to_grade_12_pct": row.get("Rate of Grade 7 who progressed to Grade 12 (%)"),
                "total_enrollment_grade_7_10": row.get("Total enrollment Grade 7-10"),
                "grade_7_10_students_per_1000_population": row.get("Grade 7-10 Students per 1000 Population"),
                "rate_grade_7_progressed_to_grade_10_pct": row.get("Rate of Grade 7 who progressed to Grade 10 (%)"),
                "school_aged_population": row.get("School-Aged Population"),
                "conflict_events": row.get("Conflict Events"),
                "conflict_fatalities": row.get("Conflict Fatalities"),
                "conflict_population_exposure": row.get("Conflict Population Exposure"),
                "geom_wkt": f"POINT ({row.get('Longitude')} {row.get('Latitude')})",
            }
        )
    return records


def _district_records(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for feature in features:
        properties = feature["properties"]
        geometry = shape(feature["geometry"])
        if geometry.geom_type == "Polygon":
            geometry = MultiPolygon([geometry])
        rows.append(
            {
                "province": properties.get("Province"),
                "district": properties.get("District"),
                "average_aqi": properties.get("Average AQI"),
                "maximum_aqi": properties.get("Maximum AQI"),
                "fixed_broadband_download_speed_mbps": properties.get("Fixed Broadband Download Speed (MB/s)"),
                "fixed_broadband_upload_speed_mbps": properties.get("Fixed Broadband Upload Speed (MB/s)"),
                "mobile_internet_download_speed_mbps": properties.get("Mobile Internet Download Speed (MB/s)"),
                "mobile_internet_upload_speed_mbps": properties.get("Mobile Internet Upload Speed (MB/s)"),
                "access_walking_pct": properties.get("Access Walking (%)"),
                "access_driving_pct": properties.get("Access Driving (%)"),
                "access_cycling_pct": properties.get("Access Cycling (%)"),
                "total_nighttime_luminosity": properties.get("Total Nighttime Luminosity"),
                "co2e_20yr_total_emissions_tonnes": properties.get("CO2e-20yr Total Emissions (tonnes)"),
                "co2e_100yr_total_emissions_tonnes": properties.get("CO2e-100yr Total Emissions (tonnes)"),
                "grade_7_students": properties.get("Grade 7 Students"),
                "grade_8_students": properties.get("Grade 8 Students"),
                "grade_9_students": properties.get("Grade 9 Students"),
                "grade_10_students": properties.get("Grade 10 Students"),
                "grade_11_students": properties.get("Grade 11 Students"),
                "grade_12_students": properties.get("Grade 12 Students"),
                "total_population": properties.get("Total Population"),
                "female_students_grade_7_12": properties.get("Female students grade 7-12"),
                "total_enrollment_grade_7_12": properties.get("Total enrollment Grade 7-12"),
                "secondary_students_per_1000_people": properties.get("Secondary students per 1000 people"),
                "rate_grade_7_progressed_to_grade_12_pct": properties.get("Rate of Grade 7 who progressed to Grade 12 (%)"),
                "total_enrollment_grade_7_10": properties.get("Total enrollment Grade 7-10"),
                "grade_7_10_students_per_1000_population": properties.get("Grade 7-10 Students per 1000 Population"),
                "rate_grade_7_progressed_to_grade_10_pct": properties.get("Rate of Grade 7 who progressed to Grade 10 (%)"),
                "school_aged_population": properties.get("School-Aged Population"),
                "conflict_events": properties.get("Conflict Events"),
                "conflict_fatalities": properties.get("Conflict Fatalities"),
                "conflict_population_exposure": properties.get("Conflict Population Exposure"),
                "geom_wkt": dumps(geometry),
            }
        )
    return rows


def load_schools(connection, path: Path) -> int:
    df = pd.read_csv(path)
    df = _drop_header_like_school_rows(df)
    for column in ["School Name", "Province", "District", "Locality", "Power Source", "Water Source", "Toilets"]:
        if column in df.columns:
            df[column] = df[column].map(lambda value: value.strip() if isinstance(value, str) else value)
    records = _school_records(df)
    query = """
    insert into schools (
        school_name, locality, province, district, latitude, longitude, geom,
        number_of_available_teachers, total_number_of_classrooms, number_of_permanent_classrooms,
        number_of_semi_permanent_classrooms, number_of_bush_material_classrooms,
        number_of_houses_for_teachers, number_of_libraries, number_of_workshops,
        number_of_practical_skills_buildings, number_of_home_economics_buildings,
        number_of_computer_labs, power_source, water_source, toilets,
        cachment_area_walking_wkt, cachment_area_cycling_wkt, cachment_area_driving_wkt,
        pop_with_access_walking, pop_with_access_driving, pop_with_access_cycling,
        number_of_specialized_classrooms, lc_landterr_score, r, average_aqi, maximum_aqi,
        fixed_broadband_download_speed_mbps, fixed_broadband_upload_speed_mbps,
        mobile_internet_download_speed_mbps, mobile_internet_upload_speed_mbps,
        access_walking_pct, access_driving_pct, access_cycling_pct,
        total_nighttime_luminosity, co2e_20yr_total_emissions_tonnes, co2e_100yr_total_emissions_tonnes,
        grade_7_students, grade_8_students, grade_9_students, grade_10_students, grade_11_students, grade_12_students,
        total_population, female_students_grade_7_12, total_enrollment_grade_7_12,
        secondary_students_per_1000_people, rate_grade_7_progressed_to_grade_12_pct,
        total_enrollment_grade_7_10, grade_7_10_students_per_1000_population,
        rate_grade_7_progressed_to_grade_10_pct, school_aged_population, conflict_events,
        conflict_fatalities, conflict_population_exposure
    )
    values (
        %(school_name)s, %(locality)s, %(province)s, %(district)s, %(latitude)s, %(longitude)s,
        st_setsrid(st_geomfromtext(%(geom_wkt)s), 4326),
        %(number_of_available_teachers)s, %(total_number_of_classrooms)s, %(number_of_permanent_classrooms)s,
        %(number_of_semi_permanent_classrooms)s, %(number_of_bush_material_classrooms)s,
        %(number_of_houses_for_teachers)s, %(number_of_libraries)s, %(number_of_workshops)s,
        %(number_of_practical_skills_buildings)s, %(number_of_home_economics_buildings)s,
        %(number_of_computer_labs)s, %(power_source)s, %(water_source)s, %(toilets)s,
        %(cachment_area_walking_wkt)s, %(cachment_area_cycling_wkt)s, %(cachment_area_driving_wkt)s,
        %(pop_with_access_walking)s, %(pop_with_access_driving)s, %(pop_with_access_cycling)s,
        %(number_of_specialized_classrooms)s, %(lc_landterr_score)s, %(r)s, %(average_aqi)s, %(maximum_aqi)s,
        %(fixed_broadband_download_speed_mbps)s, %(fixed_broadband_upload_speed_mbps)s,
        %(mobile_internet_download_speed_mbps)s, %(mobile_internet_upload_speed_mbps)s,
        %(access_walking_pct)s, %(access_driving_pct)s, %(access_cycling_pct)s,
        %(total_nighttime_luminosity)s, %(co2e_20yr_total_emissions_tonnes)s, %(co2e_100yr_total_emissions_tonnes)s,
        %(grade_7_students)s, %(grade_8_students)s, %(grade_9_students)s, %(grade_10_students)s, %(grade_11_students)s, %(grade_12_students)s,
        %(total_population)s, %(female_students_grade_7_12)s, %(total_enrollment_grade_7_12)s,
        %(secondary_students_per_1000_people)s, %(rate_grade_7_progressed_to_grade_12_pct)s,
        %(total_enrollment_grade_7_10)s, %(grade_7_10_students_per_1000_population)s,
        %(rate_grade_7_progressed_to_grade_10_pct)s, %(school_aged_population)s, %(conflict_events)s,
        %(conflict_fatalities)s, %(conflict_population_exposure)s
    )
    on conflict (school_name_norm) do update
    set locality = excluded.locality,
        province = excluded.province,
        district = excluded.district,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        geom = excluded.geom,
        number_of_available_teachers = excluded.number_of_available_teachers,
        total_number_of_classrooms = excluded.total_number_of_classrooms,
        number_of_permanent_classrooms = excluded.number_of_permanent_classrooms,
        number_of_semi_permanent_classrooms = excluded.number_of_semi_permanent_classrooms,
        number_of_bush_material_classrooms = excluded.number_of_bush_material_classrooms,
        number_of_houses_for_teachers = excluded.number_of_houses_for_teachers,
        number_of_libraries = excluded.number_of_libraries,
        number_of_workshops = excluded.number_of_workshops,
        number_of_practical_skills_buildings = excluded.number_of_practical_skills_buildings,
        number_of_home_economics_buildings = excluded.number_of_home_economics_buildings,
        number_of_computer_labs = excluded.number_of_computer_labs,
        power_source = excluded.power_source,
        water_source = excluded.water_source,
        toilets = excluded.toilets,
        cachment_area_walking_wkt = excluded.cachment_area_walking_wkt,
        cachment_area_cycling_wkt = excluded.cachment_area_cycling_wkt,
        cachment_area_driving_wkt = excluded.cachment_area_driving_wkt,
        pop_with_access_walking = excluded.pop_with_access_walking,
        pop_with_access_driving = excluded.pop_with_access_driving,
        pop_with_access_cycling = excluded.pop_with_access_cycling,
        number_of_specialized_classrooms = excluded.number_of_specialized_classrooms,
        lc_landterr_score = excluded.lc_landterr_score,
        r = excluded.r,
        average_aqi = excluded.average_aqi,
        maximum_aqi = excluded.maximum_aqi,
        fixed_broadband_download_speed_mbps = excluded.fixed_broadband_download_speed_mbps,
        fixed_broadband_upload_speed_mbps = excluded.fixed_broadband_upload_speed_mbps,
        mobile_internet_download_speed_mbps = excluded.mobile_internet_download_speed_mbps,
        mobile_internet_upload_speed_mbps = excluded.mobile_internet_upload_speed_mbps,
        access_walking_pct = excluded.access_walking_pct,
        access_driving_pct = excluded.access_driving_pct,
        access_cycling_pct = excluded.access_cycling_pct,
        total_nighttime_luminosity = excluded.total_nighttime_luminosity,
        co2e_20yr_total_emissions_tonnes = excluded.co2e_20yr_total_emissions_tonnes,
        co2e_100yr_total_emissions_tonnes = excluded.co2e_100yr_total_emissions_tonnes,
        grade_7_students = excluded.grade_7_students,
        grade_8_students = excluded.grade_8_students,
        grade_9_students = excluded.grade_9_students,
        grade_10_students = excluded.grade_10_students,
        grade_11_students = excluded.grade_11_students,
        grade_12_students = excluded.grade_12_students,
        total_population = excluded.total_population,
        female_students_grade_7_12 = excluded.female_students_grade_7_12,
        total_enrollment_grade_7_12 = excluded.total_enrollment_grade_7_12,
        secondary_students_per_1000_people = excluded.secondary_students_per_1000_people,
        rate_grade_7_progressed_to_grade_12_pct = excluded.rate_grade_7_progressed_to_grade_12_pct,
        total_enrollment_grade_7_10 = excluded.total_enrollment_grade_7_10,
        grade_7_10_students_per_1000_population = excluded.grade_7_10_students_per_1000_population,
        rate_grade_7_progressed_to_grade_10_pct = excluded.rate_grade_7_progressed_to_grade_10_pct,
        school_aged_population = excluded.school_aged_population,
        conflict_events = excluded.conflict_events,
        conflict_fatalities = excluded.conflict_fatalities,
        conflict_population_exposure = excluded.conflict_population_exposure,
        updated_at = now()
    """
    with connection.cursor() as cursor:
        cursor.executemany(query, records)
    connection.commit()
    return len(records)


def load_districts(connection, path: Path) -> int:
    records = _district_records(_load_geojson(path))
    query = """
    insert into districts (
        province, district, geom, average_aqi, maximum_aqi,
        fixed_broadband_download_speed_mbps, fixed_broadband_upload_speed_mbps,
        mobile_internet_download_speed_mbps, mobile_internet_upload_speed_mbps,
        access_walking_pct, access_driving_pct, access_cycling_pct,
        total_nighttime_luminosity, co2e_20yr_total_emissions_tonnes, co2e_100yr_total_emissions_tonnes,
        grade_7_students, grade_8_students, grade_9_students, grade_10_students, grade_11_students, grade_12_students,
        total_population, female_students_grade_7_12, total_enrollment_grade_7_12,
        secondary_students_per_1000_people, rate_grade_7_progressed_to_grade_12_pct,
        total_enrollment_grade_7_10, grade_7_10_students_per_1000_population,
        rate_grade_7_progressed_to_grade_10_pct, school_aged_population,
        conflict_events, conflict_fatalities, conflict_population_exposure
    )
    values (
        %(province)s, %(district)s, st_setsrid(st_geomfromtext(%(geom_wkt)s), 4326), %(average_aqi)s, %(maximum_aqi)s,
        %(fixed_broadband_download_speed_mbps)s, %(fixed_broadband_upload_speed_mbps)s,
        %(mobile_internet_download_speed_mbps)s, %(mobile_internet_upload_speed_mbps)s,
        %(access_walking_pct)s, %(access_driving_pct)s, %(access_cycling_pct)s,
        %(total_nighttime_luminosity)s, %(co2e_20yr_total_emissions_tonnes)s, %(co2e_100yr_total_emissions_tonnes)s,
        %(grade_7_students)s, %(grade_8_students)s, %(grade_9_students)s, %(grade_10_students)s, %(grade_11_students)s, %(grade_12_students)s,
        %(total_population)s, %(female_students_grade_7_12)s, %(total_enrollment_grade_7_12)s,
        %(secondary_students_per_1000_people)s, %(rate_grade_7_progressed_to_grade_12_pct)s,
        %(total_enrollment_grade_7_10)s, %(grade_7_10_students_per_1000_population)s,
        %(rate_grade_7_progressed_to_grade_10_pct)s, %(school_aged_population)s,
        %(conflict_events)s, %(conflict_fatalities)s, %(conflict_population_exposure)s
    )
    on conflict (province_norm, district_norm) do update
    set geom = excluded.geom,
        average_aqi = excluded.average_aqi,
        maximum_aqi = excluded.maximum_aqi,
        fixed_broadband_download_speed_mbps = excluded.fixed_broadband_download_speed_mbps,
        fixed_broadband_upload_speed_mbps = excluded.fixed_broadband_upload_speed_mbps,
        mobile_internet_download_speed_mbps = excluded.mobile_internet_download_speed_mbps,
        mobile_internet_upload_speed_mbps = excluded.mobile_internet_upload_speed_mbps,
        access_walking_pct = excluded.access_walking_pct,
        access_driving_pct = excluded.access_driving_pct,
        access_cycling_pct = excluded.access_cycling_pct,
        total_nighttime_luminosity = excluded.total_nighttime_luminosity,
        co2e_20yr_total_emissions_tonnes = excluded.co2e_20yr_total_emissions_tonnes,
        co2e_100yr_total_emissions_tonnes = excluded.co2e_100yr_total_emissions_tonnes,
        grade_7_students = excluded.grade_7_students,
        grade_8_students = excluded.grade_8_students,
        grade_9_students = excluded.grade_9_students,
        grade_10_students = excluded.grade_10_students,
        grade_11_students = excluded.grade_11_students,
        grade_12_students = excluded.grade_12_students,
        total_population = excluded.total_population,
        female_students_grade_7_12 = excluded.female_students_grade_7_12,
        total_enrollment_grade_7_12 = excluded.total_enrollment_grade_7_12,
        secondary_students_per_1000_people = excluded.secondary_students_per_1000_people,
        rate_grade_7_progressed_to_grade_12_pct = excluded.rate_grade_7_progressed_to_grade_12_pct,
        total_enrollment_grade_7_10 = excluded.total_enrollment_grade_7_10,
        grade_7_10_students_per_1000_population = excluded.grade_7_10_students_per_1000_population,
        rate_grade_7_progressed_to_grade_10_pct = excluded.rate_grade_7_progressed_to_grade_10_pct,
        school_aged_population = excluded.school_aged_population,
        conflict_events = excluded.conflict_events,
        conflict_fatalities = excluded.conflict_fatalities,
        conflict_population_exposure = excluded.conflict_population_exposure,
        updated_at = now()
    """
    with connection.cursor() as cursor:
        cursor.executemany(query, records)
    connection.commit()
    return len(records)


def load_vector_layer_features(connection, layer_key: str, records: list[dict[str, Any]]) -> int:
    if not records:
        return 0
    deduped_records: list[dict[str, Any]] = []
    seen_source_ids: set[str] = set()
    for record in records:
        source_feature_id = _string_or_none(record.get("source_feature_id"))
        if source_feature_id is not None:
            if source_feature_id in seen_source_ids:
                continue
            seen_source_ids.add(source_feature_id)
            record["source_feature_id"] = source_feature_id
        deduped_records.append(record)

    delete_query = "delete from vector_layer_features where layer_key = %(layer_key)s"
    insert_query = """
    insert into vector_layer_features (
        layer_key, source_feature_id, feature_name, province, district, properties, geom
    )
    values (
        %(layer_key)s, %(source_feature_id)s, %(feature_name)s, %(province)s, %(district)s, %(properties)s,
        st_setsrid(st_geomfromtext(%(geom_wkt)s), 4326)
    )
    """
    with connection.cursor() as cursor:
        cursor.execute(delete_query, {"layer_key": layer_key})
        cursor.executemany(insert_query, deduped_records)
    connection.commit()
    return len(deduped_records)


def load_auxiliary_layers(connection, auxiliary_paths: dict[str, Path] | None = None) -> dict[str, int]:
    auxiliary_paths = auxiliary_paths or DEFAULT_AUXILIARY_SOURCE_PATHS
    counts: dict[str, int] = {}

    geojson_layers = {
        "roads",
        "air_quality",
        "country_boundary",
        "province_boundaries",
        "district_boundaries_ref",
    }
    csv_point_layers = {
        "pop_access_walk",
        "pop_no_walk",
        "pop_access_cycle",
        "pop_no_cycle",
        "pop_access_drive",
        "pop_no_drive",
    }

    for layer_key, path in auxiliary_paths.items():
        if not path.exists():
            counts[layer_key] = 0
            continue
        if layer_key in geojson_layers:
            records = _geojson_vector_records(layer_key, path)
        elif layer_key in csv_point_layers:
            records = _csv_point_vector_records(layer_key, path)
        else:
            raise ValueError(f"Unsupported auxiliary layer key: {layer_key}")
        counts[layer_key] = load_vector_layer_features(connection, layer_key, records)

    return counts


def load_default_layers(connection) -> None:
    settings = get_settings()
    layers = [
        ("schools", "Schools", "school_explorer", "vector", "supabase", "schools", "school_name", "point", True, False),
        ("districts", "Districts", "district_explorer", "vector", "supabase", "districts", "province+district", "polygon", True, False),
        ("roads", "Roads", "school_explorer", "vector", "supabase", "vector_layer_features", "NAM_1+NAM_2", "linestring", False, False),
        ("air_quality", "Air Quality", "school_explorer", "vector", "supabase", "vector_layer_features", "NAM_1+NAM_2", "polygon", False, False),
        ("pop_access_walk", "Population Within Access (Walking - 4 km)", "school_explorer", "vector", "supabase", "vector_layer_features", "NAM_1+NAM_2", "point", False, False),
        ("pop_no_walk", "Population Without Access (Walking - 4 km)", "school_explorer", "vector", "supabase", "vector_layer_features", "NAM_1+NAM_2", "point", False, False),
        ("pop_access_cycle", "Population Within Access (Cycling - 7 km)", "school_explorer", "vector", "supabase", "vector_layer_features", "NAM_1+NAM_2", "point", False, False),
        ("pop_no_cycle", "Population Without Access (Cycling - 7 km)", "school_explorer", "vector", "supabase", "vector_layer_features", "NAM_1+NAM_2", "point", False, False),
        ("pop_access_drive", "Population Within Access (Driving - 10 km)", "school_explorer", "vector", "supabase", "vector_layer_features", "NAM_1+NAM_2", "point", False, False),
        ("pop_no_drive", "Population Without Access (Driving - 10 km)", "school_explorer", "vector", "supabase", "vector_layer_features", "NAM_1+NAM_2", "point", False, False),
        ("country_boundary", "Country Boundary", "reference", "vector", "supabase", "vector_layer_features", "country", "polygon", False, False),
        ("province_boundaries", "Province Boundaries", "reference", "vector", "supabase", "vector_layer_features", "NAM_1", "polygon", False, False),
        ("district_boundaries_ref", "District Boundaries Reference", "reference", "vector", "supabase", "vector_layer_features", "NAM_1+NAM_2", "polygon", False, False),
        (
            "flood",
            "Flood inundation",
            "school_explorer",
            "raster",
            "gcs",
            settings.raster_source_path("flood") or "PNG_flood_JRC.tif",
            "district clip",
            "raster",
            False,
            True,
        ),
        (
            "land_cover",
            "Land cover",
            "school_explorer",
            "raster",
            "gcs",
            settings.raster_source_path("landcover") or "Dynamic World LULC.tif",
            "district clip",
            "raster",
            False,
            True,
        ),
        (
            "luminosity",
            "Nighttime Luminosity",
            "school_explorer",
            "raster",
            "gcs",
            settings.raster_district_clip_prefix("luminosity") or "district clip",
            "district clip",
            "raster",
            False,
            False,
        ),
        (
            "elevation",
            "Elevation",
            "school_explorer",
            "raster",
            "gcs",
            settings.raster_district_clip_prefix("elevation") or "district clip",
            "district clip",
            "raster",
            False,
            False,
        ),
    ]
    query = """
    insert into layer_catalog (
        layer_key, layer_name, layer_group, layer_type, source_kind, source_path,
        join_strategy, geometry_type, default_visible, runtime_clip
    )
    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    on conflict (layer_key) do update
    set layer_name = excluded.layer_name,
        layer_group = excluded.layer_group,
        layer_type = excluded.layer_type,
        source_kind = excluded.source_kind,
        source_path = excluded.source_path,
        join_strategy = excluded.join_strategy,
        geometry_type = excluded.geometry_type,
        default_visible = excluded.default_visible,
        runtime_clip = excluded.runtime_clip,
        updated_at = now()
    """
    with connection.cursor() as cursor:
        cursor.executemany(query, layers)
    connection.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Load core school and district data into PostGIS.")
    parser.add_argument("--schools", type=Path, default=DEFAULT_SCHOOLS_PATH)
    parser.add_argument("--districts", type=Path, default=DEFAULT_DISTRICTS_PATH)
    parser.add_argument("--skip-auxiliary-layers", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    with get_db(settings) as connection:
        district_count = load_districts(connection, args.districts)
        school_count = load_schools(connection, args.schools)
        auxiliary_counts = {} if args.skip_auxiliary_layers else load_auxiliary_layers(connection)
        load_default_layers(connection)

    if auxiliary_counts:
        summary = ", ".join(f"{layer}={count}" for layer, count in sorted(auxiliary_counts.items()))
        print(f"Loaded {district_count} districts, {school_count} schools, and auxiliary layers: {summary}.")
    else:
        print(f"Loaded {district_count} districts and {school_count} schools.")


if __name__ == "__main__":
    main()
