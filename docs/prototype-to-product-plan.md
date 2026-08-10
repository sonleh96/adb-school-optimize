# RISE-PNG: Prototype-to-Product Improvement Plan

Status: **approved with amendments** (2026-08-09; Felt/Atlas briefing + analyst workspace amendment 2026-08-09).
Branch: `plan/prototype-to-product`.
Date: 2026-08-09.
Approved after code audit + live Vercel/Supabase/Cloud Run inspection.
Product-interaction amendment (Phases 3.5 and 4.5) added after Felt/Atlas inspiration review.

This plan covers implementation, frontend, and performance work to move the dashboard from prototype to internal-production quality.
Scoring methodology and data content are explicitly out of scope.

## Codex / implementer handoff

Implement **Phase 3.5 first** (PRs A1 → A5), then **Phase 4.5** (PRs B1 → B5), unless Son asks otherwise.
Implement the production Tier C defined below without adding comments, public embeds, AI map builders, upload-anything, or multiplayer cursors.
Steal Felt/Atlas *interaction patterns* only; RISE-PNG stays a decision workspace for school priority scoring, not a general GIS builder.
Prefer small sequential PRs matching the A1–A5 / B1–B5 IDs below.
Keep commits on `plan/prototype-to-product` under the `sonleh96` GitHub identity.
Do not merge to `main` unless Son explicitly asks.
After each PR: `npm run typecheck`, `npm run lint` in `apps/web`, and relevant API pytest when backend touches land.

Suggested merge order:

| Order | PR | Notes |
| --- | --- | --- |
| 1 | A1 URL state | Unblocks everything |
| 2 | A2 Detail card | After A1 |
| 3 | A3 Table sync | After A1; parallel with A2 OK |
| 4 | A4 Bookmarks | After A1; better after A2 |
| 5 | A5 Layer panel | After A1; parallel with A2–A4 OK |
| — | Phase 4 polish / Phase 5 auth | As needed; auth before external share |
| 6 | B1 Filters | After A3 |
| 7 | B2 Compare | After A1 |
| 8 | B3 Heatmap | Can parallel B1/B2 |
| 9 | B4 Catchment | After A2 + A5 |
| 10 | B5 Export pack | Last of Tier B |

Start at **PR A1**.

## Locked decisions

From scoping discussion on 2026-08-09, plus plan review on the same day, plus Felt/Atlas feature scoping:

- Scope: full stack (frontend, performance, backend hardening), plus briefing/analyst interaction features in Phases 3.5 and 4.5.
- Design system: Tailwind CSS v4 + shadcn/ui.
- Deployment target: internal production for ADB staff, so auth is a must-have.
- Basemap: CARTO Positron (free, no API key, neutral styling suited to choropleths).
- Typography: Space Grotesk (headings/brand) + Inter (UI body) + Spectral (methodology prose only).
- Auth v1: email allowlist via Supabase Auth. Google Workspace SSO is a follow-up if ADB IT requires it.
- Scenarios: soft-delete / archive only (no hard delete in UI). Preserve audit trail.
- Product direction for map UX: **Mix — Tier A (briefing workspace) now, Tier B (analyst workspace) next**.
- Inspiration constraint: adopt Felt/Atlas patterns (shareable views, bookmarks, detail panel, table sync, grouped legends, filters, compare, heatmap, catchment lens, export pack).
- Explicitly out of product scope for this amendment: AI “describe a map”, upload-anything, live DB connectors, location comments, public embeds, real-time multiplayer.
- PR order: Phases 0 → 0.5 → 1 → 2 → 3 → **3.5 (A1–A5)** → 4 → 5 → **4.5 (B1–B5)** → 6.
- Phase 4.5 may start after Phase 3.5 even if Phase 5 auth is not finished; auth is required before external stakeholder sharing / Tier C.
- Pre-flight: rebase/sync this branch onto `origin/main` under the `sonleh96` GitHub identity before implementation PRs. Do not push from `sonle-lm`.

## Goals and non-goals

Goals:

- The app reads as a designed product: consistent spacing, typography, states, and iconography.
- Core interactions feel instant at current data scale and degrade gracefully at 10x scale.
- The API is safe to expose to the ADB network: authenticated, compressed, cache-aware, pooled.
- Every change is verifiable: lint, typecheck, tests, and build run in CI on every PR.
- ADB staff can share a URL, run a short briefing with bookmarks, and keep map + table + detail panel in sync.
- Analysts can filter, compare, inspect density/catchment, and export a memo pack from the same view state.

Non-goals:

- No changes to scoring formulas, weights, or indicator definitions.
- No data re-ingestion or schema redesign beyond additive changes (indexes, a raster manifest table, RLS policies, soft-delete columns if needed).
- No general-purpose GIS platform features (arbitrary uploads, AI agents, multiplayer editing).
- Dead UI still gets implemented or removed, not extended into unrelated product surface.
- No dark mode in this pass (tokens will not preclude it later).

## Target state at a glance

Frontend:

- Tailwind v4 + shadcn/ui primitives replace the 1,540-line hand-rolled `globals.css`.
- Route-based shell lifted into `app/layout.tsx`; the dead `DashboardShell.tsx` is deleted.
- TanStack Query owns all server state with dedupe, caching, and retries.
- URL search params hold view state (district, indicator, scenario, selection, layers, map extent) so views are shareable.
- Maps render points on a canvas renderer with memoized GeoJSON layers and CARTO Positron tiles.
- Briefing workspace: bookmarks/story stops, designed selection detail card, map↔table sync, grouped layer legend.
- Analyst workspace: filter chips, compare mode, national density/heatmap, catchment lens, presentation export pack.

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

## Phase 2 - Data layer and API performance (2 days, PR 3; after Phase 0.5, may overlap late Phase 1) — APPROVED — largely landed on branch

Goal: kill the avoidable network and rendering waste.
Live baseline: choropleth ~1.86 MB uncompressed today; schools list ~153 KB; no gzip.

**Status note (2026-08-09):** Much of Phase 2 is already implemented on `plan/prototype-to-product` (TanStack Query, gzip, connection pool, slim choropleth fields, school list cache headers, `province_norm`/`district_norm` filters, vector bbox/district guards).
Treat remaining Phase 2 bullets as a checklist against main after merge, not as a blocker for Phase 3.5.

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

## Phase 3 - Map experience (2-3 days, PR 4) — APPROVED (+ vector scale amendment) — largely landed on branch

Goal: maps that feel like a product, not a GIS demo.

**Status note (2026-08-09):** Canvas markers, single GeoJSON district layer, CARTO Positron, vector zoom/bbox gating, escaped popups, and virtualized school tables are largely on the branch.
Layer-panel redesign and designed detail cards are deferred to Phase 3.5 (A2, A5) so they ship with URL state and sync.

Changes:

- Basemap: CARTO Positron (`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`) with proper attribution on all maps.
- Render all point layers through `L.canvas()` (`preferCanvas` on `MapContainer`); one memoized `GeoJSON` component per vector layer instead of per-feature components.
- District choropleth: server-side `ST_SimplifyPreserveTopology` with a tolerance parameter plus `ST_AsGeoJSON` coordinate rounding; client caches per indicator.
- Access point layers: canvas-rendered circle markers; at national zoom, request server-side counts instead of raw points (additive endpoint, used only when zoomed out).
- **Vector scale (live finding):** `vector_layer_features` is ~4.84M rows / ~2.4 GB. Do not ship raw national dumps to the browser. Add bbox + zoom-gated queries (and/or server-side aggregation) for heavy layers; document a follow-up for MVT/tiling if bbox paging is still too heavy.
- Redesign the layer panel as a grouped shadcn panel with per-layer legends inline; remove the overlay legend panel that floats over the map. (**Moved to Phase 3.5 PR A5.**)
- Popups become a designed school/district detail card (shadcn `Card` in a Leaflet popup or a side panel on selection); until then, escape all feature properties in `bindPopup` HTML strings. (**Designed card moved to Phase 3.5 PR A2; XSS escape already required.**)
- Map screenshot export: keep the DOM-compositing fallback, drop the unpkg `leaflet-image` script injection (third-party runtime dependency, unmaintained since 2015).
- Fix map heights to fluid containers (`min-h` with aspect fallback) instead of fixed 760 px.

Acceptance: heavy vector layers never request unbounded national feature dumps; district page loads with simplified geometry; pan/zoom stays interactive on a mid-range laptop; no `window.L` global or remote script injection remains.

## Phase 3.5 - Briefing workspace / Felt Tier A (PRs A1–A5) — APPROVED for implementation

Goal: make RISE feel like Felt for ADB briefings without becoming a GIS builder.
Ship as five small PRs in order.
A2 / A3 / A5 may proceed in parallel after A1 merges.

### Dependency graph

```text
A1 URL state
 ├── A2 Detail card
 ├── A3 Map ↔ table sync
 ├── A4 Bookmarks (needs A1; nicer after A2)
 └── A5 Layer panel (can parallel A2–A4 after A1)
```

### PR A1 - Shareable map URL state (1–2 days)

Scope: one URL source of truth for Overview (`/all-schools`), School Explorer (`/school-explorer`), and District Explorer (`/district-explorer`).

Required query params:

| Param | Meaning |
| --- | --- |
| `school` | selected school id |
| `district` | selected / focused district name |
| `province` | province when needed to disambiguate |
| `score` | `priority` or `need` |
| `indicator` | District Explorer indicator label |
| `scenario` | active scenario id |
| `layers` | comma-separated active layer keys |
| `lat`, `lng`, `z` | map center and zoom |

Changes:

- Add a small URL-state helper (`nuqs` or equivalent shared hooks under `apps/web/lib/`).
- Write params on select / pan / zoom (debounce map writes ~200–300 ms).
- Read params on mount and hydrate selection + map view.
- Add a visible **Copy link** control on map pages.
- Keep Scenario Lab / Methodology out of scope except preserving `scenario` when linking into Scenario Lab later.

Out of scope: bookmarks UI, new detail design, filter chips.

Acceptance: paste a copied URL into a fresh browser session and land on the same district/school/score/layers/map extent; refresh does not lose selection; typecheck and lint clean.

### PR A2 - Selection detail card (≈2 days)

Scope: replace thin attribute dump with one designed side card for school and district selection.

Changes:

- Shared detail-card component used by Overview, School Explorer, and District Explorer.
- Grouped drivers for need/priority components with formatted metrics via `lib/format.ts`.
- Client-side “compare to district median” and/or “compare to national median” from already-loaded data (no new scoring endpoints).
- CTA to open Scenario Lab while preserving `scenario` (and selection where relevant) in the URL.
- Finish XSS-safe rendering for any remaining HTML popups/strings.

Out of scope: rich popups for every vector feature type; scenario A vs B diff (Phase 4.5 B2).

Depends on: A1 so selection survives refresh.

Acceptance: selecting a school/district shows the card as the primary read surface; medians render without extra full-list fetches when data is already cached; keyboard focus and empty/error states are present.

### PR A3 - Map ↔ table bidirectional sync (1–1.5 days)

Scope: Overview + School Explorer ranked tables, plus District Explorer ranking table.

Changes:

- Row click selects map feature and updates URL.
- Map select scrolls the virtualized table row into view and marks it selected.
- Optional hover highlight between row and marker (keep cheap; no layout thrash).
- Filters/selection remain URL-backed from A1.

Out of scope: filter chips (B1); full sort UX redesign.

Depends on: A1.
Builds on existing `VirtualizedSchoolTable`.

Acceptance: click table → map selection updates; click map → table scrolls to row; virtualization still smooth for full school list.

### PR A4 - Bookmarks / story stops (1–1.5 days)

Scope: briefing mode over URL state.

Changes:

- Seed 3–5 named bookmarks (examples: National overview, Port Moresby priority schools, High AQI focus).
- Persist user-defined bookmarks in `localStorage` only (no server persistence until auth).
- UI: jump list + previous/next controls.
- A bookmark is a named snapshot of A1 params (not a separate data model).

Out of scope: team-shared server bookmarks; comments.

Depends on: A1; preferably after A2 so stops open a useful detail card.

Acceptance: prev/next walks seeded stops and updates map + URL; custom bookmark survives reload on the same browser; clearing site data removes user bookmarks only.

### PR A5 - Grouped layer legend panel (≈2 days)

Scope: School Explorer layer chrome becomes Felt-style primary control.

Changes:

- Group layers: Access / Environment / Scores (adjust labels to match catalog).
- Inline legends, opacity control, solo-layer action, and layer search.
- Sync active layers to `layers` URL param from A1.
- Remove redundant floating legend panels where the grouped panel already shows the same keys.

Out of scope: new layer types; MVT/tiling.

Depends on: A1; may parallel A2–A4.

Acceptance: grouped toggles work; solo isolates one layer; URL round-trips layer set; no unbounded national vector fetch when zoomed out (existing Phase 3 guards remain).

### Phase 3.5 acceptance (all of A1–A5)

- Paste a URL → same map + selection + layers.
- Briefing prev/next works from seeded bookmarks.
- Detail card is the primary read surface.
- Table and map stay in sync on Overview and School Explorer.

## Phase 4 - Page-by-page UX rebuild (3–4 days, PR 5) — APPROVED

**Coordination note:** Phase 3.5 implements the shareable URL, detail card, table sync, and layer-panel pieces that Phase 4 originally listed for map pages.
Phase 4 should focus on remaining page polish that 3.5 does not cover: Overview hero metrics, combobox polish, District histogram behavior, Scenario Lab editor/archive UX, Methodology TOC/KaTeX, and global loading/empty/error consistency.

- Overview (`/all-schools`): hero metrics row (schools, districts, median priority, last scoring run), national map with district choropleth toggle, ranked table with sortable columns (virtualization already present), designed selected-school panel (prefer Phase 3.5 card).
- School Explorer (`/school-explorer`): district + school comboboxes synced to URL params (A1), layer panel (A5), detail panel (A2), ranked table synced to selection (A3).
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

## Phase 4.5 - Analyst workspace / Felt Tier B (PRs B1–B5) — APPROVED for implementation

Goal: policy and analyst differentiators on top of shareable briefing state.
Start after Phase 3.5.
Phase 5 auth is preferred before external sharing, but B1–B4 do not require auth to implement.

### Dependency graph

```text
After A1–A5:
B1 Filter chips (needs A1; better after A3)
B2 Compare mode (needs A1 + scenario URL)
B3 Heatmap (can parallel B1/B2)
B4 Catchment lens (after A2 + A5)
B5 Export pack (after A1–A4 + preferably B1)
```

### PR B1 - Filter chips / map query language (≈2 days)

Scope: chip bar that filters map markers and table together.

Examples: Priority ≥ threshold, Need ≥ threshold, province multi-select, stage-1 only, data-confidence band.

Changes:

- Chip UI synced to URL (`filters=...` or equivalent structured params).
- Clear-all action and empty-state copy when no rows match.
- Apply the same filter predicate to map points and ranked table.

Out of scope: arbitrary spatial SQL builder; “no secondary nearby” until B4.

Depends on: A1 + A3.

Acceptance: enabling chips updates map + table + URL; reloading restores filters; performance stays acceptable on full school list.

### PR B2 - Compare mode (2–3 days)

Scope: policy trade-off view, not a second GIS product.

v1 options (pick the smaller complete slice first):

- Priority vs Need dual encoding / toggle overlay, or
- Scenario A vs B score comparison with a table delta column.

Changes:

- Explicit compare entry point from Overview or Scenario Lab.
- Preserve compared scenario ids / score fields in URL.
- Document the chosen v1 in the PR description.

Out of scope: true split-map dual Leaflet panes (optional B2.1 follow-up); changing scoring formulas.

Depends on: A1 scenario param; existing scenario/school score fetches.

Acceptance: user can switch compare mode and see both values without leaving the map workspace; URL restores compare state.

### PR B3 - Heatmap / density at national zoom (1–2 days)

Scope: Overview first; optional School Explorer at low zoom.

Changes:

- When zoom is below a threshold, render density/heatmap (or hex/grid) instead of overlapping school circles.
- Switch back to canvas point markers when zoomed in.
- Provide a short legend for density.

Out of scope: mandatory new server aggregation endpoint (add only if client heat is insufficient for ~212 schools).

Can parallel B1/B2 after map canvas path.

Acceptance: national zoom remains interactive; zooming in restores selectable school markers; no regression in vector layer gating.

### PR B4 - Catchment / proximity lens (1.5–2 days)

Scope: on selected school, show existing access layers plus a simple distance buffer (Turf or Leaflet circle).
Not drive-time isochrones and not a routing service.

Changes:

- Detail-card toggle: “Show catchment / proximity”.
- Auto-enable relevant access layers when toggled.
- Draw buffer ring(s) for fixed distances appropriate to existing walk/cycle/drive access semantics.
- Short explanatory copy in the detail card.

Out of scope: road-network isochrones; new external routing APIs.

Depends on: A2 + A5; keep Phase 3 vector bbox/zoom guards.

Acceptance: toggle shows buffer + access context for the selected school only; turning off clears overlay without remounting the whole map.

### PR B5 - Presentation / export pack (1.5–2 days)

Scope: one action for ADB memos from the current filtered/shared view.

Changes:

- One-click multi-download or zip: map PNG (reuse screenshot path), ranked CSV for current filter/selection, footnote text (scenario name, score field, timestamp, methodology deep link).
- Include active filter/bookmark name when present.
- Disable or warn cleanly when write/export gates apply.

Out of scope: PDF report builder; PowerPoint generation.

Depends on: A1–A4 and preferably B1 so exports match the shared view.

Acceptance: export contents match on-screen filtered ranking and named scenario; filenames are stable and readable.

### Phase 4.5 acceptance (all of B1–B5)

- Analyst can filter → compare → inspect density/catchment → export a briefing pack.
- All of the above round-trip through URL state from Phase 3.5 where applicable.

## Phase 5.5 - Production Tier C (PRs C1-C5) - APPROVED for implementation

Tier C completes the approved production, hardening, and verification work after the briefing and analyst workspaces.
It does not reopen the deferred general-purpose GIS or collaboration features.

### PR C1 - Performance stabilization

- Reproduce and remove main-thread freezes in Overview and School Explorer.
- Keep Leaflet renderer, vector cache, and URL-state work bounded across repeated interactions.
- Abort stale layer requests and avoid route navigations for query-only state updates.
- Record before and after measurements and add a browser regression guard in C5.

Acceptance: repeated score, comparison, selection, zoom, and layer interactions do not accumulate renderers or trigger page navigations, and production build gates pass.

### PR C2 - Remaining page polish

- Complete the Phase 4 Overview metrics, District Explorer semantics, Scenario Lab archive workflow, Methodology loading behavior, and global state consistency.
- Preserve the Tier A and Tier B map workspace layouts and URL contracts.

Acceptance: every page has consistent loading, empty, error, keyboard, and responsive behavior without increasing the initial route budget.

### PR C3 - Frontend authentication boundary

- Add the approved Supabase email-allowlist sign-in and session flow.
- Guard application routes while keeping health, sign-in, and static assets available.
- Add the signed-in user slot to the application shell.

Acceptance: configured deployments require an allowlisted session, while an explicitly documented local-development bypass keeps contributor setup deterministic.

### PR C4 - API and operational hardening

- Verify Supabase JWTs on `/api/v1` routes and derive `created_by` from the token.
- Lock CORS, add write-endpoint rate limits, request IDs, structured logs, and deployment configuration.
- Preserve connection pooling, compression, cache headers, and bounded query behavior.

Acceptance: unauthenticated protected requests return structured `401` responses, random-origin preflight fails, and API tests cover the security and operational middleware.

### PR C5 - Automated QA and launch guardrails

- Implement the Phase 6 unit, browser smoke, bundle budget, and Lighthouse checks.
- Include a map renderer accumulation regression and export download coverage.
- Finish the local, staging, production, rollback, and performance runbook.

Acceptance: CI enforces the release gates and the runbook provides a tested rollback path.

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
| 5 | Felt/Atlas feature direction | Mix: Tier A briefing workspace now (Phase 3.5), Tier B analyst workspace next (Phase 4.5). |
| 6 | Plan doc shape | Amend this file; do not create a separate Felt features doc. |
| 7 | Tier C | Production hardening and QA only; comments, embeds, AI, uploads, and multiplayer remain deferred. |
| 8 | Bookmarks persistence v1 | localStorage + seeded defaults; server/team bookmarks wait for auth. |

Phase 0–1 and much of Phase 2–3 performance work are already on `plan/prototype-to-product`.
Next implementation focus for Codex: **PR A1 (shareable map URL state)**.

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
