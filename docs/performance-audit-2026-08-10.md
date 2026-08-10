# Performance audit - 2026-08-10

## Scope

This audit covers the merged Tier A and Tier B frontend map paths, the live read-only API payloads used by Overview, and the existing production build output.
The reported symptom was a browser screen freeze while interacting with the preview.

## Reproduction and baseline

The Overview loaded 212 schools from the configured API.
At zoom level 8, the page created 247 canvas elements because each school and density point constructed a separate Leaflet canvas renderer.
Toggling Priority and Need comparison once increased the count to 459 canvas elements because the keyed GeoJSON layer remounted while the dedicated renderers remained attached.
The same interaction also performed a Next.js router replacement for a query-only state change, which issued a new page request and reconciled the route.

Live payload measurements from 2026-08-10 were:

| Request                                      |   Response size |   Total time |
| -------------------------------------------- | --------------: | -----------: |
| `/api/v1/schools?limit=5000`                 |   152,681 bytes | 1.61 seconds |
| `/api/v1/districts/choropleth?fields=scores` | 1,859,983 bytes | 2.86 seconds |

The timings include network and Cloud Run latency from the development environment.
The API already applies GZip middleware, connection pooling, cache headers, geometry simplification, and database spatial indexes.

The production build before further Tier C work reported these first-load route sizes:

| Route             | First-load JavaScript |
| ----------------- | --------------------: |
| Overview          |                152 kB |
| School Explorer   |                159 kB |
| District Explorer |                141 kB |
| Scenario Lab      |                125 kB |
| Methodology       |                228 kB |

## Root causes fixed in C1

1. School, density, and access points now use the `MapContainer` shared canvas renderer instead of constructing a renderer per feature.
2. School marker score, comparison, and selection changes now update stable Leaflet paths through a memoized style function instead of remounting the full GeoJSON layer.
3. Shared URL writes now use the Next.js-integrated native History API instead of performing an App Router navigation for each selection, toggle, filter, or map extent change.
4. Duplicate `moveend` and `zoomend` publications for the same viewport are ignored.
5. In-flight vector and raster metadata requests are aborted when the viewport or active layer selection changes.
6. The per-map vector cache is bounded to 12 least-recently-used entries instead of retaining every visited bounding box for the life of the page.
7. Large vector feature collections and style callbacks are memoized, while a feature signature ensures changed viewport data replaces stale Leaflet layers.
8. Overview requests the approved API geometry simplification parameter at a national-view tolerance of `0.01`.

## Verification

After the shared renderer and stable marker update changes, repeated comparison toggles remained at two canvas elements instead of growing from 247 to 459 and beyond.
The URL continued to round-trip school, district, province, score, comparison, and map extent without a page navigation.
The production build, TypeScript check, ESLint, and Prettier check passed after the first C1 slice.

## Follow-up budget

The initial route budget remains below 250 kB, but Methodology at 228 kB has limited headroom and should not accept new eager client dependencies.
The national choropleth is the largest live payload and should be remeasured after the current API simplification code is deployed.
Tier C QA should add an automated browser assertion that repeated map mode changes keep the number of Leaflet canvases bounded.
Production monitoring should track interaction latency, route load metrics, API p95 latency, and client errors before external stakeholder rollout.
