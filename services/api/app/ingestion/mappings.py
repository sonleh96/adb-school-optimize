SCHOOL_SOURCE_FILE = "datasets/png_curated_sec_schools_access_v3_clean.csv"
DISTRICT_SOURCE_FILE = "datasets/aggregated_district_data.geojson"

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

