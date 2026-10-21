# RISE-PNG release runbook

This runbook covers local verification, staging, production, rollback, and the first-hour performance check for the authenticated RISE-PNG application.

## Release gates

Do not deploy while any required GitHub check is red.

The merge gate includes:

- frontend lint, formatting, type checking, Vitest, production audit at critical severity, production build, analyzer output, and gzip bundle budgets;
- Playwright tests of sign-in, the screening workspace, and the check that leaving the workspace releases its WebGL context;
- desktop Lighthouse performance of at least 90 and accessibility of at least 95 for the workspace and the sign-in page;
- API and scoring Ruff checks and pytest suites;
- a clean API Docker build.

The current initial-route JavaScript budget is 250 KiB gzip for the workspace, excluding dynamically loaded map chunks.
The WebGL regression test must keep exactly one context alive across repeated visits to the workspace.

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

1. Apply the additive database migrations in `infra/sql` through the newest file in the reviewed migration workflow.
2. Configure staging Supabase redirects, allowlists, and server-only auth variables from `docs/authentication.md`.
3. Configure the Cloud Run API variables from `infra/cloud-run/README.md`, including exact staging CORS origins and `AUTH_REQUIRED=true`.
4. Deploy the API image and confirm `/healthz` returns 200 with `X-Request-ID` and `X-Content-Type-Options: nosniff`.
5. Confirm unauthenticated `/api/v1` requests return the structured 401 response.
6. Deploy the frontend with its staging API origin and server-only Supabase variables.
7. Sign in with one allowlisted account and verify the workspace list and map, a school's card, and a CSV export.
8. Verify one unlisted account is rejected and a random-origin CORS preflight has no allow-origin response header.
9. Hold staging for at least one normal briefing session and inspect client errors, API error rate, and latency.

## Production deployment

1. Record the currently healthy Vercel deployment ID, Cloud Run revision, container image digest, and database migration version.
2. Confirm a recent Supabase backup and verify that the migrations are applied.
3. Deploy the immutable API image first with zero traffic, then send an authenticated health request and one `/api/v1/screening/rules` request to the new revision.
4. Move a small traffic share to the new API revision and monitor for 15 minutes.
5. Deploy the frontend preview against the canary API revision and run the sign-in and workspace flow.
6. Promote the frontend and API only when error rate is within 10 percent of baseline and p95 latency is within 20 percent of baseline.
7. Monitor for one hour after promotion and keep the release owner available.

## First-hour monitoring

Check these signals at deployment, 15 minutes, and 60 minutes:

- frontend JavaScript errors and Core Web Vitals;
- Cloud Run 4xx and 5xx rate by route;
- API p50, p95, and p99 latency;
- database pool saturation and Supabase connection count;
- Cloud Run CPU and memory;
- WebGL context count after repeated visits to the workspace;
- failed sign-ins, structured 401 volume, and CORS failures;
- export response failures.

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
5. Do not reverse an additive migration during an application rollback.
6. Recheck health, authenticated screening data, workspace rendering, and exports.
7. Record the incident window, request IDs, affected release identifiers, and follow-up owner.

## Performance baseline

Reopen performance work if the workspace keeps more than one WebGL context alive, the workspace crosses 250 KiB gzip initial JavaScript, desktop Lighthouse performance falls below 90, or production p95 increases by more than 20 percent without an explained data change.

## Dependency security baseline

The application runs on Next.js 16.4 with React 19.2.
The production dependency audit must report zero known vulnerabilities before release.
CI blocks high and critical production advisories and preserves the full audit output for release review.
