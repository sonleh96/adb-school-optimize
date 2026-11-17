-- Drop the old Need and Priority model's tables and view.
-- Nothing has read or written them since the screening workspace replaced that model (#35):
-- the API, the loaders and the web app name none of them.
-- 001 to 004 still create and alter them, so a database built from these files gets them and then loses them here.
--
-- Kept: schools (the screening tables reference it), normalize_join_key, the screening and persistence tables,
-- and the postgis and pgcrypto extensions.
-- There is no cascade, so the migration fails, and changes nothing, if anything still depends on one of them.
-- Re-runnable: each drop is "if exists".

begin;

drop view if exists public.ranked_school_scores_latest;
drop table if exists public.school_scores;
drop table if exists public.scoring_scenarios;
drop table if exists public.layer_catalog;
drop table if exists public.vector_layer_features;
drop table if exists public.districts;

commit;
