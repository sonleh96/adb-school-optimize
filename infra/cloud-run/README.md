# Cloud Run API

Deployment notes for the Python backend.

Expected deployable unit:
- `services/api`

The service is `rise-png-api` in project `adb-sr`, region `asia-southeast1`.
`docs/release-runbook.md` has the release steps.

## Required production configuration

Set these runtime variables or secrets:

- `DATABASE_URL`, from the Secret Manager secret `rise-png-database-url`
- `CORS_ORIGINS` with the exact Vercel production origin and any approved preview origins

Sign-in is off in production: `AUTH_REQUIRED` is unset, so the API needs only `DATABASE_URL`.

To turn sign-in on, also set:

- `AUTH_REQUIRED=true`
- `SUPABASE_URL` (production sets it already)
- `AUTH_ALLOWED_EMAIL_DOMAINS=adb.org` and/or `AUTH_ALLOWED_EMAILS`

With `AUTH_REQUIRED=true`, the API refuses to start unless `SUPABASE_URL` and at least one allowlist variable are set, since an empty allowlist would let any signed-in Supabase account in.
The service then validates every `/api/v1` bearer token itself, so Cloud Run ingress or IAM is not the user authentication boundary.

Use `SUPABASE_JWT_SECRET` only for a project that still signs access tokens with legacy HS256.
With asymmetric signing, the API discovers the public signing key from the Supabase JWKS endpoint and caches it for five minutes.
Never provide the Supabase service-role key to the browser.

## Verification after deployment

1. `GET /` returns 200 with an `X-Request-ID` header.
   Check `/`, not `/healthz`: Cloud Run's front end answers some paths that end in `z`, `/healthz` among them, with its own 404, so they never reach the service.
   `/healthz` still answers locally and in Docker.
2. `GET /api/v1/screening/rules` returns 200.
3. With sign-in on, the same request without a token returns a structured 401, and with an allowlisted Supabase access token returns 200.
4. A preflight from an origin not in `CORS_ORIGINS` has no allow-origin header.
5. Cloud Run logs contain one JSON `http_request` record per request without tokens or request bodies.
