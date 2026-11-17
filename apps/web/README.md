# Web app

The Next.js frontend, hosted on Vercel.
`/` is the homepage, which explains the project and stays public when sign-in is required.
`/screening` is the screening workspace.
A link to `/` whose query carries a view, from before the homepage, goes on to `/screening` with its query, so it opens that view.
`/sign-in` and `/auth/*` handle Supabase magic-link sign-in, and `/healthz` answers health checks.

The frontend calls the FastAPI service for all data and scoring.
It does not implement the screening rules itself.

## Local setup

The app expects a running FastAPI backend.

1. Install Node.js 26, the version `engines` in `package.json` names; CI and Vercel read it from there.
2. Copy `.env.example` to `.env.local`.
3. Set `API_PROXY_TARGET` to the API origin, for example `http://127.0.0.1:8000`.
   Browser calls go to the same origin under `/api/v1/` and Next forwards them.
4. Install and run:

```bash
npm install
npm run dev
```

## Checks

- `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm test` run without a browser.
- `npm run test:e2e` builds against the mock API in `scripts/mock-api.mjs` and runs the Playwright tests.
  `CI_APP_PORT` and `CI_MOCK_API_PORT` choose the ports, so two checkouts can run side by side.
- `npm run bundle:check`, after `npm run build`, fails when the script `/screening` loads up front goes over 230 KiB gzip, when the homepage's goes over 138 KiB, or when either holds MapLibre or deck.gl.
- `npm run analyze` writes the Turbopack bundle analysis to `.next/diagnostics/analyze`.
- `npm run lighthouse` runs desktop Lighthouse on `/`, `/screening` and `/sign-in`.

## On Vercel

Every push to `main` deploys to production; every other branch gets a preview.
`/api/v1` on a deployment goes to the API that `scripts/api-origin.mjs` picks: `API_PROXY_TARGET` when the build sets it, otherwise the production API on Cloud Run.
Production also sets `NEXT_PUBLIC_API_BASE_URL`, so its browser calls the API directly.
Keep that variable out of Preview: a preview then calls through its own proxy, and `vercel deploy --build-env API_PROXY_TARGET=<url>` can point it at an API revision that takes no traffic yet (`docs/release-runbook.md`).
