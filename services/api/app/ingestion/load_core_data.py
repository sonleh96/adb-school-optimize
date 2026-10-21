"""CLI entrypoint for loading the school table into Postgres.

The screening API reads each school's id and coordinates from `schools`, so this stays the way the table is filled.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import pandas as pd

from ..db import get_db
from .data_quality import preflight_ingestion_inputs

ROOT = Path(__file__).resolve().parents[4]
DEFAULT_SCHOOLS_PATH = ROOT / "datasets" / "png_curated_sec_schools_access_v3_clean.csv"
# District polygons are read only to check that each school's coordinates fall inside its own district.
DEFAULT_DISTRICTS_PATH = ROOT / "datasets" / "aggregated_district_data.geojson"
DEFAULT_DISTRICT_REFERENCE_PATH = ROOT / "datasets" / "PNG_districts.geojson"


def _drop_header_like_school_rows(df: pd.DataFrame) -> pd.DataFrame:
    if "School Name" not in df.columns:
        return df
    return df[df["School Name"].astype(str).str.strip() != "School Name"].copy()


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
                "rate_grade_7_progressed_to_grade_12_pct": row.get(
                    "Rate of Grade 7 who progressed to Grade 12 (%)"
                ),
                "total_enrollment_grade_7_10": row.get("Total enrollment Grade 7-10"),
                "grade_7_10_students_per_1000_population": row.get("Grade 7-10 Students per 1000 Population"),
                "rate_grade_7_progressed_to_grade_10_pct": row.get(
                    "Rate of Grade 7 who progressed to Grade 10 (%)"
                ),
                "school_aged_population": row.get("School-Aged Population"),
                "conflict_events": row.get("Conflict Events"),
                "conflict_fatalities": row.get("Conflict Fatalities"),
                "conflict_population_exposure": row.get("Conflict Population Exposure"),
                "geom_wkt": f"POINT ({row.get('Longitude')} {row.get('Latitude')})",
            }
        )
    return records


def load_schools(connection, path: Path) -> int:
    df = pd.read_csv(path)
    df = _drop_header_like_school_rows(df)
    for column in [
        "School Name",
        "Province",
        "District",
        "Locality",
        "Power Source",
        "Water Source",
        "Toilets",
    ]:
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Load school data into PostGIS.")
    parser.add_argument("--schools", type=Path, default=DEFAULT_SCHOOLS_PATH)
    parser.add_argument(
        "--districts",
        type=Path,
        default=DEFAULT_DISTRICTS_PATH,
        help="District polygons for the coordinate check; nothing is stored from them.",
    )
    args = parser.parse_args()

    preflight_ingestion_inputs(
        args.schools,
        args.districts,
        DEFAULT_DISTRICT_REFERENCE_PATH if DEFAULT_DISTRICT_REFERENCE_PATH.exists() else None,
    )

    with get_db() as connection:
        school_count = load_schools(connection, args.schools)

    print(f"Loaded {school_count} schools.")


if __name__ == "__main__":
    main()
