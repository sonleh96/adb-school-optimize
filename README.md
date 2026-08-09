# adb-school-optimize

Decision-support platform for prioritizing secondary school investments in Papua New Guinea.

The target production stack is:
- `Next.js` frontend on Vercel
- `FastAPI` backend on Cloud Run
- `Supabase Postgres/PostGIS` for vector and tabular data
- `GCS` for source rasters
- standalone Python `school_scoring` package for deterministic scoring

The current repository contains the original notebook prototypes and a repo-ready architecture scaffold for the app build.

## Key Docs

- [Architecture](docs/architecture.md)
- [Core SQL Schema](infra/sql/001_core_schema.sql)
- [Scoring Module Build Instructions](build_instructions/codex_school_scoring_module_instructions.md)

## Workspace Layout

```text
apps/web/                 Next.js frontend
services/api/             FastAPI backend
packages/school_scoring/  Reusable scoring engine
infra/sql/                Postgres/PostGIS schema and database assets
infra/cloud-run/          Deployment placeholders for the API/raster service
infra/vercel/             Deployment placeholders for the frontend
docs/                     Architecture and implementation docs
datasets/                 Local source data used for ingestion and reference
```

## Current Product Scope

V1 includes:
- school map with synced table and district filter
- district choropleth with switchable indicators
- scoring scenario persistence with adjustable weights
- ranked shortlist export for the full school list
- runtime raster clipping for raster layers only

## Data Notes

Current local source files live in [datasets](/Users/sonle/Documents/work/ADB/adb-school-optimize/datasets). For production, vector/tabular data should be ingested into Supabase/PostGIS and source rasters should live in GCS.
