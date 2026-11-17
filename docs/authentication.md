# Frontend authentication

RISE-PNG uses Supabase email magic links and validates the email allowlist before sending a link and again after session exchange.
The browser does not receive the Supabase key.

## Local development

Set `AUTH_REQUIRED=false` for the simplest local setup.
To exercise protected-route behavior locally, set `AUTH_REQUIRED=true`, configure Supabase, and set `AUTH_BYPASS_LOCAL=false`.
`AUTH_BYPASS_LOCAL=true` is ignored in production builds.

## Configured deployment

Set the following server-side variables:

- `AUTH_REQUIRED=true`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `AUTH_SITE_URL` to the canonical application origin
- one or both of `AUTH_ALLOWED_EMAIL_DOMAINS` and `AUTH_ALLOWED_EMAILS`

Add `${AUTH_SITE_URL}/auth/callback` to the Supabase redirect allowlist.
Disable public signups and invite approved users through the controlled Supabase workflow.
Do not expose the Supabase service-role key or use it for sign-in.

Application routes redirect unauthenticated users to `/sign-in`.
`/sign-in`, `/auth/callback`, `/healthz`, and static Next.js assets remain public.
