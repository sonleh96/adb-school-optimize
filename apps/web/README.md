# Web app

The Next.js frontend, hosted on Vercel.
The app is the screening workspace.
`/` redirects to `/screening` and keeps the query string, so a link that carries a view opens that view.
`/sign-in` and `/auth/*` handle Supabase magic-link sign-in, and `/healthz` answers health checks.

The frontend calls the FastAPI service for all data and scoring.
It does not implement the screening rules itself.

## Local setup

The app expects a running FastAPI backend.

1. Install Node.js 20.9 or later.
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
- `npm run bundle:check` fails when the workspace's first load goes over 250 KiB gzip.
- `npm run lighthouse` runs desktop Lighthouse on `/screening` and `/sign-in`.
