-- Persistence of top-20 membership under random changes of the factors' shares, stored with an input version.
-- Additive and re-runnable: every statement is create-if-not-exists or idempotent. 005 is not touched.
--
-- The numbers come from one recorded experiment that included urgency, so they belong to the circulated rule
-- (additive_u) and to no other rule. The check on rule_id makes any other rule unstorable.
-- They are not a result of the proposed revision that leaves urgency out.
--
-- Shape of the data:
--   screening_persistence_sets         one row per version and rule: where the numbers came from and how they were drawn
--   screening_persistence_settings     the concentration settings of the draws
--   screening_persistence_frequencies  one row per school and setting: the lower top-20 frequency
--
-- A school is persistent when its frequency is at or above the set's threshold in every setting.
-- That flag is derived on read and never stored, so it cannot disagree with the frequencies.

begin;

create table if not exists screening_persistence_sets (
    input_version text not null references screening_input_versions (input_version) on delete cascade,
    rule_id text not null check (rule_id = 'additive_u'),
    experiment_id text not null check (experiment_id <> ''),
    source_path text not null check (source_path <> ''),
    source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
    draws integer not null check (draws > 0),
    threshold double precision not null check (threshold > 0 and threshold <= 1),
    created_at timestamptz not null default now(),
    primary key (input_version, rule_id)
);

create table if not exists screening_persistence_settings (
    input_version text not null,
    rule_id text not null,
    setting_id text not null check (setting_id <> ''),
    setting_position integer not null check (setting_position >= 0),
    top_level_concentration double precision not null check (top_level_concentration > 0),
    school_need_concentration double precision not null check (school_need_concentration > 0),
    primary key (input_version, rule_id, setting_id),
    unique (input_version, rule_id, setting_position),
    foreign key (input_version, rule_id)
        references screening_persistence_sets (input_version, rule_id) on delete cascade
);

create table if not exists screening_persistence_frequencies (
    input_version text not null,
    rule_id text not null,
    source_school_name text not null,
    setting_id text not null,
    lower_top20_frequency double precision not null check (lower_top20_frequency between 0 and 1),
    primary key (input_version, rule_id, source_school_name, setting_id),
    foreign key (input_version, rule_id, setting_id)
        references screening_persistence_settings (input_version, rule_id, setting_id) on delete cascade,
    foreign key (input_version, source_school_name)
        references screening_inputs (input_version, source_school_name) on delete cascade
);

comment on table screening_persistence_sets is 'Provenance of the persistence numbers of one input version. They belong to the circulated rule additive_u only.';
comment on table screening_persistence_settings is 'The concentration settings of the random share changes, in the order of the source file.';
comment on table screening_persistence_frequencies is 'Lower top-20 frequency of a school under one setting. A school absent here was not in the experiment.';
comment on column screening_persistence_sets.threshold is 'A school is persistent when its frequency is at or above this in every setting.';

-- Same lockdown as 002 and 005: the Supabase Data API sees none of these tables.
alter table public.screening_persistence_sets enable row level security;
alter table public.screening_persistence_settings enable row level security;
alter table public.screening_persistence_frequencies enable row level security;

revoke all privileges on table public.screening_persistence_sets from anon, authenticated;
revoke all privileges on table public.screening_persistence_settings from anon, authenticated;
revoke all privileges on table public.screening_persistence_frequencies from anon, authenticated;

commit;
