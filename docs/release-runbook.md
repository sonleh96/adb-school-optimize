# RISE-PNG release runbook

This runbook covers local verification, staging, production, rollback, and the first-hour performance check for the authenticated RISE-PNG application.

## Release gates

Do not deploy while any required GitHub check is red.

The merge gate includes:

- frontend lint, formatting, type checking, Vitest, production audit at critical severity, production build, analyzer output, and gzip bundle budgets;
- Playwright sign-in, Overview renderer, District URL state, Scenario run, and export download smoke tests;
- desktop Lighthouse performance of at least 90 and accessibility of at least 95 for Overview and District Explorer;
- API and scoring Ruff checks and pytest suites;
- a clean API Docker build.

The current initial-route JavaScript budget is 250 KiB gzip per application route, excluding dynamically loaded map chunks.
The Overview renderer regression must remain bounded after repeated compare and score interactions.

## Local verification

1. Copy the documented frontend and API environment examples without committing secrets.
2. Keep `AUTH_REQUIRED=false` or use the documented non-production bypass for contributor work.
3. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build` in `apps/web`.
4. Run `npm run bundle:check`, `npm run test:e2e`, and `npm run lighthouse`.
5. Treat the browser commands as self-contained gates because each compiles a production build against the deterministic local fixture API before launching it.
6. Run Ruff and both Python test suites using the commands in `.github/workflows/ci.yml`.
7. Confirm no server remains on ports 3000, 3105, 4100, 8000, or 8001 after verification.

The C5 browser launcher uses deterministic local API fixtures and never contacts production data services.
Lighthouse blocks third-party basemap tiles and evaluates the median of three runs so the release gate measures application work without public tile-network variance.

## Staging deployment

1. Apply additive database migrations through `infra/sql/004_scenario_archive.sql` in the reviewed migration workflow.
2. Configure staging Supabase redirects, allowlists, and server-only auth variables from `docs/authentication.md`.
3. Configure the Cloud Run API variables from `infra/cloud-run/README.md`, including exact staging CORS origins and `AUTH_REQUIRED=true`.
4. Deploy the API image and confirm `/healthz` returns 200 with `X-Request-ID` and `X-Content-Type-Options: nosniff`.
5. Confirm unauthenticated `/api/v1` requests return the structured 401 response.
6. Deploy the frontend with its staging API origin and server-only Supabase variables.
7. Sign in with one allowlisted account and verify Overview, School Explorer, District Explorer, Scenario Lab, raster display, and export download.
8. Verify one unlisted account is rejected and a random-origin CORS preflight has no allow-origin response header.
9. Hold staging for at least one normal briefing session and inspect client errors, API error rate, and latency.

## Production deployment

1. Record the currently healthy Vercel deployment ID, Cloud Run revision, container image digest, and database migration version.
2. Confirm a recent Supabase backup and verify that the archive migration is additive and applied.
3. Deploy the immutable API image first with zero traffic, then send an authenticated health and one-record schools request to the new revision.
4. Move a small traffic share to the new API revision and monitor for 15 minutes.
5. Deploy the frontend preview against the canary API revision and run the critical sign-in and Overview flow.
6. Promote the frontend and API only when error rate is within 10 percent of baseline and p95 latency is within 20 percent of baseline.
7. Monitor for one hour after promotion and keep the release owner available.

## First-hour monitoring

Check these signals at deployment, 15 minutes, and 60 minutes:

- frontend JavaScript errors and Core Web Vitals;
- Cloud Run 4xx and 5xx rate by route;
- API p50, p95, and p99 latency;
- database pool saturation and Supabase connection count;
- Cloud Run CPU and memory;
- map canvas count after repeated Overview interactions;
- failed sign-ins, structured 401 volume, write 429 volume, and CORS failures;
- raster and export response failures.

Advance when error rate is within 10 percent and p95 latency is within 20 percent of the prior healthy baseline.
Hold and investigate at a 10 to 100 percent error increase or a 20 to 50 percent p95 increase.
Roll back at more than twice the baseline error rate, more than a 50 percent p95 increase, a data-integrity concern, or a new security defect.

## Rollback

Frontend rollback target is the previously recorded healthy Vercel deployment.
API rollback target is the previously recorded healthy Cloud Run revision and image digest.

1. Stop traffic promotion immediately.
2. Restore 100 percent API traffic to the previous healthy Cloud Run revision.
3. Promote the previous healthy Vercel deployment.
4. Keep `AUTH_REQUIRED=true` during rollback.
5. Do not reverse the additive scenario archive migration during an application rollback.
6. Recheck health, authenticated schools data, Overview rendering, and exports.
7. Record the incident window, request IDs, affected release identifiers, and follow-up owner.

If the defect is limited to authenticated writes, set `WRITE_OPERATIONS_ENABLED=false` as the immediate containment control while read-only analysis remains available.

## Performance baseline

The 2026-08-10 audit found 247 canvases after an Overview load at zoom 8 and 459 after one compare toggle because each feature allocated its own Leaflet canvas renderer.
After C1, the same flows remain at one to two shared canvases through repeated score, compare, selection, and zoom interactions.
See `docs/performance-audit-2026-08-10.md` for the full measurements and architecture changes.

Reopen performance work if the browser regression exceeds the shared-canvas bound, a route crosses 250 KiB gzip initial JavaScript, desktop Lighthouse performance falls below 90, or production p95 increases by more than 20 percent without an explained data change.

## Known dependency review

The August 2026 production dependency audit reports Next.js-linked PostCSS and Sharp advisories whose automated fix is a Next.js 16 major upgrade.
They are not introduced by the Supabase integration and remain tracked for a dedicated framework upgrade review by 2026-09-15.
CI blocks critical production advisories immediately and preserves the full audit output for release review.
