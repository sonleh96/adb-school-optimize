# adb-school-optimize

Decision-support platform for screening secondary schools in Papua New Guinea.

The production stack is:
- `Next.js` frontend on Vercel
- `FastAPI` backend on Cloud Run
- `Supabase Postgres/PostGIS` for schools, screening inputs and stored results
- standalone Python `school_scoring` package for the deterministic screening engine

## Key docs

- [Architecture](docs/architecture.md)
- [API service and screening routes](services/api/README.md)
- [Screening engine](packages/school_scoring/README.md)
- [Release runbook](docs/release-runbook.md)

## Workspace layout

```text
apps/web/                 Next.js frontend, the screening workspace
services/api/             FastAPI backend and loader commands
packages/school_scoring/  Screening engine
infra/sql/                Postgres/PostGIS migrations
infra/cloud-run/          Deployment notes for the API
infra/vercel/             Deployment notes for the frontend
docs/                     Architecture, security and release docs
prototype/                Design prototype of the workspace
```

## Notebooks

Strip saved outputs before committing a notebook, for example with `jupyter nbconvert --clear-output --inplace <file>`.
CI runs `scripts/check_notebooks.py` and fails any pull request that adds outputs, execution counts, output-related cell metadata, cell attachments or saved widget state.
Remove attachments, such as pasted images, and widget state in Jupyter, because `--clear-output` may leave them.

## Product scope

The homepage at `/` explains the project, and the workspace opens at `/screening`.
The workspace shows a ranked list of schools under seven rules, with the reason for each school's place, and a map synced to the list.
The API also serves rule comparisons and CSV and XLSX exports of the shortlist and of the schools that need a record check.
