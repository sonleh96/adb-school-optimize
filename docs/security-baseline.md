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

The `ranked_school_scores_latest` view uses `security_invoker` semantics.

Default privileges are revoked so newly created public tables, sequences, and functions are not exposed automatically.

The tracked deployment SQL is [infra/sql/002_security_lockdown.sql](../infra/sql/002_security_lockdown.sql).

## API controls

Mutation endpoints are disabled unless `WRITE_OPERATIONS_ENABLED=true` is set in the server environment.

This flag is an operational containment control, not a substitute for authentication and authorization.

The flag must stay false in every shared environment until Supabase JWT verification and the ADB email allowlist are implemented and tested end to end.

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
- Confirm FastAPI mutation endpoints return a structured disabled response when the write flag is false.
- Confirm public signup is disabled in Supabase Auth.
- Confirm no private Supabase credential is present in browser-visible environment variables.

