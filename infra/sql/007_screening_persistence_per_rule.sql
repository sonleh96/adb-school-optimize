-- Persistence of top-20 membership, now one set per rule.
-- Additive and re-runnable: the check is dropped if it exists and added again, and the lockdown statements are idempotent.
-- 005 and 006 are not touched.
--
-- 006 let the numbers attach to additive_u only, because the one recorded experiment included urgency.
-- The revised paper adds a second experiment that leaves urgency out, so the numbers may now attach to
-- additive_u (the circulated paper's experiment) and additive_no_u (the revised paper's experiment), and to no other rule.
-- A set still belongs to one input version and one rule, so each rule keeps its own provenance and its own settings.
-- The check keeps the name 006 gave it, so a violation reads the same.
--
-- The tables are not new, so a version loaded under 006 keeps its additive_u set and gains nothing.
-- A response that names an input version is cached as immutable, so a set is attached when a version is created
-- and never later; the loader enforces that.

begin;

alter table screening_persistence_sets drop constraint if exists screening_persistence_sets_rule_id_check;
alter table screening_persistence_sets
    add constraint screening_persistence_sets_rule_id_check check (rule_id in ('additive_u', 'additive_no_u'));

comment on table screening_persistence_sets is 'Provenance of the persistence numbers of one input version and one rule. They belong to additive_u (the circulated paper''s experiment) or additive_no_u (the revised paper''s experiment) and to no other rule.';
comment on table screening_persistence_settings is 'The concentration settings of the random share changes of one set, in the order of the source file.';

-- Same lockdown as 002, 005 and 006: the Supabase Data API sees none of these tables.
alter table public.screening_persistence_sets enable row level security;
alter table public.screening_persistence_settings enable row level security;
alter table public.screening_persistence_frequencies enable row level security;

revoke all privileges on table public.screening_persistence_sets from anon, authenticated;
revoke all privileges on table public.screening_persistence_settings from anon, authenticated;
revoke all privileges on table public.screening_persistence_frequencies from anon, authenticated;

commit;
