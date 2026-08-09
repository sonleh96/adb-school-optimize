# RISE-PNG: Prototype-to-Product Improvement Plan

Status: **approved with amendments** (2026-08-09).
Branch: `plan/prototype-to-product`.
Date: 2026-08-09.
Approved after code audit + live Vercel/Supabase/Cloud Run inspection.

This plan covers implementation, frontend, and performance work to move the dashboard from prototype to internal-production quality.
Scoring methodology and data content are explicitly out of scope.

## Locked decisions

From scoping discussion on 2026-08-09, plus plan review on the same day:

- Scope: full stack (frontend, performance, backend hardening).
- Design system: Tailwind CSS v4 + shadcn/ui.
- Deployment target: internal production for ADB staff, so auth is a must-have.
- Basemap: CARTO Positron (free, no API key, neutral styling suited to choropleths).
- Typography: Space Grotesk (headings/brand) + Inter (UI body) + Spectral (methodology prose only).
- Auth v1: email allowlist via Supabase Auth. Google Workspace SSO is a follow-up if ADB IT requires it.
- Scenarios: soft-delete / archive only (no hard delete in UI). Preserve audit trail.
- PR order: sequential Phases 0 → 0.5 → 1 → 2 → 3 → 4 → 5 → 6. Phase 1 and 2 may overlap only after Phase 0.5 lands.
- Pre-flight: rebase/sync this branch onto `origin/main` (`0c55e18`+) under the `sonleh96` GitHub identity before any implementation PR. Do not push from `sonle-lm`.

## Goals and non-goals

Goals:

- The app reads as a designed product: consistent spacing, typography, states, and iconography.
- Core interactions feel instant at current data scale and degrade gracefully at 10x scale.
- The API is safe to expose to the ADB network: authenticated, compressed, cache-aware, pooled.
- Every change is verifiable: lint, typecheck, tests, and build run in CI on every PR.

Non-goals:

- No changes to scoring formulas, weights, or indicator definitions.
- No data re-ingestion or schema redesign beyond additive changes (indexes, a raster manifest table, RLS policies, soft-delete columns if needed).
- No new product features beyond what current pages already promise (dead UI gets implemented or removed, not extended).
- No dark mode in this pass (tokens will not preclude it later).

## Target state at a glance

Frontend:

- Tailwind v4 + shadcn/ui primitives replace the 1,540-line hand-rolled `globals.css`.
- Route-based shell lifted into `app/layout.tsx`; the dead `DashboardShell.tsx` is deleted.
- TanStack Query owns all server state with dedupe, caching, and retries.
- URL search params hold view state (district, indicator, scenario, selection) so views are shareable.
- Maps render points on a canvas renderer with memoized GeoJSON layers and CARTO Positron tiles.

Backend:

- GZip middleware, per-route cache headers, and ETags on immutable raster artifacts.
- Lifespan-managed `psycopg` connection pool instead of connect-per-request.
- Supabase Auth JWT verification on all `/api/v1` routes; CORS locked to the app origin.
- Pinned dependencies and a reproducible Docker build.
- Raster clip metadata served from a precomputed manifest, not a live clip.

## Phase 0 - Foundations and hygiene (0.5-1 day, PR 1) — APPROVED

Goal: a clean base that later diffs stay readable against.

Changes:

- Commit the pending second-pass fixes first (ingestion NAM_1/NAM_2 preflight fallback, map-height CSS, NEXT_DIST_DIR override, env examples). Resolve the queries.py vs 003 migration provenance drift intentionally: either apply 003 and keep selecting score_version/run_manifest, or defer provenance reads.
- Sync branch onto current `origin/main` before other edits (done 2026-08-09).
- Delete `apps/web/components/DashboardShell.tsx` (dead tab-based shell superseded by routes).
- Fix README deploy-target wording (says Vercel; production API is Cloud Run per docs/architecture.md and infra/cloud-run).
- Remove or implement dead UI: the no-op "ON SCREEN" distribution scheme button, the duplicated "District Ranking" heading in `DistrictExplorer.tsx`.
- Move root prototype assets (`test_plot.ipynb`, `score_calculations.ipynb`, `aqi_dask.py`, `__pycache__/`) under `prototype/` to clean the repo root; update `docs/architecture.md` links.
- Add ESLint (`eslint-config-next`) and Prettier configs; wire `npm run lint` and `npm run format`.
- Add Ruff config for `services/api` and `packages/school_scoring`.
- Pin Python dependencies with a lockfile (`uv pip compile` or pip-tools) for both packages; pin the Docker base image by digest.
- Add `.github/workflows/ci.yml`: frontend lint + typecheck + build, API pytest + ruff, scoring package pytest, Docker build check.
- Align Cloud Run health route with code (`/healthz` must return 200 in production, or document the intentional `/` health and update probes).
- Commit a root `README.md` refresh for the new dev workflow.

Acceptance: CI green on the PR itself; no runtime behavior change beyond health-route alignment; `git grep` shows no references to deleted files.

## Phase 0.5 - Immediate security lockdown (0.5 day, PR 1b) — APPROVED (added from live audit)

Goal: close the open Data API and anonymous signup holes before any UX work. Does not wait for full app auth.

Changes (ops + minimal code/docs):

- Enable RLS on all public tables (`districts`, `schools`, `school_scores`, `scoring_scenarios`, `layer_catalog`, `vector_layer_features`) with deny-by-default policies for `anon` / `authenticated` until the FastAPI JWT path is live.
- Prefer: keep the browser talking only to Cloud Run (current architecture); do not expose a Supabase `anon` key in the Next.js client. Document that Data API is not a product surface.
- Disable public signups in Supabase Auth; keep email provider; restrict invites to an allowlist.
- Review and fix `ranked_school_scores_latest` SECURITY DEFINER view (recreate as SECURITY INVOKER or lock down grants).
- Confirm service-role / DB URL credentials used by Cloud Run are not present in Vercel public env.
- Add a short `docs/security-baseline.md` capturing the above.

Acceptance: Security Advisor RLS errors cleared or explained as intentional with grants revoked from `anon`; signup from a non-allowlisted email fails; unauthenticated PostgREST reads return empty/denied.

## Phase 1 - Design system and app shell (2-3 days, PR 2) — APPROVED

Goal: the visual foundation every later page uses.

Changes:

- Add Tailwind v4 (`@tailwindcss/postcss`) and initialize shadcn/ui; keep `globals.css` to tokens and base styles only.
- Token set: ADB-adjacent navy/blue palette, neutral grays, semantic success/warning/danger, spacing and radius scale, elevation via borders not blur.
- Typography (locked): Space Grotesk for headings and brand, Inter for UI body text, Spectral retained only for long-form methodology prose. Note: `layout.tsx` currently binds Spectral as `--font-body` app-wide - this phase performs the swap, it is not greenfield.
- shadcn components to add: Button, Card, Table, Tabs, Badge, Select, Slider, Command (combobox), Dialog, Sheet, Tooltip, Skeleton, Alert, Sonner (toasts), DropdownMenu, Separator.
- New `AppShell` in `app/layout.tsx`: brand block, route-aware nav (Links with `usePathname`), active-scenario badge, user menu slot (wired in Phase 5).
- Shared state components: `LoadingSkeleton`, `EmptyState`, `ErrorState` with retry; raw API error text never reaches the UI.
- Shared `lib/format.ts`: number, percent, and per-indicator unit formatters used by every table and card.
- Per-route metadata, favicon, and manifest.
- Replace the unicode download glyph and "PNG" text button with lucide icons.

Acceptance: all five pages render on the new shell with no `!important` and no inline `style={{}}` layout hacks; Lighthouse accessibility score >= 95 on the Overview page; visual review sign-off.

## Phase 2 - Data layer and API performance (2 days, PR 3; after Phase 0.5, may overlap late Phase 1) — APPROVED

Goal: kill the avoidable network and rendering waste.
Live baseline: choropleth ~1.86 MB uncompressed today; schools list ~153 KB; no gzip.

Frontend changes:

- Introduce TanStack Query; delete hand-rolled `useEffect` fetch loops and the unbounded layer-cache `Map` (replaced by query cache with bounded stale times).
- Remove `cache: "no-store"` as a default; cache policy becomes per-resource.
- Merge the duplicate full-school-list fetch in `SchoolExplorer` (one query, derived search corpus).
- Debounced, keyboard-navigable `Combobox` replaces both search inputs and the `setTimeout` blur hack.

API changes:

- Add `GZipMiddleware` (minimum size 1 KB).
- Add `Cache-Control` per route class: immutable + content-hash ETag for raster overlays, 5-minute shared cache for meta/district endpoints, private no-store for scenario mutations.
- Replace connect-per-request with a lifespan-managed `psycopg_pool.ConnectionPool`; read `DATABASE_URL` through the pooler port in production notes.
- Cache `layer_catalog` in-process with a short TTL instead of querying per vector-feature request.
- Enforce query validation: wire the unused `SchoolFilters` model, cap `limit` at 5000 everywhere (server-side `Query(le=5000)` on schools and layer-features; lower the client's `VECTOR_LIMIT_DEFAULT` 30000 to match).
- Require bbox or province/district scoping for heavy vector layers before querying.
- Fix `SCHOOLS_SQL` to filter on `province_norm`/`district_norm` so the existing index is used.
- Strip credential/source paths from `/rasters/status` responses.
- Standardize all error responses on the structured `ApiError` shape (schools/scenarios currently return plain `{"detail"}`).
- Carry `school_id` through scoring as a passthrough column and persist scores keyed by ID, not school name.
- Add a cheap raster metadata path: a `raster_clips` manifest table written at ingestion time; `/metadata` reads the manifest instead of performing a clip.
- Add bounded eviction to the raster disk cache (max size + LRU sweep).

Acceptance: district choropleth transfer drops from ~1.86 MB uncompressed to under ~400 KB gzipped (geometry simplify may ship in this PR or Phase 3; measure both); `/api/v1/meta/layers` p95 latency under 50 ms warm; no endpoint returns raw stack text; pytest suite extended for cache headers and pool behavior.

## Phase 3 - Map experience (2-3 days, PR 4) — APPROVED (+ vector scale amendment)

Goal: maps that feel like a product, not a GIS demo.

Changes:

- Basemap: CARTO Positron (`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`) with proper attribution on all maps.
- Render all point layers through `L.canvas()` (`preferCanvas` on `MapContainer`); one memoized `GeoJSON` component per vector layer instead of per-feature components.
- District choropleth: server-side `ST_SimplifyPreserveTopology` with a tolerance parameter plus `ST_AsGeoJSON` coordinate rounding; client caches per indicator.
- Access point layers: canvas-rendered circle markers; at national zoom, request server-side counts instead of raw points (additive endpoint, used only when zoomed out).
- **Vector scale (live finding):** `vector_layer_features` is ~4.84M rows / ~2.4 GB. Do not ship raw national dumps to the browser. Add bbox + zoom-gated queries (and/or server-side aggregation) for heavy layers; document a follow-up for MVT/tiling if bbox paging is still too heavy.
- Redesign the layer panel as a grouped shadcn panel with per-layer legends inline; remove the overlay legend panel that floats over the map.
- Popups become a designed school/district detail card (shadcn `Card` in a Leaflet popup or a side panel on selection); until then, escape all feature properties in `bindPopup` HTML strings (current AQI popup is an XSS vector).
- Map screenshot export: keep the DOM-compositing fallback, drop the unpkg `leaflet-image` script injection (third-party runtime dependency, unmaintained since 2015).
- Fix map heights to fluid containers (`min-h` with aspect fallback) instead of fixed 760 px.

Acceptance: heavy vector layers never request unbounded national feature dumps; district page loads with simplified geometry; pan/zoom stays interactive on a mid-range laptop; no `window.L` global or remote script injection remains.

## Phase 4 - Page-by-page UX rebuild (3-4 days, PR 5) — APPROVED

- Overview (`/all-schools`): hero metrics row (schools, districts, median priority, last scoring run), national map with district choropleth toggle, ranked table with sortable columns and row virtualization if needed, designed selected-school panel.
- School Explorer (`/school-explorer`): district + school comboboxes synced to URL params, layer panel, detail panel with grouped indicator sections and formatted values, ranked table synced to selection.
- District Explorer (`/district-explorer`): indicator select with units and direction note, histogram with working color-scheme behavior (implement "on screen" or remove it), ranking table with top-N highlight, selected-district card with formatted values.
- Scenario Lab (`/scenario-lab`): weight editor with per-group sum indicators and dirty state, run confirmation with validation errors surfaced inline, saved-scenario table with rename/archive (soft-delete) via dropdown, result preview with diff-against-default toggle, export buttons with progress feedback.
- Methodology (`/methodology-lab`): prose layout with table-of-contents rail, KaTeX loaded via dynamic import, weight tables rendered from the active scenario.

Acceptance: every interactive element is keyboard-operable; every async region has loading, empty, and error states; no raw `String(value)` rendering remains; visual review sign-off per page.

## Phase 5 - Auth and production hardening (2 days, PR 6) — APPROVED

Goal: safe to put behind the ADB network. Builds on Phase 0.5 RLS baseline.

Changes:

- Supabase Auth: email allowlist (SSO deferred); `@supabase/ssr` session handling with a sign-in route; `middleware.ts` guards all app routes.
- API: FastAPI dependency verifying Supabase JWTs (JWKS fetch with cache, HS256 legacy fallback); all `/api/v1` routes require a valid user; `created_by` populated from the token, not the request body.
- After JWT path is live: add least-privilege RLS policies for authenticated roles if any browser→Supabase access is introduced; otherwise keep Data API fully closed and document service-role-only server access.
- CORS locked to the Vercel production and preview origins; remove `allow_credentials` wildcard combination.
- Basic rate limiting on scoring and export endpoints.
- Structured JSON logging with request IDs; Cloud Run log-based alerts on 5xx.
- Enable Vercel Web Analytics + Speed Insights (low cost, high signal for internal prod).
- Deploy plumbing: `infra/vercel` project config, Cloud Run service YAML, secret wiring documented; staging and production service pair. Redeploy so production tracks `main` (currently stale since May 28).

Acceptance: unauthenticated requests get 401 with a structured error; signed-in allowlisted flow works end to end; CORS preflight from a random origin fails; logs show request IDs; production deploy SHA matches the release commit.

## Phase 6 - QA and launch checklist (1-2 days, PR 7) — APPROVED

- Vitest + Testing Library unit tests for `lib/format.ts`, query hooks, and the weight-normalization logic.
- Playwright smoke suite: sign-in, Overview load, district switch, scenario run, export download.
- `@next/bundle-analyzer` report in CI with a size budget (initial route JS under 250 KB gz excluding the map chunk).
- Lighthouse CI on Overview and District Explorer: performance >= 90 desktop, accessibility >= 95.
- Runbook: local dev, staging deploy, production deploy, rollback.

## Verification strategy

- Every PR runs: ESLint, Prettier check, `tsc --noEmit`, `next build`, Ruff, both pytest suites, Docker build.
- Performance claims verified with before/after numbers in each PR description (payload sizes, Lighthouse, p95 from Cloud Run logs).
- Visual review per page against the sign-off checklist in Phase 4 before merge.

## Risks and mitigations

- Tailwind/shadcn migration touches every component: mitigated by doing it in Phase 1 before page rebuilds, so pages are built once on the new system.
- Supabase Auth depends on ADB identity policy: mitigated by email allowlist fallback that needs no IdP integration.
- Geometry simplification could visually distort small districts: mitigated by conservative tolerance and a review screenshot per province in the PR.
- Carrying `school_id` through scoring touches the scoring package boundary: mitigated by treating it as a passthrough column with existing tests updated, formulas untouched.

## Open questions — resolved

| # | Question | Decision |
| --- | --- | --- |
| 1 | Typography | Space Grotesk + Inter; Spectral only for methodology prose. |
| 2 | Auth | Email allowlist for v1. SSO only if ADB IT later requires it. |
| 3 | Scenario delete | Soft-delete / archive only. |
| 4 | Phase 1 vs 2 order | Sequential after Phase 0.5. Late overlap of 1 and 2 is OK once lockdown lands. |

No open product questions remain for starting Phase 0.

## Appendix A - Live infrastructure audit (2026-08-09)

Verified while logged into the `sonleh96` Vercel team and Supabase org. No secrets recorded.

### Vercel (`sonleh96s-projects/adb-school-optimize`)

- Production status: Ready.
- Domain: `adb-school-optimize.vercel.app` (no custom domain).
- Root Directory: `apps/web`.
- Node.js: 24.x.
- Environment variables: only `NEXT_PUBLIC_API_BASE_URL` (All Environments, last updated Apr 13).
- Production deploy: May 28 by `sonleh96`, commit `0c55e18` ("Update backend deployment from Cloud Run to Vercel").
- Analytics / Speed Insights / Deployment Checks: not enabled.
- Note: local `main` is behind `origin/main` at `0c55e18`. Reconcile before implementing.

### Cloud Run API

- Base URL baked into the production frontend: `https://rise-png-api-73728254844.asia-southeast1.run.app`.
- `GET /` -> `{"status":"ok"}`.
- `GET /healthz` -> 404 (route mismatch vs local code which defines `/healthz`).
- `GET /api/v1/meta/indicators` and `/api/v1/schools?limit=1` succeed with no auth.
- CORS allows `https://adb-school-optimize.vercel.app` with credentials.
- No gzip: choropleth response is ~1.86 MB uncompressed for 87 features; geometry dominates.
- Full school list (~10k limit request) ~153 KB.

### Supabase (`zcalkzfysjidpmmckbhf`)

- Project: `adb-school-optimize`, PRO, Healthy, region `ap-northeast-1` (Tokyo), compute nano/`t4g.nano`.
- Resource snapshot: disk ~54%, RAM ~52%, connections 8/60.
- Recent Postgres request success rate ~70% with an error spike (Security/ops concern, not just UX).
- Tables present and sized approximately:
  - `districts`: 87 rows, ~2.5 MB
  - `schools`: 212 rows, ~5.5 MB
  - `school_scores`: 636 rows, ~0.8 MB
  - `scoring_scenarios`: 3 rows
  - `layer_catalog`: 15 rows
  - `vector_layer_features`: **~4.84M rows / ~2.4 GB** (primary storage hotspot)
  - view `ranked_school_scores_latest`
- Auth providers: Email enabled; Google/GitHub/SSO disabled. Signups allowed. Confirm-email enabled.
- Security Advisor: **7 errors** - RLS disabled on all public tables exposed to the Data API, plus SECURITY DEFINER view warning on `ranked_school_scores_latest`.
- No GitHub repository connected for schema migrations.
- Backups: recent (about 7 hours before audit).

### Implications for the plan

- Phase 2 payload/gzip work is confirmed by production numbers, not just local estimates.
- Phase 5 auth/RLS is more urgent than previously framed: tables are reachable via Supabase Data API with RLS off.
- `vector_layer_features` size should be treated as a dedicated performance workstream (tiling/aggregation/retention), not only frontend thinning.
- Before Phase 0 implementation: sync the worktree with `origin/main` under the team GitHub identity.

## Appendix B - Second-pass re-audit (2026-08-09, post-merge)

Three parallel passes (frontend, backend, hygiene/performance) on the merged branch. Tests at time of audit: 19 scoring + 26 API passing.

### Status vs first pass

- Phase 0.5 artifacts landed in-repo: `docs/security-baseline.md`, `infra/sql/002_security_lockdown.sql`, `WRITE_OPERATIONS_ENABLED` gate, prototype-labeled exports. Production apply of the SQL and signup disable still needs verification.
- `/healthz` exists in code; the 404 in Appendix A is a stale-deploy note, not a code gap.
- Branch merged with `origin/main` (`0c55e18`); active gh identity `sonleh96`.

### New findings (folded into phases above)

1. XSS risk: AQI popups interpolate unsanitized feature properties into `bindPopup` HTML (`SchoolMap.tsx`).
2. Open read/export surface: write gate covers mutations only; all GETs, exports, and raster overlays are unauthenticated; `created_by` comes from the request body.
3. Typography drift: Spectral bound as body font app-wide, contradicting the locked Inter decision.
4. Deploy doc contradiction: README says Vercel for the API; architecture docs and reality say Cloud Run.
5. `/rasters/status` returns credential/source paths.
6. Error shape split: `HTTPException` `{"detail"}` vs structured `ApiError`.
7. Unbounded `limit` on layer-features (client asks 30000; no server cap).
8. Provenance drift: `repository.py` persists `score_version`/`run_manifest` while uncommitted `queries.py` dropped them from SELECTs - resolve with the 003 migration decision.

### Uncommitted-change assessment at audit time

- `globals.css` map-height breakpoints: intentional UX fix.
- `next.config.mjs` `NEXT_DIST_DIR`: intentional parallel-build support; document or keep.
- `package-lock.json`: incidental Next 15.5.15 to 15.5.23 resolution bump; commit consciously or revert.
- `data_quality.py` / `load_core_data.py` / ingestion test: intentional NAM_1/NAM_2 reference-polygon fallback; keep.
- `queries.py` provenance SELECT removal: merge hazard; resolve before commit.
