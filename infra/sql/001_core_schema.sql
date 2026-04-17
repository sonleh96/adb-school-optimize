create extension if not exists postgis;
create extension if not exists pgcrypto;

create or replace function normalize_join_key(input_text text)
returns text
language sql
immutable
as $$
    select nullif(regexp_replace(lower(trim(input_text)), '\s+', ' ', 'g'), '');
$$;

create table if not exists districts (
    district_id uuid primary key default gen_random_uuid(),
    province text not null,
    district text not null,
    province_norm text generated always as (normalize_join_key(province)) stored,
    district_norm text generated always as (normalize_join_key(district)) stored,
    geom geometry(multipolygon, 4326) not null,
    average_aqi double precision,
    maximum_aqi double precision,
    fixed_broadband_download_speed_mbps double precision,
    fixed_broadband_upload_speed_mbps double precision,
    mobile_internet_download_speed_mbps double precision,
    mobile_internet_upload_speed_mbps double precision,
    access_walking_pct double precision,
    access_driving_pct double precision,
    access_cycling_pct double precision,
    total_nighttime_luminosity double precision,
    co2e_20yr_total_emissions_tonnes double precision,
    co2e_100yr_total_emissions_tonnes double precision,
    grade_7_students double precision,
    grade_8_students double precision,
    grade_9_students double precision,
    grade_10_students double precision,
    grade_11_students double precision,
    grade_12_students double precision,
    total_population double precision,
    female_students_grade_7_12 double precision,
    total_enrollment_grade_7_12 double precision,
    secondary_students_per_1000_people double precision,
    rate_grade_7_progressed_to_grade_12_pct double precision,
    total_enrollment_grade_7_10 double precision,
    grade_7_10_students_per_1000_population double precision,
    rate_grade_7_progressed_to_grade_10_pct double precision,
    school_aged_population double precision,
    conflict_events double precision,
    conflict_fatalities double precision,
    conflict_population_exposure double precision,
    priority double precision,
    need double precision,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (province_norm, district_norm)
);

create table if not exists schools (
    school_id uuid primary key default gen_random_uuid(),
    school_name text not null,
    school_name_norm text generated always as (normalize_join_key(school_name)) stored,
    locality text,
    province text not null,
    district text not null,
    province_norm text generated always as (normalize_join_key(province)) stored,
    district_norm text generated always as (normalize_join_key(district)) stored,
    latitude double precision not null,
    longitude double precision not null,
    geom geometry(point, 4326) not null,
    number_of_available_teachers double precision,
    total_number_of_classrooms double precision,
    number_of_permanent_classrooms double precision,
    number_of_semi_permanent_classrooms double precision,
    number_of_bush_material_classrooms double precision,
    number_of_houses_for_teachers double precision,
    number_of_libraries double precision,
    number_of_workshops double precision,
    number_of_practical_skills_buildings double precision,
    number_of_home_economics_buildings double precision,
    number_of_computer_labs double precision,
    power_source text,
    water_source text,
    toilets text,
    cachment_area_walking_wkt text,
    cachment_area_cycling_wkt text,
    cachment_area_driving_wkt text,
    pop_with_access_walking double precision,
    pop_with_access_driving double precision,
    pop_with_access_cycling double precision,
    number_of_specialized_classrooms double precision,
    lc_landterr_score double precision,
    r double precision,
    average_aqi double precision,
    maximum_aqi double precision,
    fixed_broadband_download_speed_mbps double precision,
    fixed_broadband_upload_speed_mbps double precision,
    mobile_internet_download_speed_mbps double precision,
    mobile_internet_upload_speed_mbps double precision,
    access_walking_pct double precision,
    access_driving_pct double precision,
    access_cycling_pct double precision,
    total_nighttime_luminosity double precision,
    co2e_20yr_total_emissions_tonnes double precision,
    co2e_100yr_total_emissions_tonnes double precision,
    grade_7_students double precision,
    grade_8_students double precision,
    grade_9_students double precision,
    grade_10_students double precision,
    grade_11_students double precision,
    grade_12_students double precision,
    total_population double precision,
    female_students_grade_7_12 double precision,
    total_enrollment_grade_7_12 double precision,
    secondary_students_per_1000_people double precision,
    rate_grade_7_progressed_to_grade_12_pct double precision,
    total_enrollment_grade_7_10 double precision,
    grade_7_10_students_per_1000_population double precision,
    rate_grade_7_progressed_to_grade_10_pct double precision,
    school_aged_population double precision,
    conflict_events double precision,
    conflict_fatalities double precision,
    conflict_population_exposure double precision,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (school_name_norm)
);

create index if not exists districts_geom_gix on districts using gist (geom);
create index if not exists schools_geom_gix on schools using gist (geom);
create index if not exists schools_district_idx on schools (province_norm, district_norm);

create table if not exists scoring_scenarios (
    scenario_id uuid primary key default gen_random_uuid(),
    scenario_name text not null,
    scenario_name_norm text generated always as (normalize_join_key(scenario_name)) stored,
    description text,
    weights jsonb not null,
    config jsonb,
    created_by text,
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (scenario_name_norm)
);

create table if not exists school_scores (
    school_score_id uuid primary key default gen_random_uuid(),
    scenario_id uuid not null references scoring_scenarios(scenario_id) on delete cascade,
    school_id uuid not null references schools(school_id) on delete cascade,
    s double precision,
    a double precision,
    r_phys double precision,
    g double precision,
    i double precision,
    p double precision,
    need_score double precision,
    priority_score double precision,
    data_confidence double precision,
    stage1_selected boolean,
    rank_priority integer,
    rank_need integer,
    component_breakdown jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (scenario_id, school_id)
);

create index if not exists school_scores_scenario_idx on school_scores (scenario_id, rank_priority, rank_need);

create table if not exists layer_catalog (
    layer_id uuid primary key default gen_random_uuid(),
    layer_key text not null unique,
    layer_name text not null,
    layer_group text not null,
    layer_type text not null check (layer_type in ('vector', 'raster', 'derived')),
    source_kind text not null check (source_kind in ('supabase', 'gcs', 'external')),
    source_path text not null,
    join_strategy text,
    geometry_type text,
    default_visible boolean not null default false,
    runtime_clip boolean not null default false,
    style_config jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists vector_layer_features (
    vector_feature_id uuid primary key default gen_random_uuid(),
    layer_key text not null,
    source_feature_id text,
    feature_name text,
    province text,
    district text,
    properties jsonb not null default '{}'::jsonb,
    geom geometry(geometry, 4326) not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists vector_layer_features_layer_feature_uidx
    on vector_layer_features (layer_key, source_feature_id);
create index if not exists vector_layer_features_layer_idx on vector_layer_features (layer_key);
create index if not exists vector_layer_features_admin_idx on vector_layer_features (province, district);
create index if not exists vector_layer_features_geom_gix on vector_layer_features using gist (geom);

create or replace view ranked_school_scores_latest as
select
    ss.scenario_id,
    scn.scenario_name,
    s.school_id,
    s.school_name,
    s.province,
    s.district,
    ss.s,
    ss.a,
    ss.r_phys,
    ss.g,
    ss.i,
    ss.p,
    ss.need_score,
    ss.priority_score,
    ss.data_confidence,
    ss.stage1_selected,
    ss.rank_priority,
    ss.rank_need
from school_scores ss
join schools s on s.school_id = ss.school_id
join scoring_scenarios scn on scn.scenario_id = ss.scenario_id;
