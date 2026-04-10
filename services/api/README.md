# API Service

Planned `FastAPI` backend hosted on Cloud Run.

Responsibilities:
- metadata endpoints
- school and district query endpoints
- scoring scenario CRUD
- scoring execution via `packages/school_scoring`
- CSV/XLSX export endpoints
- raster overlay generation and district-based clipping

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

## Local Frontend CORS

The API now allows these frontend origins by default:
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Override them with:

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

## Raster / GCS Config

Raster clipping is still not implemented, but the backend now has a stable config contract for it.

Set:
- `GCS_BUCKET`
- either `GCS_FLOOD_RASTER_PATH` and `GCS_LANDCOVER_RASTER_PATH`
- or `GCS_RASTER_PREFIX` and let the API resolve `flood` and `landcover` under that prefix
- optionally `GCS_FLOOD_RASTER_CRS` and `GCS_LANDCOVER_RASTER_CRS` if a source TIFF has bad or missing CRS metadata
- optionally `RASTER_CACHE_DIR` and `RASTER_CACHE_TTL_SECONDS` to control local raster clip caching

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

Overlay responses also include bounds and source metadata in response headers for frontend map integration.
