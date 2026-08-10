# API security boundary

## Threat model

The browser, bearer token, origin headers, route parameters, and request IDs are untrusted.
The protected assets are school and district data, raster exports, scoring mutations, and the scenario audit trail.

The controls address the primary abuse cases:

- spoofed users are rejected by issuer, audience, signature, expiry, subject, and email-allowlist checks;
- client-supplied `created_by` values are replaced with the verified token identity;
- cross-origin browser calls are limited to configured application origins and headers;
- writes are gated and rate-limited per verified subject and client host;
- request IDs and structured logs support tracing without logging tokens or bodies;
- health endpoints remain public while all `/api/v1` routers share the same authentication dependency.

The frontend keeps the Supabase session in HTTP-only cookies.
Short-lived access tokens are delivered from a same-origin, no-store endpoint into memory for direct JSON API calls.
Raster and export downloads use an allowlisted same-origin proxy so credentials never appear in URLs.

Authentication is fail-open only when `AUTH_REQUIRED=false`, which is the documented contributor mode.
Production and staging must set `AUTH_REQUIRED=true`.
