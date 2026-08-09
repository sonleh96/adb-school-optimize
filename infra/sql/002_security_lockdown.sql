-- Close the Supabase Data API until application authentication is implemented.
-- FastAPI uses a direct server-side database connection and remains the supported data path.

alter table public.districts enable row level security;
alter table public.schools enable row level security;
alter table public.scoring_scenarios enable row level security;
alter table public.school_scores enable row level security;
alter table public.layer_catalog enable row level security;
alter table public.vector_layer_features enable row level security;

revoke all privileges on table public.districts from anon, authenticated;
revoke all privileges on table public.schools from anon, authenticated;
revoke all privileges on table public.scoring_scenarios from anon, authenticated;
revoke all privileges on table public.school_scores from anon, authenticated;
revoke all privileges on table public.layer_catalog from anon, authenticated;
revoke all privileges on table public.vector_layer_features from anon, authenticated;
revoke all privileges on table public.ranked_school_scores_latest from anon, authenticated;

alter view public.ranked_school_scores_latest set (security_invoker = true);
alter function public.normalize_join_key(text) set search_path = pg_catalog;

alter default privileges for role postgres in schema public
    revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
    revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
    revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public
    revoke execute on functions from public;

