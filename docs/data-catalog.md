# RISE-PNG Data Catalog

Status: Sprint 0 minimum catalog for research use.

Date: 2026-08-09.

This catalog records what the current application uses and which governance fields remain unknown.

It does not certify the datasets for operational investment decisions.

## Primary scoring source

| Item | Current record |
| --- | --- |
| Local path | `datasets/png_curated_sec_schools_access_v3_clean.csv` |
| Records | 212 secondary schools |
| Columns | 59 |
| Geographic coverage | 22 provinces and 79 province-district label pairs |
| Application destination | `public.schools` in Supabase Postgres |
| Durable source identifier | Not available in the source file |
| Database identifier | Generated UUID in `schools.school_id` |
| Source owner | Unknown |
| Source system | Unknown |
| Extraction date | Unknown |
| Reference period | Unknown |
| License or use terms | Unknown |
| Transformation manifest | Partial implementation in repository ingestion code only |

The source combines school facilities, connectivity, enrolment, accessibility, hazard, environmental, and conflict indicators.

School names are currently the ingestion conflict key, so rename and collision risk remains until a governed source identifier is supplied.

## Supporting sources

| Source group | Local artifacts | Current use |
| --- | --- | --- |
| Administrative boundaries | `PNG_country.geojson`, `PNG_provinces.geojson`, `PNG_districts.geojson`, `aggregated_district_data.geojson` | Map display, district context, and spatial review |
| Road network | `roads_intersect_2026_2.json` | Context layer and access analysis |
| Population access | `pop_access_*_v2.csv`, `pop_no_*_v2.csv` | Walking, cycling, and driving access indicators |
| Air quality | `air_quality.geojson` | District context and map layer |
| Emissions | `districts_emis.csv`, `districts_emis.xlsx` | District environmental context |
| Flood hazard | `PNG_flood_JRC.tif` | Physical-risk input and raster display |
| Land cover | `Dynamic World LULC.tif` | Terrain and land-cover context |

The repository does not currently record authoritative owner, extraction date, reference period, license, or transformation lineage for these supporting sources.

## Required scoring fields

The executable scoring contract is defined by `ColumnConfig.required_columns` in the scoring package.

The contract now includes `Grade 7-10 Students per 1000 Population`, which the formula previously read without declaring.

Missing required columns fail before formula execution with a schema-validation error.

Missing values within declared fields may still be imputed under the configured research method and must be disclosed in outputs.

## Automated quality controls

The scoring package now performs the following checks without silently changing source values:

- WGS84 coordinate validity is a hard failure.
- Duplicate school names remain a hard failure under the default policy.
- Percentage values outside 0 to 100 are reported for review.
- Exact duplicate school coordinates are reported for identity review.
- Accessible population is checked for walking-to-cycling-to-driving nesting.
- Catchment WKT parsing, school-point coverage, and travel-mode nesting are reported.
- Every scoring run records structured issues in its summary and warnings.

District label versus polygon assignment still requires the administrative-boundary ingestion check and is not resolved by the scoring package alone.

## Run provenance

Every scoring run now records a research score version plus SHA-256 fingerprints of the input table, scoring configuration, and weight configuration.

The additive database migration `infra/sql/003_scoring_run_provenance.sql` stores these fields with the scenario once applied.

The fingerprints identify exact run inputs but do not replace source ownership, licensing, or reference-period metadata.

## Governance work still required

- Assign a named owner and steward for each source.
- Record source system, extraction date, reference period, and license.
- Obtain a durable school identifier from an authoritative registry.
- Record every source-to-curated transformation with code version and row-level exception logs.
- Review and disposition all quality exceptions before a score version is released.
- Define retention, access, correction, and approval procedures with ADB and education-sector stakeholders.

