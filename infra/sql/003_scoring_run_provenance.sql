-- Persist the scoring contract and source fingerprints for every scenario run.

alter table public.scoring_scenarios
    add column if not exists score_version text,
    add column if not exists run_manifest jsonb;

comment on column public.scoring_scenarios.score_version is
    'Versioned research scoring contract used to produce the scenario.';

comment on column public.scoring_scenarios.run_manifest is
    'Hashes and dimensions identifying the exact scoring inputs, configuration, and weights.';

