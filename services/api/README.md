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

### Database tests

The screening database tests use a real PostGIS server and skip when `DATABASE_URL` is unset.
Each test creates its own database from a migrated template and drops it afterwards, so the server must be local.

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
