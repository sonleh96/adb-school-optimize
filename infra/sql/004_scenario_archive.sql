alter table scoring_scenarios
    add column if not exists archived_at timestamptz;

create index if not exists scoring_scenarios_active_updated_idx
    on scoring_scenarios (updated_at desc)
    where archived_at is null;
