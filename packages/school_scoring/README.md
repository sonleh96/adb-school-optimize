# school_scoring package

The screening engine for RISE-PNG.
It takes prepared school records, ranks them under seven rules, and compares the lists.

## Screening engine

`school_scoring.screening` implements the circulated research method and the urgency-omitted scenario.

```python
from school_scoring.screening import parse_records, prepare, screen

records = parse_records(frame)  # boundary: typed records, missing cells stay None
prepared = prepare(records)  # components, anchors, gate failures, missing components
run = screen(prepared, "additive_no_u")  # cohorts, scores, bounds and ranks for one rule
run.manifest.to_dict()  # rule, weights, anchors, hashes, scopes, version
run.to_frame()  # flat export, one row per input record, in input order
```

### Rules

| Id | Provenance | Policy role | Formula |
| --- | --- | --- | --- |
| `additive_u` | circulated paper | urgency sensitivity | `S = 0.60N + 0.15A + 0.05U + 0.05R + 0.05Q + 0.05E + 0.05L`, which is `0.95 S0 + 0.05U` |
| `additive_no_u` | revised paper | primary | `S0 = (0.60N + 0.15A + 0.05(R + Q + E + L)) / 0.95`, so 12/19 N, 3/19 A, 1/19 each for R, Q, E, L |
| `need_first_u` | circulated paper | urgency sensitivity | N descending, then `0.15A + 0.05U + 0.05R + 0.05Q + 0.05E + 0.05L`, then name |
| `need_first_no_u` | revised paper | strict alternative | N descending, then `(0.15A + 0.05R + 0.05Q + 0.05E + 0.05L) / 0.95`, then name |
| `bottleneck_u` | circulated paper | urgency sensitivity | `T = 0.60S + 0.40 max(N, A, U)` |
| `bottleneck_no_u` | revised paper | policy sensitivity | `T0 = 0.60S0 + 0.40 max(N, A)` |
| `benchmark` | circulated paper | conventional reference | `B = 0.55N + 0.20A + 0.15U + 0.10R` |

Weights are exact fractions in the registry and become floats once, at scoring.
Each rule has a score kind that the manifest and every export row carry: additive score, need-first secondary score, or bottleneck score.
Under need-first ordering N is the primary sort key and not a summand, so the manifest lists only the secondary weights and names N as `primary_sort_key`.
The export has a `sort_key_primary` column for it, and the secondary score is `score_point`.
Under a bottleneck rule the contributions are scaled by 0.60 and a separate maximum term, 0.40 times the maximum, names the components that attain it.
The contributions plus the maximum term add up to the bottleneck score.

Under an urgency-omitted rule the output does not depend on the urgency scalar.
The engine does not read U for that rule, reports no U value, and leaves the U anchor out of the manifest.
The manifest `input_sha256` still covers the whole input, including the urgency scalar, so it changes when the scalar changes.

### Invariants

- No imputation. An unknown value stays `None`, and a missing environmental input ranges over 0 to 1.
- Anchors are fit on every record passed in. Filter the results, not the input.
- Order is exact numeric comparison, with school name ascending as the last tie-break.
- An interval school never receives a point rank.
- A point rank and the best and worst ranks are different scopes, and every export row names both.

### Cohorts and gate

A cohort belongs to a school under one rule, because rules read different components.

- Verification queue: the gate fails, or the rule reads U and U is unknown.
- Interval: the rule reads an environmental component (Q, E or L) that is missing.
- Complete: otherwise.

The benchmark reads no environmental component, so every eligible school is complete under it.
Under the other six rules the complete cohort is smaller whenever a school misses an environmental input.
`prepare` records the rule-agnostic facts (gate failures and missing components), and `screen` decides the cohort.

Gate reasons from the study are a missing stock field, a negative stock count, and a denominator (total classrooms, teachers) that is not positive.
The engine adds unrecognized power or water text, unrecognized locality, unresolved area context or reach, and unknown urgency under a rule that reads it.
The added reasons are inert on the frozen data.

### Rank scopes

- `rank_point` ranks a complete school among the schools complete under that rule. The scope label reads `complete under this rule (n)`.
- `rank_best` and `rank_worst` bound the rank among the eligible schools, complete and interval together. The scope label reads `eligible (n)`.

A complete school's point rank can therefore lie outside its own bounds.
With one interval school certainly ahead of a complete school, the point rank is 1 and the bounds are 2 and 2.
Never read the two as one number.

Ranks from different rules use different cohorts.
`common_cohort(*runs)` returns the schools complete under every compared run.
`rank_in_common_cohort(run, cohort)` ranks one run's point scores within it, with the same tie rule, and returns the scope label and the count.
Use it for matched comparisons and for a rule switch in a user interface.
The cohort shared by all seven rules is the smallest complete cohort.

`pairwise_metrics(run_a, run_b)` compares two runs of one input on the schools complete under both.
It returns `n`, the Spearman correlation, Kendall tau, the pairwise discordance (the fraction of school pairs whose order reverses, so tau is 1 minus twice the discordance), the median and maximum absolute rank shift, and for K = 10, 20, 30 and 40 the overlap, the Jaccard index and the two set sizes.
It also lists the top-20 exits (in the top 20 under `a` only, ordered by rank under `a`) and entrants (in the top 20 under `b` only, ordered by rank under `b`) with both ranks.
Metrics that need at least two schools are `None` below that, never `NaN`.
`rank_point_scores` and `compare_ranks` are the same computation on plain rows, for callers that hold stored results instead of runs.

### Input contract

`INPUT_CONTRACT` in `screening/inputs.py` is the single schema.
Each field lists its meaning, unit, source table and source column.
Identity fields pass through untouched.
`urgency_source_scalar` is the supplied hazard-related scalar (source column `R`).
It is not the reach component R, which comes from `walking_catchment_population`.

These fields enter as prepared input because their lineage is upstream extraction or a recorded correction.

| Field | Reason |
| --- | --- |
| `province`, `district` | Spatial-join correction recorded in the study. |
| `progression_g10_corrected_pct`, `progression_g12_corrected_pct` | Raw rates bounded to 0..100 by the recorded correction. |
| `district_luminosity_area_integral` | Corrected district integral from EXP-14, mapped to schools. |
| `urgency_source_scalar`, `walking_catchment_population` | Geospatial extraction. The urgency lineage is unresolved. |
| `aqi_p95_selected`, `emissions_co2e_100yr_10km_tonnes`, `water_flooded_vegetation_fraction_500m` | EXP-20 environment features. |

### Lineage of each component

All reference paths are under `.audit-work/methodology/`.

| Component | Engine formula | Reference code |
| --- | --- | --- |
| permanent classroom deficit | `1 - clip(permanent / total, 0, 1)`, total > 0 | `scripts/methodology_experiments.py` `prepare_analysis_data` |
| teacher housing deficit | `1 - clip(houses / teachers, 0, 1)`, teachers > 0 | same |
| facility presence deficit | `1 - (facility types with count > 0) / 6`, unknown if any count is unknown | same |
| service deficit | mean of power and water deficit, unknown if either is unknown | same, `power_deficit`, `water_deficit` |
| locality disadvantage | six-level table | same, `locality_score` |
| N | equal mean of the five | same, `school_need_core` |
| progression deficits | `1 - corrected rate / 100` | same |
| secondary participation deficit | `1 - scale(rate per 1,000)` | same, `normalize_observed` |
| activity scale deficit | `1 - scale(log1p(max(integral, 0)))` | `experiments/nightlights/EXP-10-v0.1.0-20261006/scoring/run_exp10_scoring.py` `normalize_nightlight`; EXP-15 `run_analysis.py` swaps in the EXP-14 integral |
| conflict exposure | `scale(log1p(exposed population))` | `prepare_analysis_data` |
| female disadvantage | `clip((0.5 - clip(female / total, 0, 1)) / 0.5, 0, 1)` | same |
| A | `clip(0.25 p10 + 0.15 p12 + 0.25 secondary + 0.15 activity + 0.10 conflict + 0.10 female, 0, 1)` | EXP-10 `area_columns` |
| U | `scale(urgency_source_scalar)` | `prepare_analysis_data`, `normalize_observed(frame["R"])` |
| R | `scale(log1p(walking catchment population))` | same, `reach_walking` |
| Q, E | `scale(value)` and `scale(log1p(value))`, valid if finite and non-negative | EXP-21 `run_analysis.py` `normalize` |
| L | natural fraction, valid within 0..1 | same |
| ranks, bounds | `rank_point`, `interval_rank_bounds`, `need_first_results`, `bottleneck_results` | EXP-21 `run_analysis.py` |
| urgency-omitted rules | weights divided by 0.95, U out of the sum and the maximum | `publication_followup/20261020/comparison/run_comparison.py` |

`scale` clips to the observed 5th and 95th percentile over all records, then rescales linearly to 0..1.
A constant column scales to 0.5, and its anchor is flagged `degenerate` in the manifest.

Two limits are faithful to the study and should not be read as bugs:

- Power and water text is coded by substring and the first matching group wins, so "no generator" codes as a generator.
- A negative AQI, emissions or land value becomes unknown, so the school is interval under rules that read it. A negative walking catchment population makes reach unresolved, and the school fails the gate.

### Reproduction check

`tests/test_screening_reproduction.py` runs the engine from prepared inputs and compares it school by school with the frozen EXP-21, EXP-22 and comparison-package outputs.
It is skipped unless the data is present.

```sh
cd packages/school_scoring
RISE_PNG_REFERENCE_ROOT=<repo>/.audit-work/methodology \
RISE_PNG_DATASETS_ROOT=<repo>/datasets \
python -I -m pytest tests/test_screening_reproduction.py -m reproduction
```

It writes `reproduction_report.json`, `mismatching_rows.csv` and `need_first_scope_differences.csv` to `RISE_PNG_REPRODUCTION_OUTPUT`.
The default is `<reference root>/../reproduction/screening-engine-20261020/`.
Identities, cohorts and ranks must match exactly.
Scores must match within 1e-12.
Every check name states its scope.

What the frozen outputs cover:

- All seven rules are compared on their common complete cohort, with ranks produced by `rank_in_common_cohort`.
- The benchmark is compared over every eligible school against EXP-21 `benchmark_replay.csv`.
- For `additive_u`, `need_first_u` and `bottleneck_u`, scores, bounds and point ranks are compared against EXP-21.
- For `additive_no_u`, the bounds and point ranks over the eligible cohort are compared against the comparison package.
- `pairwise_metrics` is compared for every pair of rules against `pairwise_metrics.csv` (`n`, set sizes and overlaps exactly; correlations, discordance, shifts and Jaccard indices within 1e-12), and the top-20 entrants and exits against every row of `top20_changes.csv` (ranks exactly, scores and components within 1e-12).
- EXP-22, the run behind the revised paper, is compared for every rule it reports:
  - `additive_no_u`, `need_first_no_u` and `bottleneck_no_u`: cohorts, scores, bounds, point ranks and the eligible-scope rank bounds, against `all_school_results.csv`, `need_first_results.csv` and `bottleneck_results.csv`.
  - `benchmark`: `benchmark_replay.csv`.
  - `additive_u`, the explicit-urgency reference: `reference_u_restoration.csv`, with its component values.
  - The score contributions of `additive_no_u` (each need part and each component, lower and upper) and its weights: `recommended_score_contributions.csv` and `contribution_weights.csv`.
  - The accepted deterministic replay (`accepted_no_u_replay.csv`): the engine against the comparison file the replay names, and the replay's own statement that it passed, for as many schools as the engine compared.
  - The four matched-cohort comparisons and the per-school ranks and scores behind them: `matched120_comparisons.csv` and `rank_movements_matched120.csv`.
  - The normalization anchors, with EXP-21's.
- EXP-22 does not report `need_first_u` or `bottleneck_u`; they are reproduced from EXP-21, so every rule is compared school by school with an experiment's output.

EXP-21 numbers each complete school's `need_first_rank_point` by its position among all eligible schools.
The engine's point rank counts only the complete cohort, so the two differ for schools that sit below interval schools.
The reproduction reports every such school in `need_first_scope_differences.csv`.
It also checks that the experiment's position equals the engine's best rank wherever best equals worst, and lies within the best and worst rank elsewhere.
The same holds for EXP-22 and `need_first_no_u`.

The EXP-15 prepared table stores component values that were read back from a CSV with pandas' default float parser.
Those values sit up to 1.7e-16 from the exact result.
On every column the original EXP-10 output holds, the engine matches it bit for bit.

The failure modes that the tests guard are listed in `tests/FAILURE_MODES.md`, and each test names the ones it covers.
