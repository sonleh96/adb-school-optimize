-- Screening inputs, runs and per-school results.
-- Additive and re-runnable: every statement is create-if-not-exists or idempotent.
-- The old scoring tables are not touched.
--
-- Shape of the data:
--   screening_input_versions  one frozen set of inputs, identified by the engine's input hash
--   screening_inputs          one row per school and version, one typed column per INPUT_CONTRACT field
--   screening_runs            one row per version, rule and engine package version, with the full manifest
--   screening_results         one row per school and run
--
-- A school is identified by its source name, byte for byte.
-- Matching to public.schools goes through normalize_join_key and is optional (school_id may be null).

create table if not exists screening_input_versions (
    input_version text primary key check (input_version <> '' and input_version = btrim(input_version)),
    description text,
    source_manifest jsonb not null,
    input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
    record_count integer not null check (record_count > 0),
    created_at timestamptz not null default now(),
    unique (input_version, input_sha256)
);

create table if not exists screening_inputs (
    input_version text not null references screening_input_versions (input_version) on delete cascade,
    source_school_name text not null check (source_school_name !~ '^\s*$'),
    record_position integer not null check (record_position >= 0),
    source_school_name_norm text generated always as (normalize_join_key(source_school_name)) stored,
    school_id uuid references schools (school_id) on delete set null,
    province text,
    district text,
    locality text,
    permanent_classrooms double precision,
    total_classrooms double precision,
    teachers double precision,
    teacher_houses double precision,
    libraries double precision,
    workshops double precision,
    practical_skills_buildings double precision,
    home_economics_buildings double precision,
    computer_labs double precision,
    specialized_classrooms double precision,
    power_source text,
    water_source text,
    secondary_students_per_1000 double precision,
    female_students_g7_12 double precision,
    total_enrollment_g7_12 double precision,
    conflict_population_exposure double precision,
    progression_g10_corrected_pct double precision check (progression_g10_corrected_pct between 0 and 100),
    progression_g12_corrected_pct double precision check (progression_g12_corrected_pct between 0 and 100),
    district_luminosity_area_integral double precision,
    urgency_source_scalar double precision,
    walking_catchment_population double precision,
    aqi_p95_selected double precision,
    emissions_co2e_100yr_10km_tonnes double precision,
    water_flooded_vegetation_fraction_500m double precision,
    primary key (input_version, source_school_name),
    unique (input_version, record_position)
);

create index if not exists screening_inputs_school_idx on screening_inputs (school_id);

create table if not exists screening_runs (
    run_id uuid primary key default gen_random_uuid(),
    input_version text not null,
    rule_id text not null,
    provenance text not null,
    policy_role text not null,
    score_kind text not null,
    manifest jsonb not null,
    input_sha256 text not null,
    anchors_sha256 text not null check (anchors_sha256 ~ '^[0-9a-f]{64}$'),
    package_version text not null,
    created_at timestamptz not null default now(),
    unique (input_version, rule_id, package_version),
    unique (run_id, input_version),
    -- A run states the same input hash as the version it was computed from.
    foreign key (input_version, input_sha256)
        references screening_input_versions (input_version, input_sha256) on delete cascade
);

create table if not exists screening_results (
    run_id uuid not null,
    input_version text not null,
    source_school_name text not null,
    school_id uuid references schools (school_id) on delete set null,
    cohort text not null check (cohort in ('complete', 'interval', 'verification_queue')),
    gate_failures text[] not null default '{}' check (
        gate_failures <@ array[
            'missing_stock_field',
            'negative_stock_value',
            'nonpositive_denominator',
            'unrecognized_service_coding',
            'unrecognized_locality',
            'unresolved_area_context',
            'unresolved_reach',
            'urgency_unknown'
        ]::text[]
    ),
    components jsonb not null check (jsonb_typeof(components) = 'object'),
    need_parts jsonb not null check (jsonb_typeof(need_parts) = 'object'),
    area_parts jsonb not null check (jsonb_typeof(area_parts) = 'object'),
    contributions jsonb not null check (jsonb_typeof(contributions) = 'array'),
    need_part_contributions jsonb check (jsonb_typeof(need_part_contributions) = 'object'),
    maximum_term jsonb check (jsonb_typeof(maximum_term) = 'object'),
    score_lower double precision,
    score_upper double precision,
    score_point double precision,
    sort_key_primary double precision,
    rank_point integer check (rank_point >= 1),
    rank_point_scope text not null check (rank_point_scope <> ''),
    rank_point_count integer not null check (rank_point_count >= 0),
    rank_best integer check (rank_best >= 1),
    rank_worst integer check (rank_worst >= 1),
    rank_bounds_scope text not null check (rank_bounds_scope <> ''),
    rank_bounds_count integer not null check (rank_bounds_count >= 0),
    primary key (run_id, source_school_name),
    foreign key (run_id, input_version) references screening_runs (run_id, input_version) on delete cascade,
    foreign key (input_version, source_school_name)
        references screening_inputs (input_version, source_school_name) on delete cascade,
    -- A school is queued exactly when it has a gate failure.
    constraint screening_results_queue_has_gate_failures
        check ((cohort = 'verification_queue') = (cardinality(gate_failures) > 0)),
    -- Only the complete cohort has a point score and a point rank.
    constraint screening_results_point_only_when_complete
        check ((cohort = 'complete') = (score_point is not null) and (cohort = 'complete') = (rank_point is not null)),
    -- Bounds and rank bounds exist for every school that is not queued.
    constraint screening_results_bounds_unless_queued
        check (
            (cohort <> 'verification_queue') = (score_lower is not null)
            and (cohort <> 'verification_queue') = (score_upper is not null)
            and (cohort <> 'verification_queue') = (rank_best is not null)
            and (cohort <> 'verification_queue') = (rank_worst is not null)
        ),
    constraint screening_results_bounds_ordered
        check (score_lower <= score_upper and rank_best <= rank_worst),
    constraint screening_results_ranks_within_scope
        check (rank_point <= rank_point_count and rank_worst <= rank_bounds_count)
);

create index if not exists screening_results_run_rank_idx
    on screening_results (run_id, rank_point asc nulls last, rank_best asc nulls last, source_school_name collate "C");
create index if not exists screening_results_school_idx on screening_results (school_id);

comment on table screening_input_versions is 'Frozen screening inputs, identified by the engine input hash.';
comment on table screening_inputs is 'One row per school and input version; one column per field of the engine INPUT_CONTRACT.';
comment on table screening_runs is 'One screening rule applied to one input version by one engine package version; manifest holds the full run description.';
comment on table screening_results is 'One row per school and run; rank scopes are stored on every row so that no rank travels without its cohort.';
comment on column screening_results.rank_point is 'Rank among the complete cohort of the rule, labeled by rank_point_scope.';
comment on column screening_results.rank_best is 'Best possible rank among the eligible cohort, labeled by rank_bounds_scope.';
comment on column screening_results.rank_worst is 'Worst possible rank among the eligible cohort, labeled by rank_bounds_scope.';

-- Same lockdown as 002: the Supabase Data API sees none of these tables. FastAPI reads them over the direct connection.
alter table public.screening_input_versions enable row level security;
alter table public.screening_inputs enable row level security;
alter table public.screening_runs enable row level security;
alter table public.screening_results enable row level security;

revoke all privileges on table public.screening_input_versions from anon, authenticated;
revoke all privileges on table public.screening_inputs from anon, authenticated;
revoke all privileges on table public.screening_runs from anon, authenticated;
revoke all privileges on table public.screening_results from anon, authenticated;
