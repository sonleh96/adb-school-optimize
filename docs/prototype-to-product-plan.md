# RISE-PNG: Prototype-to-Product Improvement Plan

Status: proposal for review.
Branch: `plan/prototype-to-product`.
Date: 2026-08-09.

This plan covers implementation, frontend, and performance work to move the dashboard from prototype to internal-production quality.
Scoring methodology and data content are explicitly out of scope.

## Locked decisions

From scoping discussion on 2026-08-09:

- Scope: full stack (frontend, performance, backend hardening).
- Design system: Tailwind CSS v4 + shadcn/ui.
- Deployment target: internal production for ADB staff, so auth is a must-have.
- Basemap: CARTO Positron (free, no API key, neutral styling suited to choropleths).

## Goals and non-goals

Goals:

- The app reads as a designed product: consistent spacing, typography, states, and iconography.
- Core interactions feel instant at current data scale and degrade gracefully at 10x scale.
- The API is safe to expose to the ADB network: authenticated, compressed, cache-aware, pooled.
- Every change is verifiable: lint, typecheck, tests, and build run in CI on every PR.

Non-goals:

- No changes to scoring formulas, weights, or indicator definitions.
- No data re-ingestion or schema redesign beyond additive changes (indexes, a raster manifest table).
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

## Phase 0 - Foundations and hygiene (0.5-1 day, PR 1)

Goal: a clean base that later diffs stay readable against.

Changes:

- Delete `apps/web/components/DashboardShell.tsx` (dead tab-based shell superseded by routes).
- Remove or implement dead UI: the no-op "ON SCREEN" distribution scheme button, the duplicated "District Ranking" heading in `DistrictExplorer.tsx`.
- Move root prototype assets (`test_plot.ipynb`, `score_calculations.ipynb`, `aqi_dask.py`, `__pycache__/`) under `prototype/` to clean the repo root; update `docs/architecture.md` links.
- Add ESLint (`eslint-config-next`) and Prettier configs; wire `npm run lint` and `npm run format`.
- Add Ruff config for `services/api` and `packages/school_scoring`.
- Pin Python dependencies with a lockfile (`uv pip compile` or pip-tools) for both packages; pin the Docker base image by digest.
- Add `.github/workflows/ci.yml`: frontend lint + typecheck + build, API pytest + ruff, scoring package pytest, Docker build check.
- Commit a root `README.md` refresh for the new dev workflow.

Acceptance: CI green on the PR itself; no runtime behavior change; `git grep` shows no references to deleted files.

## Phase 1 - Design system and app shell (2-3 days, PR 2)

Goal: the visual foundation every later page uses.

Changes:

- Add Tailwind v4 (`@tailwindcss/postcss`) and initialize shadcn/ui; keep `globals.css` to tokens and base styles only.
- Token set: ADB-adjacent navy/blue palette, neutral grays, semantic success/warning/danger, spacing and radius scale, elevation via borders not blur.
- Typography: Space Grotesk for headings and brand, Inter for UI body text, Spectral retained only for long-form methodology prose.
  This is a proposal, not a mandate; flag in review if Spectral should stay everywhere.
- shadcn components to add: Button, Card, Table, Tabs, Badge, Select, Slider, Command (combobox), Dialog, Sheet, Tooltip, Skeleton, Alert, Sonner (toasts), DropdownMenu, Separator.
- New `AppShell` in `app/layout.tsx`: brand block, route-aware nav (Links with `usePathname`), active-scenario badge, user menu slot (wired in Phase 5).
- Shared state components: `LoadingSkeleton`, `EmptyState`, `ErrorState` with retry; raw API error text never reaches the UI.
- Shared `lib/format.ts`: number, percent, and per-indicator unit formatters used by every table and card.
- Per-route metadata, favicon, and manifest.
- Replace the unicode download glyph and "PNG" text button with lucide icons.

Acceptance: all five pages render on the new shell with no `!important` and no inline `style={{}}` layout hacks; Lighthouse accessibility score >= 95 on the Overview page; visual review sign-off.

## Phase 2 - Data layer and API performance (2 days, PR 3, parallel with Phase 1)

Goal: kill the avoidable network and rendering waste.

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
- Enforce query validation: wire the unused `SchoolFilters` model, cap `limit` at 5000 everywhere.
- Fix `SCHOOLS_SQL` to filter on `province_norm`/`district_norm` so the existing index is used.
- Carry `school_id` through scoring as a passthrough column and persist scores keyed by ID, not school name.
- Add a cheap raster metadata path: a `raster_clips` manifest table written at ingestion time; `/metadata` reads the manifest instead of performing a clip.
- Add bounded eviction to the raster disk cache (max size + LRU sweep).

Acceptance: district choropleth transfer drops from ~2.8 MB uncompressed to under ~400 KB compressed+simplified (measured with Phase 3 geometry change if bundled); `/api/v1/meta/layers` p95 latency under 50 ms warm; no endpoint returns raw stack text; pytest suite extended for cache headers and pool behavior.

## Phase 3 - Map experience (2-3 days, PR 4)

Goal: maps that feel like a product, not a GIS demo.

Changes:

- Basemap: CARTO Positron (`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`) with proper attribution on all maps.
- Render all point layers through `L.canvas()` (`preferCanvas` on `MapContainer`); one memoized `GeoJSON` component per vector layer instead of per-feature components.
- District choropleth: server-side `ST_SimplifyPreserveTopology` with a tolerance parameter plus `ST_AsGeoJSON` coordinate rounding; client caches per indicator.
- Access point layers: canvas-rendered circle markers; at national zoom, request server-side counts instead of raw points (additive endpoint, used only when zoomed out).
- Redesign the layer panel as a grouped shadcn panel with per-layer legends inline; remove the overlay legend panel that floats over the map.
- Popups become a designed school/district detail card (shadcn `Card` in a Leaflet popup or a side panel on selection).
- Map screenshot export: keep the DOM-compositing fallback, drop the unpkg `leaflet-image` script injection (third-party runtime dependency, unmaintained since 2015).
- Fix map heights to fluid containers (`min-h` with aspect fallback) instead of fixed 760 px.

Acceptance: 60k-point access layer pans without visible frame drops on a mid-range laptop; district page loads with simplified geometry; no `window.L` global or remote script injection remains.

## Phase 4 - Page-by-page UX rebuild (3-4 days, PR 5)

Goal: each page gets a purposeful layout and complete states.

- Overview (`/all-schools`): hero metrics row (schools, districts, median priority, last scoring run), national map with district choropleth toggle, ranked table with sortable columns and row virtualization if needed, designed selected-school panel.
- School Explorer (`/school-explorer`): district + school comboboxes synced to URL params, layer panel, detail panel with grouped indicator sections and formatted values, ranked table synced to selection.
- District Explorer (`/district-explorer`): indicator select with units and direction note, histogram with working color-scheme behavior (implement "on screen" or remove it), ranking table with top-N highlight, selected-district card with formatted values.
- Scenario Lab (`/scenario-lab`): weight editor with per-group sum indicators and dirty state, run confirmation with validation errors surfaced inline, saved-scenario table with rename/delete via dropdown, result preview with diff-against-default toggle, export buttons with progress feedback.
- Methodology (`/methodology-lab`): prose layout with table-of-contents rail, KaTeX loaded via dynamic import, weight tables rendered from the active scenario.

Acceptance: every interactive element is keyboard-operable; every async region has loading, empty, and error states; no raw `String(value)` rendering remains; visual review sign-off per page.

## Phase 5 - Auth and production hardening (2 days, PR 6)

Goal: safe to put behind the ADB network.

Changes:

- Supabase Auth: email allowlist (or Google Workspace SSO if ADB tenant policy allows); `@supabase/ssr` session handling with a sign-in route; `middleware.ts` guards all app routes.
- API: FastAPI dependency verifying Supabase JWTs (JWKS fetch with cache, HS256 legacy fallback); all `/api/v1` routes require a valid user; `created_by` populated from the token, not the request body.
- CORS locked to the Vercel production and preview origins; remove `allow_credentials` wildcard combination.
- Basic rate limiting on scoring and export endpoints.
- Structured JSON logging with request IDs; Cloud Run log-based alerts on 5xx.
- Deploy plumbing: `infra/vercel` project config, Cloud Run service YAML, secret wiring documented; staging and production service pair.

Acceptance: unauthenticated requests get 401 with a structured error; signed-in flow works end to end; CORS preflight from a random origin fails; logs show request IDs.

## Phase 6 - QA and launch checklist (1-2 days, PR 7)

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

## Open questions for review

1. Typography: keep Spectral for all body text, or adopt the Space Grotesk + Inter pairing with Spectral only for methodology prose?
2. Auth: email allowlist is the low-friction default; does ADB policy require Google Workspace SSO instead?
3. Scenario deletion: the saved-scenario table gets a delete action; acceptable, or should scenarios be immutable with archive-only?
4. Effort order: Phases 1 and 2 can run in parallel as separate PRs; confirm you want them sequenced (1 then 2) or parallel.
