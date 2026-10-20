# API Service

Planned `FastAPI` backend hosted on Cloud Run.

Responsibilities:
- metadata endpoints
- school and district query endpoints
- scoring scenario CRUD
- scoring execution via `packages/school_scoring`
- CSV/XLSX export endpoints
- raster overlay delivery from district-based preclipped assets

This service is the boundary between the UI and the data/scoring stack.

## Current Scaffold

- app entrypoint: [main.py](/Users/sonle/Documents/work/ADB/adb-school-optimize/services/api/app/main.py)
- ingestion CLI: [load_core_data.py](/Users/sonle/Documents/work/ADB/adb-school-optimize/services/api/app/ingestion/load_core_data.py)
- default scenario seeding: [seed_default_scenario.py](/Users/sonle/Documents/work/ADB/adb-school-optimize/services/api/app/ingestion/seed_default_scenario.py)

## Expected Local Flow

1. Create the Supabase project and run [001_core_schema.sql](/Users/sonle/Documents/work/ADB/adb-school-optimize/infra/sql/001_core_schema.sql).
2. Configure backend env in either:
   - [services/api/.env.example](/Users/sonle/Documents/work/ADB/adb-school-optimize/services/api/.env.example) copied to `services/api/.env`
   - or a repo-root `.env`

   The API now loads `.env` and `.env.local` automatically from both the repo root and `services/api`, with `services/api/.env.local` taking precedence over the other files.
3. Install the local scoring package so the API can import it: `pip install -e ../../packages/school_scoring`.
4. Install the API package dependencies: `pip install -e .`
5. Run `python -m app.ingestion.load_core_data`.
6. Run `python -m app.ingestion.seed_default_scenario`.
7. Start the API with `uvicorn app.main:app --reload`.

## Screening inputs and results

`infra/sql/005_screening.sql` adds four tables next to the old scoring tables, which stay untouched:
`screening_input_versions`, `screening_inputs`, `screening_runs` and `screening_results`.
They hold one frozen input version, the seven rules of the screening engine run on it, and every school's result under every rule.
The tables have row level security on and no privileges for `anon` or `authenticated`, as in `002_security_lockdown.sql`.

Load a version after the migration has been applied:

```bash
python -m app.ingestion.load_screening_inputs \
  --input-version paper-2026-10-12 \
  --reference-root <methodology dir> \
  --datasets-root <datasets dir> \
  --description "Inputs of the circulated paper"
```

The command reads the three source tables of the study, parses them through the engine's input contract, stores the records, runs all rules and stores the runs, in one transaction.
It needs only `DATABASE_URL`.

- A rerun with identical inputs changes nothing and says so.
- A version that exists with a different input hash is refused. Pick a new version id.
- A stored run that no longer equals the engine's output is refused. Bump the engine package version when the method changed.
- Schools are stored under the name exactly as the source has it. A name is linked to `schools.school_id` through `normalize_join_key` when the key is unique; otherwise `school_id` stays null and the name is listed in the output as unmatched or ambiguous. Load `schools` first, or rerun the command afterwards: the links converge.

`app/screening_store.py` reads versions, runs and ordered results back as typed objects.

## Screening API

`app/routers/screening.py` serves the stored runs under `/api/v1/screening`, behind the same authentication as every other route.
It reads `screening_*` tables and recomputes nothing; the old Need/Priority endpoints are unchanged and share nothing with it.
Unknown rule, input version or school gives 404 in the API's `{"error": {code, message, details}}` envelope.

| Route | Returns |
| --- | --- |
| `GET /rules` | The seven rules: id, label, provenance, policy role, score kind, formula, weights as fractions and floats, whether urgency enters, and the input versions that have a run. |
| `GET /input-versions` | Stored versions, newest first, with the default marked. |
| `GET /results?rule=&input_version=&package_version=&placement=lower\|upper&province=&district=` | Every school in the paper's order with the run manifest. `rule` defaults to the circulated `additive_u`. |
| `GET /schools/by-key/{school_key}?input_version=` | One school under all seven rules, with its stored raw inputs. Every school has a `school_key`, linked to `schools` or not. |
| `GET /schools/{school_id}?input_version=` | Every school of the version linked to that `schools` row (normally one), each as above. |
| `GET /compare?a=&b=&input_version=` | Common-cohort ranks under both rules, the pairwise metrics, top-20 entrants and exits, and the bounds of interval schools. |
| `GET /exports/top.csv`, `top.xlsx` | The shortlist: `rule`, `k`, `include_ranges`, `province`, `district`, `input_version`. |
| `GET /exports/incomplete.csv` | The verification queue of a rule, with gate failures and missing inputs per school. |

Reading the list:

- `school_key` is derived from the input version and the exact source name. It is the same on every request for a version and differs between versions.
- Complete schools come by point rank. Interval schools (a missing environmental input) sit at their lower-score position, or at their upper-score position with `placement=upper`, and each row says which. Queued schools come last, by province, district and name.
- A rank is always paired with the scope label and count of its cohort. A point rank counts complete schools; a rank bound counts eligible schools. They are different scopes.
- Filters only hide rows. Ranks, bounds and normalization anchors are those of the full run, and the response says so.
- `list_position` is the row's place in the full unfiltered list. It differs from the point rank wherever an interval school sits above a complete one.
- The default input version is the newest one. For each rule the current run is the one with the highest engine package version, not the latest stored. Every read accepts `package_version` to pin a run.
- Cache policy: no `input_version` gives `private, max-age=60`; an `input_version` alone gives `max-age=300`; an `input_version` with a `package_version` names one stored run and is sent as `immutable`. Every JSON response has a weak `ETag` and answers `If-None-Match` with 304.
- The links to the `schools` table (`school_id`, coordinates) are the one part of a stored run that a later `load_screening_inputs` run may change. Do not keep an immutable response across such a run.

Exports:

- The CSV opens with the method record as `# key: value` lines. Skip the leading `#` lines, then parse the header row. The XLSX has the same record on its first sheet, "Method record".
- `k` cuts the rule's full list: point rows have a point rank of at most `k`. Range rows (`include_ranges`, true by default) are interval schools whose best possible rank is at most `k`. They carry bounds only, in rows flagged `row_kind=range`, after the point rows. The method record always says how many range schools reach `k` after the filters and whether they are included.
- To rebuild the list, keep `row_kind=point`, sort by the record's `sort_columns` descending, then `source_school_name` ascending in code point order. The result is the order of `rank_point`.
- Text parameters (`rule`, `input_version`, `package_version`, `province`, `district`, ids) are rejected with 422 when they contain a control character. Characters that XML cannot hold in stored text are written to the XLSX as Excel's escape, for example `_x0007_`; the CSV keeps them.
- Floats are written in full precision and unknown values are empty cells. Exports are sent with `Cache-Control: private, no-store` and `X-RISE-PNG-Decision-Use: research-prototype-only`.
- A CSV opened in a spreadsheet application may read a name that starts with `=`, `+`, `-` or `@` as a formula. The XLSX stores such names as text. The CSV keeps names exact so that it round-trips.

The failure modes behind the tests are in `tests/SCREENING_API_FAILURE_MODES.md`.
They run against a real PostGIS server, like the screening database tests below.

### Database tests

The screening database tests use a real PostGIS server and skip when `DATABASE_URL` is unset.
Each test creates its own database from a migrated template and drops it afterwards, so `DATABASE_URL` must name `localhost`, `127.0.0.1` or `::1` explicitly, and `PGHOST`, `PGHOSTADDR` and `PGSERVICE` must be unset.
Set `REQUIRE_DATABASE_TESTS=1` to make a missing or refused database fail the run instead of skipping the tests; CI does.

```bash
docker run -d --name rise-screening-pg --platform linux/amd64 -e POSTGRES_PASSWORD=local -p 55432:5432 postgis/postgis:15-3.3
DATABASE_URL=postgresql://postgres:local@localhost:55432/postgres python -m pytest tests -q
docker rm -f rise-screening-pg
```

The failure modes behind each test are in `tests/SCREENING_DB_FAILURE_MODES.md`.

## Local Frontend CORS

The API now allows these frontend origins by default:
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Override them with:

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

## Raster / GCS Config

The backend now reads district-specific preclipped raster assets directly from GCS.

Set:
- `GCS_BUCKET`
- `GCS_DISTRICT_CLIP_PREFIX` or the layer-specific:
  - `GCS_FLOOD_DISTRICT_CLIP_PREFIX`
  - `GCS_LANDCOVER_DISTRICT_CLIP_PREFIX`
  - `GCS_LUMINOSITY_DISTRICT_CLIP_PREFIX`
  - `GCS_ELEVATION_DISTRICT_CLIP_PREFIX`
- optionally `GCS_FLOOD_RASTER_CRS` and `GCS_LANDCOVER_RASTER_CRS` if a source TIFF has bad or missing CRS metadata
- optionally `RASTER_CACHE_DIR` and `RASTER_CACHE_TTL_SECONDS` to control local raster clip caching

If you use preclipped district assets, the backend now expects this object key convention under the configured prefix:

```text
<prefix>/<layer>/<province_norm>/<district_norm>.tif
```

Where:
- `province_norm` mirrors the database `normalize_join_key(...)` intent and is then filename-slugged
- `district_norm` follows the same rule

Example:

```text
rise-png/rasters/district-clips/flood/eastern-highlands/goroka.tif
rise-png/rasters/district-clips/landcover/eastern-highlands/goroka.tif
rise-png/rasters/district-clips/luminosity/eastern-highlands/goroka.tif
rise-png/rasters/district-clips/elevation/eastern-highlands/goroka.tif
```

This keeps district names deterministic, collision-safe across provinces, and easy for the backend to resolve from the existing `province` + `district` request parameters.

For local auth, use either:
- `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json`
- or Application Default Credentials from `gcloud`

For Cloud Run later, prefer workload identity instead of a JSON key path.

Once the raster dependencies are installed, the API exposes:
- `GET /api/v1/rasters/status`
- `GET /api/v1/rasters/flood/metadata?district=...&province=...`
- `GET /api/v1/rasters/flood/overlay?district=...&province=...&format=png`
- `GET /api/v1/rasters/landcover/metadata?district=...&province=...`
- `GET /api/v1/rasters/landcover/overlay?district=...&province=...&format=png`
- `GET /api/v1/rasters/luminosity/metadata?district=...&province=...`
- `GET /api/v1/rasters/luminosity/overlay?district=...&province=...&format=png`
- `GET /api/v1/rasters/elevation/metadata?district=...&province=...`
- `GET /api/v1/rasters/elevation/overlay?district=...&province=...&format=png`

Overlay responses also include bounds and source metadata in response headers for frontend map integration.
