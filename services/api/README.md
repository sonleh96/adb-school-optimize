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
2. Set `DATABASE_URL` and `SUPABASE_URL`.
3. Install the local scoring package so the API can import it: `pip install -e ../../packages/school_scoring`.
4. Install the API package dependencies: `pip install -e .`
5. Run `python -m app.ingestion.load_core_data`.
6. Run `python -m app.ingestion.seed_default_scenario`.
7. Start the API with `uvicorn app.main:app --reload`.
