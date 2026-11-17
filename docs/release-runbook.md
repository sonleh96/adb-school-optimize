# RISE-PNG release runbook

This runbook covers local verification, production releases, rollback, and the first-hour performance check for RISE-PNG.
Sign-in is off in production (`AUTH_REQUIRED` is unset on Cloud Run and Vercel).
The steps that apply only with sign-in on say so.

## Release gates

Do not deploy while any required GitHub check is red.

The merge gate includes:

- frontend lint, formatting, type checking, Vitest, production audit at critical severity, production build, analyzer output, and gzip bundle budgets;
- Playwright tests of sign-in, the screening workspace, and the check that leaving the workspace releases its WebGL context;
- desktop Lighthouse performance of at least 95 and accessibility of 100 for the homepage, and of at least 90 and 95 for the workspace and the sign-in page;
- API and scoring Ruff checks and pytest suites;
- a clean API Docker build.

The workspace's initial JavaScript budget is 230 KiB gzip: every chunk the prerendered `/screening` names, measured on the `npm run build` output.
The homepage's is 138 KiB gzip, measured the same way on `/`, which loads only the framework's own script.
The map's chunks load later and must stay out of it.
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

## Production release

There is no staging environment.
A Cloud Run revision that takes no traffic and a Vercel preview built against it stand in for one.
The web app deploys to production from `main`: Vercel builds every push to `main`, so a merge into `main` is a production web release.

### Before the cutover

1. Record the current Vercel production deployment ID, the serving Cloud Run revision and its image digest, and the newest migration applied to the database.
   The database does not track migrations, so the previous release record is where the newest applied file is written down.
2. Back up the database with `pg_dump -Fc -n public --no-owner --no-privileges`, keep the file outside the repository, and write down the restore command next to it.
   `pg_dump` must be the server's major version or newer (Postgres 17 on the current project).
   Supabase Pro keeps daily backups as well.
3. Apply the new files in `infra/sql`, in file order: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>`.
   Each file from `005` on wraps itself in one transaction; `001` to `004` do not, so a fresh database takes those with `psql -1`.
   Migrations are additive, apart from drops of objects nothing reads, so the live API keeps working on the new schema.
4. Build the API image from the release commit and tag it `<yyyymmdd>-<short sha>`.
5. Deploy it with no traffic under a release tag: `gcloud run deploy rise-png-api --project adb-sr --region asia-southeast1 --image <image> --no-traffic --tag rel-<yyyymmdd>`.
   `gcloud run services describe rise-png-api --project adb-sr --region asia-southeast1` prints the tag's URL.
6. Check the tag's URL:
   - `GET /` returns 200 with `X-Request-ID` and `X-Content-Type-Options: nosniff`.
     Use `/` on Cloud Run: its front end answers `/healthz` itself with a 404, so the request never reaches the API.
   - `GET /openapi.json` lists the routes the release adds, and `GET /api/v1/screening/rules` returns 200.
   - `python services/api/scripts/check_exp21.py <tag url> <EXP-21 results dir> <report.json>` passes: the `additive_u` list of `paper-2026-10-12` still equals EXP-21.
     The results dir is `experiments/decision_rules/EXP-21-v0.1.0-20261012/results` under the methodology reference root; with sign-in on, the script reads a token from `API_TOKEN`.
   - With sign-in on: an unauthenticated `/api/v1` request returns the structured 401, and an allowlisted token returns 200.
7. Build a preview of the release commit against the tag: from the repository root of a clean checkout of that commit, run `vercel deploy --yes --scope sonleh96s-projects --build-env API_PROXY_TARGET=<tag url>`.
   The Vercel project's root directory is `apps/web`, and the CLI uploads the working tree as it is on disk.
   A preview calls the API through its own `/api/v1` proxy, and `API_PROXY_TARGET` picks the proxy's target (`apps/web/scripts/api-origin.mjs`).
   `NEXT_PUBLIC_API_BASE_URL` must stay a Production-only variable in Vercel: set for Preview, it sends the preview's browser straight to the production API and the check below proves nothing.
8. Open `/screening` and `/explore` on the preview, confirm the list, the map and a school's card load, and confirm in the Cloud Run request logs that the preview's requests reached the tag's URL.

### Cutover

9. Release first the side that works with the other's old version.
   That is usually the API, because its changes are additive; if neither side does, announce a short break.
   Move all traffic to the new revision: `gcloud run services update-traffic rise-png-api --project adb-sr --region asia-southeast1 --to-tags rel-<yyyymmdd>=100`.
10. Merge the release branch into `main` with a merge commit.
   Vercel builds the merge with the Production variables and moves the production domain to it.
11. Check production: `/screening` and `/explore` load their data, every `/api/v1` call returns 200, and `check_exp21.py` passes against the production API.
12. Record the new Cloud Run revision, image digest, Vercel deployment ID and applied migrations, and the rollback commands with the previous values from step 1.
13. Monitor for one hour, as below, and keep the release owner available.

### Before turning sign-in on

Configure the Supabase redirects, allowlists and server-only variables from `docs/authentication.md` and the Cloud Run variables from `infra/cloud-run/README.md`.
Then sign in with one allowlisted account and check the workspace, a school's card and a CSV export, and check that an unlisted account is refused and that a preflight from a random origin gets no allow-origin header.

## First-hour monitoring

Check these signals at deployment, 15 minutes, and 60 minutes:

- frontend JavaScript errors and Core Web Vitals;
- Cloud Run 4xx and 5xx rate by route;
- API p50, p95, and p99 latency;
- database pool saturation and Supabase connection count;
- Cloud Run CPU and memory;
- WebGL context count after repeated visits to the workspace;
- CORS failures;
- with sign-in on, failed sign-ins and the volume of structured 401 responses;
- export response failures.

Advance when error rate is within 10 percent and p95 latency is within 20 percent of the prior healthy baseline.
Hold and investigate at a 10 to 100 percent error increase or a 20 to 50 percent p95 increase.
Roll back at more than twice the baseline error rate, more than a 50 percent p95 increase, a data-integrity concern, or a new security defect.

## Rollback

Frontend rollback target is the previously recorded healthy Vercel deployment.
API rollback target is the previously recorded healthy Cloud Run revision and image digest.

1. Restore 100 percent API traffic to the previous healthy Cloud Run revision: `gcloud run services update-traffic rise-png-api --project adb-sr --region asia-southeast1 --to-revisions <revision>=100`.
2. Roll the web back to the previous healthy Vercel deployment: `vercel rollback <deployment id>`.
   After a rollback, a push to `main` no longer moves the production domain; `vercel promote <deployment id>` of the fixed deployment turns that back on.
3. Leave `AUTH_REQUIRED` as it is during rollback.
4. Do not reverse a migration during an application rollback: the previous release runs on the new schema.
   Restore the backup only for a data-integrity problem.
5. Recheck `GET /` on the API, the screening data, the workspace and exports.
6. Record the incident window, request IDs, affected release identifiers, and follow-up owner.

## Performance baseline

Reopen performance work if the workspace keeps more than one WebGL context alive, the workspace crosses 230 KiB gzip initial JavaScript, desktop Lighthouse performance falls below 90, or production p95 increases by more than 20 percent without an explained data change.

## Dependency security baseline

The application runs on Next.js 16.4 with React 19.2.
The production dependency audit must report zero known vulnerabilities before release.
CI blocks high and critical production advisories and preserves the full audit output for release review.
