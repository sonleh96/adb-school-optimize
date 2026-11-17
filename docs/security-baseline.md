# RISE-PNG Security Baseline

Status: Sprint 0 containment baseline.

Date: 2026-08-09.

## Supported access path

The browser calls the FastAPI service hosted on Cloud Run.

The Supabase Data API is not a product interface and must remain inaccessible to `anon` and `authenticated` roles.

No Supabase service-role key or database credential may be exposed through a `NEXT_PUBLIC_` environment variable or otherwise shipped to the browser.

## Database controls

All tables in the exposed `public` schema have Row Level Security enabled.

The `anon` and `authenticated` roles have no table or view privileges during the containment period.

Default privileges are revoked so newly created public tables, sequences, and functions are not exposed automatically.

The tracked deployment SQL is [infra/sql/002_security_lockdown.sql](../infra/sql/002_security_lockdown.sql).

## API controls

The API serves only GET requests, and the screening routes read stored runs.
It has no endpoint that writes data.

Every `/api/v1` route checks the Supabase JWT and the ADB email allowlist.

## Operational rules

Public Supabase signups must remain disabled until the authenticated product flow is ready.

Production changes require a recent backup, a recorded migration, negative access tests, and a rollback plan.

Database credentials must use the least-privileged role that supports the required server-side operations.

The current owner-level FastAPI database connection is a known follow-up and must be replaced before operational launch.

## Verification checklist

- Confirm RLS is enabled on every public table.
- Confirm `anon` and `authenticated` have no table or view privileges.
- Confirm unauthenticated Data API reads and writes are denied.
- Confirm the security advisor reports no RLS-disabled or security-definer-view errors.
- Confirm FastAPI reads still work through its server-side connection.
- Confirm public signup is disabled in Supabase Auth.
- Confirm no private Supabase credential is present in browser-visible environment variables.

