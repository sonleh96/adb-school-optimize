# RISE-PNG Data Catalog

Status: Sprint 0 minimum catalog for research use.

Date: 2026-08-09.

This catalog records what the current application loads and which governance fields remain unknown.

It does not certify the datasets for operational investment decisions.

## Primary school source

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

The screening API reads each school's id and coordinates from `public.schools`.
Every other value it shows comes from the stored screening inputs.

School names are currently the ingestion conflict key, so rename and collision risk remains until a governed source identifier is supplied.

## Supporting sources

| Source group | Local artifacts | Current use |
| --- | --- | --- |
| Administrative boundaries | `PNG_districts.geojson`, `aggregated_district_data.geojson` | Ingestion check that each school's coordinates fall inside a district polygon. Nothing is stored from them. |
| Other layers | `PNG_country.geojson`, `PNG_provinces.geojson`, `roads_intersect_2026_2.json`, `pop_access_*_v2.csv`, `pop_no_*_v2.csv`, `air_quality.geojson`, `districts_emis.csv`, `districts_emis.xlsx`, `PNG_flood_JRC.tif`, `Dynamic World LULC.tif` | Not loaded or shown by the application. |

The repository does not currently record authoritative owner, extraction date, reference period, license, or transformation lineage for these supporting sources.

## Quality controls

The school loader stops before writing when a school's coordinates fall outside every district polygon.
It prints a warning when a school's district label differs from the polygon that covers it (`services/api/app/ingestion/data_quality.py`).

Screening inputs are parsed through the engine's input contract in `school_scoring.screening.inputs`.
An unknown value stays unknown, a school that fails the gate is queued with its reasons, and nothing is imputed.

## Run provenance

Every stored screening run carries a manifest with the rule, its weights, the anchors, the engine package version, and SHA-256 fingerprints of the inputs.
An input version is frozen: loading different numbers under an existing version id is refused.
The fingerprints identify exact run inputs but do not replace source ownership, licensing, or reference-period metadata.

## Governance work still required

- Assign a named owner and steward for each source.
- Record source system, extraction date, reference period, and license.
- Obtain a durable school identifier from an authoritative registry.
- Record every source-to-curated transformation with code version and row-level exception logs.
- Review and disposition all quality exceptions before an input version is released.
- Define retention, access, correction, and approval procedures with ADB and education-sector stakeholders.

