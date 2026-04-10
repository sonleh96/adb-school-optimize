SCHOOL_SOURCE_FILE = "datasets/png_curated_sec_schools_access_v3_clean.csv"
DISTRICT_SOURCE_FILE = "datasets/aggregated_district_data.geojson"

AUXILIARY_VECTOR_SOURCES = {
    "roads": "datasets/roads_intersect_2026_2.json",
    "air_quality": "datasets/air_quality.geojson",
    "pop_access_walk": "datasets/pop_access_walk_v2.csv",
    "pop_no_walk": "datasets/pop_no_walk_v2.csv",
    "pop_access_cycle": "datasets/pop_access_cycle_v2.csv",
    "pop_no_cycle": "datasets/pop_no_cycle_v2.csv",
    "pop_access_drive": "datasets/pop_access_drive_v2.csv",
    "pop_no_drive": "datasets/pop_no_drive_v2.csv",
    "country_boundary": "datasets/PNG_country.geojson",
    "province_boundaries": "datasets/PNG_provinces.geojson",
    "district_boundaries_ref": "datasets/PNG_districts.geojson",
}

SCHOOL_IDENTIFIER_COLUMNS = {
    "school_name": "School Name",
    "province": "Province",
    "district": "District",
    "latitude": "Latitude",
    "longitude": "Longitude",
}

DISTRICT_IDENTIFIER_COLUMNS = {
    "province": "Province",
    "district": "District",
}

DISTRICT_NAME_ALIASES = {
    "Province": "NAM_1",
    "District": "NAM_2",
}
