# school_scoring Package

Reusable scoring engine for school prioritization.

Source methodology:
- [score_calculations.ipynb](/Users/sonle/Documents/work/ADB/adb-school-optimize/score_calculations.ipynb)
- [codex_school_scoring_module_instructions.md](/Users/sonle/Documents/work/ADB/adb-school-optimize/build_instructions/codex_school_scoring_module_instructions.md)

Expected responsibilities:
- validate school-level input data
- preprocess and impute as configured
- compute all score components and final ranks
- support default and user-supplied weight sets
- return deterministic results plus explainability outputs

## Screening engine

`school_scoring.screening` implements the circulated research method and the urgency-omitted scenario.
It sits beside the older Need and Priority model and does not change it.

```python
from school_scoring.screening import parse_records, prepare, screen

records = parse_records(frame)  # boundary: typed records, missing cells stay None
prepared = prepare(records)  # components, anchors, evidence gate, cohorts
run = screen(prepared, "additive_no_u")
run.manifest.to_dict()  # rule, weights, anchors, hashes, scopes, version
run.to_frame()  # flat export, one row per input record, in input order
```

### Rules

| Id | Role | Formula |
| --- | --- | --- |
| `additive_u` | circulated reference | `S = 0.60N + 0.15A + 0.05U + 0.05R + 0.05Q + 0.05E + 0.05L` |
| `additive_no_u` | proposed primary, pending author review | `S0 = (S - 0.05U) / 0.95`, so 12/19 N, 3/19 A, 1/19 each for R, Q, E, L |
| `need_first_u` | strict alternative | N descending, then `0.15A + 0.05U + 0.05R + 0.05Q + 0.05E + 0.05L`, then name |
| `need_first_no_u` | strict alternative | N descending, then `(0.15A + 0.05R + 0.05Q + 0.05E + 0.05L) / 0.95`, then name |
| `bottleneck_u` | policy sensitivity | `T = 0.60S + 0.40 max(N, A, U)` |
| `bottleneck_no_u` | policy sensitivity | `T0 = 0.60S0 + 0.40 max(N, A)` |
| `benchmark` | conventional reference | `B = 0.55N + 0.20A + 0.15U + 0.10R` |

Weights are exact fractions in the registry and become floats once, at scoring.
Under an urgency-omitted rule the engine never reads U, never reports it, and leaves its anchor out of the manifest.
Under need-first ordering the reported score is the secondary score, and N is the primary key.
Under a bottleneck rule the contributions describe the additive score S before the 0.60 and 0.40 blend, and `maximum_component` holds the maximum that was used.

### Invariants

- No imputation. An unknown value stays `None`, and a missing environmental input ranges over 0 to 1.
- Anchors are fit on every record passed in. Filter the results, not the input.
- Order is exact numeric comparison, with school name ascending as the last tie-break.
- Point ranks exist only for the complete cohort and use that cohort as scope.
- Best and worst ranks use the eligible cohort (complete plus interval) as scope.
- An interval school never receives a point rank.

### Cohorts and gate

- Complete: passes the gate and has Q, E and L.
- Interval: passes the gate and lacks at least one of Q, E, L.
- Verification queue: fails the gate.

Gate reasons from the study are a missing stock field, a negative stock count, and a denominator (total classrooms, teachers) that is not positive.
The engine adds unrecognized power or water text, unrecognized locality, unresolved area context or reach, and unknown urgency under a rule that uses it.
The added reasons are inert on the frozen data.

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
A constant column scales to 0.5.

### Reproduction check

`tests/test_screening_reproduction.py` runs the engine from prepared inputs and compares it school by school with the frozen EXP-21 and comparison-package outputs.
It is skipped unless the data is present.

```sh
cd packages/school_scoring
RISE_PNG_REFERENCE_ROOT=<repo>/.audit-work/methodology \
RISE_PNG_DATASETS_ROOT=<repo>/datasets \
python -I -m pytest tests/test_screening_reproduction.py -m reproduction
```

It writes `reproduction_report.json` and `mismatching_rows.csv` to `RISE_PNG_REPRODUCTION_OUTPUT`.
The default is `<reference root>/../reproduction/screening-engine-20261020/`.
Identities, cohorts and ranks must match exactly.
Scores must match within 1e-12.

The EXP-15 prepared table stores component values that were read back from a CSV with pandas' default float parser.
Those values sit up to 1.7e-16 from the exact result.
On every column the original EXP-10 output holds, the engine matches it bit for bit.

The failure modes that the tests guard are listed in `tests/FAILURE_MODES.md`, and each test names the ones it covers.
