# Supabase and FastAPI Integration

## Short Answer

No. It is not just a matter of providing API keys.

For this stack, the clean setup is:
- frontend uses the Supabase `anon` key only if it needs direct Supabase features later
- FastAPI uses either a direct Postgres connection string to Supabase Postgres, or the Supabase service-role key for specific Supabase APIs
- Cloud Run gets its own environment variables for database access, Supabase project metadata, and GCS access

For the current architecture, the recommended backend pattern is:
- FastAPI talks directly to Supabase Postgres/PostGIS for application data
- FastAPI uses the service-role key only when it needs Supabase-specific APIs
- frontend calls FastAPI, not Supabase, for scoring/business logic

## Recommended Integration Steps

### 1. Create the Supabase project

- Create a Supabase project
- Enable the PostGIS extension in the database
- Run [001_core_schema.sql](/Users/sonle/Documents/work/ADB/adb-school-optimize/infra/sql/001_core_schema.sql)

### 2. Decide how FastAPI will access Supabase

Recommended:
- direct Postgres connection from FastAPI to Supabase Postgres

Use direct DB access for:
- school and district queries
- saving scenarios
- writing score outputs
- spatial queries

Use Supabase service APIs only if needed for:
- storage
- auth administration
- Supabase-specific management endpoints

### 3. Prepare the required secrets

At minimum you should collect:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `GCS_BUCKET`
- `GOOGLE_APPLICATION_CREDENTIALS` or workload identity configuration

Notes:
- `SUPABASE_ANON_KEY` is for browser-safe public access patterns, not privileged backend writes
- `SUPABASE_SERVICE_ROLE_KEY` is sensitive and should stay server-side only
- `DATABASE_URL` is what FastAPI should primarily use for Postgres/PostGIS operations

### 4. Configure local development

Set environment variables locally, for example in `.env`:

```env
DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
GCS_BUCKET=<bucket-name>
```

### 5. Configure Cloud Run

In Cloud Run, set:
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GCS_BUCKET`

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend.

### 6. Load the data

You then need an ingestion step to:
- normalize join keys
- insert districts
- insert schools
- insert auxiliary vector layers
- register raster layers
- create the default scoring scenario
- persist the default scored results

From this repo, the intended order is:

```bash
cd services/api
pip install -e .
pip install -e ../../packages/school_scoring
python -m app.ingestion.load_core_data
python -m app.ingestion.seed_default_scenario
uvicorn app.main:app --reload
```

### 7. Add database access in FastAPI

Your FastAPI app will typically need:
- database session setup
- repository/query layer
- scenario CRUD
- export endpoints
- raster overlay endpoints

### 8. Handle security correctly

Even if auth is disabled for v1:
- do not ship service-role secrets to the client
- keep write access on the backend only
- use least-privilege DB roles where possible

## Practical Recommendation

For this project:
- use `DATABASE_URL` as the main FastAPI integration point
- keep `SUPABASE_SERVICE_ROLE_KEY` available only for server-side Supabase features
- keep `SUPABASE_ANON_KEY` for potential frontend use later, but do not rely on it for the core app

That keeps the architecture simple and compatible with PostGIS-heavy queries.
