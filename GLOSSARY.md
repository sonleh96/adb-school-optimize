# Glossary

Terms used by the screening engine in `packages/school_scoring`.
Each sentence is on its own line.

## Screening

Ordering existing school records for closer inspection before any intervention decision.
It does not establish condition accuracy, site safety or intervention benefit.

## Component

One of the seven normalized values a rule combines: N, A, U, R, Q, E and L.
Every component runs from 0 to 1, and a larger value raises inspection attention.

## School need, N

The equal mean of five disadvantages: permanent classrooms, teacher housing, facility presence, services and locality.
It includes a locality term, so it is not a pure building-condition measure.

## Area context, A

A weighted composite of six district-level disadvantages: Grade 10 progression, Grade 12 progression, secondary participation, activity scale, conflict exposure and female disadvantage.
Schools in one district share these values, so they are not independent school measurements.

## Urgency, U

The supplied hazard-related scalar after percentile scaling.
Its extraction and meaning are unresolved.
The urgency-omitted rules give it no weight.

## Urgency source scalar

The raw supplied value that U is scaled from, stored in source column `R`.
It is not the reach component R.

## Reach, R

The walking catchment population after log transformation and percentile scaling.
It is a context measure, not a count of beneficiaries.

## Environmental components, Q, E and L

Q is the school-assigned p95 of daily AQI, E is the log of eligible nearby emissions, and L is the 500 m fraction classified as water plus flooded vegetation.
They are different constructs and do not form a common hazard scale.
They are the only components that can be missing and still leave a school scored.

## Evidence gate

The check that decides whether a school has the condition evidence to be scored.
A school that fails it is not given a score.
Each failure is recorded as a gate failure reason.

## Cohort

The group a school falls into under one rule, after the gate and the check of what that rule reads.
Complete means the gate passed and every component the rule reads is known.
Interval means the gate passed but the rule reads an environmental component (Q, E or L) that is unknown.
Verification queue means the gate failed, or the rule reads U and U is unknown.
Being in the queue does not mean low need.
The benchmark reads no environmental component, so every school that passes the gate is complete under it.

## Normalization anchors

The 5th and 95th percentiles used to scale a component.
They are fit on every record supplied, never on a filtered subset.

## Rule

One registered way to turn components into an ordering, with a fixed id, label, role, formula and weights.
The ids are `additive_u`, `additive_no_u`, `need_first_u`, `need_first_no_u`, `bottleneck_u`, `bottleneck_no_u` and `benchmark`.

## Additive rule

A weighted sum that lets one component make up for another.

## School-need-first rule

An ordering by N first, then a weighted score of the other components, then school name.
Context cannot reverse unequal N values.

## Bottleneck rule

A blend of 0.60 of the additive score and 0.40 of the largest selected component.
It still lets components compensate, and it is not a safety threshold.

## Benchmark

The conventional comparator `0.55N + 0.20A + 0.15U + 0.10R`.
It has no environmental components.

## Score bounds

The lower and upper score a school can have when its missing environmental components take any value from 0 to 1.
A missing component adds nothing to the lower score and its full weight to the upper score.

## Point rank

A school's rank among the schools that are complete under the same rule, from its exact score.
An interval school has no point rank.
The scope label reads `complete under this rule (n)`.

## Rank envelope

The best and worst rank a school can have among all eligible schools, given the score bounds.
Best is one plus the schools that are certainly ahead.
Worst is one plus the schools that are possibly ahead.
The scope label reads `eligible (n)`.
It is a different scope from the point rank, so a complete school's point rank can fall outside its envelope.

## Common cohort

The schools that are complete under every rule being compared.
Matched comparisons rank each rule's point scores inside it.

## Score kind

What the exported score column means under a rule: an additive score, a need-first secondary score, or a bottleneck score.

## Provenance and policy role

Provenance says where a rule comes from: the circulated paper, or the proposed follow-up that is pending author review.
Policy role says how the rule is meant to be used: primary, strict alternative, policy sensitivity, or conventional reference.

## Tie rule

Scores are compared exactly, and equal scores are ordered by school name ascending.
Rounded values never decide a rank.

## Run manifest

The record that makes a run reproducible.
It holds the rule, score kind, weights, normalization anchors with their hash, tie rule, rank scopes with counts, input hash and package version.

## Input contract

The one schema that names every input field with its meaning, unit and source column.
Data is parsed against it at the boundary, and missing cells stay unknown.
