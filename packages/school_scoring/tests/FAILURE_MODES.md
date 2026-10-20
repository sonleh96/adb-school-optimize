# Screening engine failure modes

Each test in `test_screening_*.py` carries the id of the failure mode it guards.
The reproduction test (`test_screening_reproduction.py`) guards FM1, FM2, FM4, FM6, FM7, FM8, FM9 and FM13 against the frozen research outputs.

| Id | Failure mode |
| --- | --- |
| FM1 | Cohort drift. The gate admits or refuses the wrong schools, or a gate reason is lost. |
| FM2 | Misjoins and duplicate keys. Rows are reordered, duplicated, or joined on the wrong key. |
| FM3 | Hidden imputation. An unknown value is replaced by zero, a default, a mean, or a renormalized weight. |
| FM4 | Refit or changed anchors. Anchors are fit on a filtered subset, or a value outside the cohort stops affecting them. |
| FM5 | Reversed direction. A deficit or context component moves the wrong way. |
| FM6 | Floating-point and tie errors. Rounded values decide rank, or equal scores are not separated by school name. |
| FM7 | Incorrect bounds. Interval width, rank envelopes, or equal-N group offsets are wrong. |
| FM8 | Scenario confusion. Urgency leaks into an urgency-omitted rule, or a rule carries the wrong weights or identity. |
| FM9 | Non-reproducible manifest. The manifest changes between identical runs, or fails to change when inputs change. |
| FM10 | Rank scope confusion. An interval school receives a point rank, or a rank is not labeled with its cohort scope. |
| FM11 | Coding errors. Power, water or locality text maps to the wrong deficit. |
| FM12 | Contract drift. The documented input contract and the parsed record disagree. |
| FM13 | Pairwise metric errors. A sign, a denominator or a top-K size is wrong, entrants and exits are swapped or misordered, or an undefined metric is reported as a number. |
