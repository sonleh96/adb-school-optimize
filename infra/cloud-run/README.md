# Cloud Run API

Deployment notes for the Python backend.

Expected deployable unit:
- `services/api`

## Required production configuration

Deploy the API without public application access until the frontend auth path is configured.
The service itself still validates every `/api/v1` bearer token, so Cloud Run ingress or IAM is not the user authentication boundary.

Set these runtime variables or secrets:

- `DATABASE_URL`
- `SUPABASE_URL`
- `AUTH_REQUIRED=true`
- `AUTH_ALLOWED_EMAIL_DOMAINS=adb.org` and/or `AUTH_ALLOWED_EMAILS`
- `CORS_ORIGINS` with the exact Vercel production and approved preview origins

Use `SUPABASE_JWT_SECRET` only for a project that still signs access tokens with legacy HS256.
With asymmetric signing, the API discovers the public signing key from the Supabase JWKS endpoint and caches it for five minutes.
Never provide the Supabase service-role key to the browser.

## Verification after deployment

1. `GET /healthz` returns 200 and an `X-Request-ID` header.
2. An unauthenticated `GET /api/v1/screening/rules` returns a structured 401.
3. The same request with an allowlisted Supabase access token returns 200.
4. A preflight from an origin not in `CORS_ORIGINS` has no allow-origin header.
5. Cloud Run logs contain one JSON `http_request` record per request without tokens or request bodies.
