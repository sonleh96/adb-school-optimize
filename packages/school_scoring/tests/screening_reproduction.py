"""Reproduction harness: run the screening engine from prepared inputs and compare it with frozen outputs.

Reads reference files only. Never writes next to them and never edits them.
Quantities are compared school by school.
Identities, cohorts and ranks must agree exactly.
Scores must agree within ``TOLERANCE`` absolute, and the largest deviation is reported per quantity.
"""

from __future__ import annotations

import hashlib
import json
import platform
import re
import sys
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from school_scoring.screening import (
    INPUT_CONTRACT,
    TOP_K_VALUES,
    Cohort,
    Component,
    PreparedRecord,
    SchoolResult,
    ScreeningRun,
    Table,
    assemble_frame,
    common_cohort,
    get_rule,
    pairwise_metrics,
    parse_records,
    prepare,
    rank_in_common_cohort,
    screen_all,
)

TOLERANCE = 1e-12
EXP15 = "experiments/nightlights/EXP-15-v0.1.0-20261008"
EXP10_BASELINE = "experiments/nightlights/EXP-10-v0.1.0-20261006/scoring/baseline_reconstruction/deterministic_school_results.csv"
EXP20_FEATURES = "experiments/environment/EXP-20-v0.1.0-20261012/features/results/environment_features.csv"
EXP21 = "experiments/decision_rules/EXP-21-v0.1.0-20261012/results"
# The revised paper's run: the same rules with urgency left out of every primary calculation.
EXP22 = "experiments/decision_rules/EXP-22-v0.1.0-20261020/results"
COMPARISON = "publication_followup/20261020/comparison/results"
RAW_SCHOOLS_FILE = "png_curated_sec_schools_access_v3_clean.csv"
PREPARED_FILE = f"{EXP15}/results/tables/prepared_current_school_data.csv"

COHORT_BY_REFERENCE_LABEL = {
    "complete primary point cohort": Cohort.COMPLETE,
    "complete point cohort": Cohort.COMPLETE,
    "evidence-eligible interval cohort": Cohort.INTERVAL,
    "interval-only eligible cohort": Cohort.INTERVAL,
    "condition-ineligible verification queue": Cohort.VERIFICATION_QUEUE,
}

Value = float | str | None
Getter = Callable[[SchoolResult], Value]


def _clean(value: Any) -> Value:
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return None
    if isinstance(value, str):
        return value
    return float(value)


@dataclass
class Check:
    name: str
    reference: str
    scope: str
    kind: str
    n_compared: int = 0
    n_bit_identical: int = 0
    max_abs_deviation: float = 0.0
    n_mismatch: int = 0
    rule: str | None = None

    @property
    def passed(self) -> bool:
        return self.n_mismatch == 0


@dataclass
class Harness:
    cohorts: dict[str, Cohort]
    checks: list[Check] = field(default_factory=list)
    mismatches: list[dict[str, Any]] = field(default_factory=list)
    failed_schools: set[str] = field(default_factory=set)
    scope_differences: list[dict[str, Any]] = field(default_factory=list)

    def compare(
        self,
        name: str,
        reference_label: str,
        scope: str,
        engine: dict[str, Any],
        reference: dict[str, Any],
        *,
        exact: bool,
        rule: str | None = None,
    ) -> None:
        """Compare name-keyed values. A missing value only agrees with a missing value.

        ``rule`` names the screening rule whose output is compared, so the report can say which rules a reference covers.
        """
        name = f"{name} [{scope}]"
        if any(done.name == name for done in self.checks):
            raise AssertionError(f"two checks are named {name!r}")
        check = Check(name, reference_label, scope, "exact" if exact else f"abs<={TOLERANCE:g}", rule=rule)
        if set(engine) != set(reference):
            raise AssertionError(f"{name}: school sets differ between engine and reference")
        for school in engine:
            a, b = _clean(engine[school]), _clean(reference[school])
            if a is None or b is None or isinstance(a, str) or isinstance(b, str):
                identical = a == b
                deviation = 0.0 if identical else float("inf")
            else:
                identical, deviation = a == b, abs(a - b)
            agrees = identical or (not exact and deviation <= TOLERANCE)
            check.n_compared += 1
            check.n_bit_identical += int(identical)
            if np.isfinite(deviation):
                check.max_abs_deviation = max(check.max_abs_deviation, deviation)
            if not agrees:
                check.n_mismatch += 1
                self.failed_schools.add(school)
                self.mismatches.append(
                    {
                        "check": name,
                        "school_name": school,
                        "engine": a,
                        "reference": b,
                        "abs_deviation": deviation,
                    }
                )
        self.checks.append(check)


def _column(frame: pd.DataFrame, column: str) -> dict[str, Any]:
    return dict(zip(frame["School Name"], frame[column], strict=True))


def _results(run: ScreeningRun, getter: Getter, only: set[str] | None = None) -> dict[str, Value]:
    return {r.school_name: getter(r) for r in run.results if only is None or r.school_name in only}


def _only(mapping: dict[str, Any], keep: set[str]) -> dict[str, Any]:
    return {k: v for k, v in mapping.items() if k in keep}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


PART_GETTERS: dict[str, Callable[[PreparedRecord], Value]] = {
    "permanent_classroom_deficit": lambda p: p.need_parts.permanent_classroom_deficit,
    "teacher_housing_deficit": lambda p: p.need_parts.teacher_housing_deficit,
    "facility_presence_deficit": lambda p: p.need_parts.facility_presence_deficit,
    "service_deficit": lambda p: p.need_parts.service_deficit,
    "locality_disadvantage": lambda p: p.need_parts.locality_disadvantage,
    "progression10_deficit": lambda p: p.area_parts.progression_g10_deficit,
    "progression12_deficit": lambda p: p.area_parts.progression_g12_deficit,
    "secondary_participation_deficit": lambda p: p.area_parts.secondary_participation_deficit,
    "nightlight_deficit": lambda p: p.area_parts.activity_scale_deficit,
    "conflict_exposure": lambda p: p.area_parts.conflict_exposure,
    "female_disadvantage": lambda p: p.area_parts.female_disadvantage,
    "school_need_core": lambda p: p.components.N,
    "area_context": lambda p: p.components.A,
    "urgency": lambda p: p.components.U,
    "reach_walking": lambda p: p.components.R,
}
# EXP-15 recomputed these two from corrected luminosity, so the EXP-10 output does not hold them.
NOT_IN_EXP10_BASELINE = ("nightlight_deficit", "area_context")

NEED_PART_CONTRIBUTIONS = {
    "permanent_classroom_deficit_contribution": "permanent_classroom_deficit",
    "teacher_housing_deficit_contribution": "teacher_housing_deficit",
    "facility_presence_deficit_contribution": "facility_presence_deficit",
    "service_deficit_contribution": "service_deficit",
    "locality_disadvantage_contribution": "locality_disadvantage",
}
COMPONENT_CONTRIBUTIONS = (
    ("area_contribution", "A", "lower"),
    ("urgency_contribution", "U", "lower"),
    ("reach_contribution", "R", "lower"),
    ("aqi_contribution_lower", "Q", "lower"),
    ("aqi_contribution_upper", "Q", "upper"),
    ("emissions_contribution_lower", "E", "lower"),
    ("emissions_contribution_upper", "E", "upper"),
    ("land_contribution_lower", "L", "lower"),
    ("land_contribution_upper", "L", "upper"),
)


def _contribution(result: SchoolResult, component: str, side: str) -> float | None:
    for contribution in result.contributions:
        if contribution.component.value == component:
            return getattr(contribution, side)
    return None


@dataclass(frozen=True)
class NeedFirstPositions:
    """How EXP-21 or EXP-22 numbers a complete school under school-need-first, set against the engine's rank."""

    rule_id: str
    experiment: str
    complete_names: list[str]
    determined: list[str]
    differing: list[str]


def _anchor_checks(
    h: Harness,
    load: Callable[[str], pd.DataFrame],
    anchors: dict,
    experiment: str,
    folder: str,
    everyone: str,
) -> None:
    """The three fitted anchors against an experiment's primary normalization table."""
    primary = load(f"{folder}/normalization_anchors.csv").query("variant == 'primary'").set_index("component")
    tag = "" if experiment == "EXP-21" else f"{experiment} "
    for name in ("aqi", "emissions", "land"):
        for label, mine, reference in (
            ("p05", anchors[name].p05, primary.loc[name, "p05_transformed"]),
            ("p95", anchors[name].p95, primary.loc[name, "p95_transformed"]),
            ("valid_rows", float(anchors[name].n_valid), primary.loc[name, "valid_rows"]),
        ):
            h.compare(
                f"{tag}anchor {name} {label}",
                f"{folder}/normalization_anchors.csv",
                f"anchors fit on {everyone}",
                {"a": mine},
                {"a": reference},
                exact=label == "valid_rows",
            )


def _contribution_checks(
    h: Harness,
    run: ScreeningRun,
    reference: pd.DataFrame,
    ref_file: str,
    eligible: set[str],
    eligible_scope: str,
    tag: str = "",
) -> None:
    """Each need part's and each component's contribution to a rule's score, lower and upper bound."""
    rule_id = run.manifest.rule_id
    for column, part in NEED_PART_CONTRIBUTIONS.items():
        mine = _results(run, lambda r, p=part: getattr(r.need_part_contributions, p, None), eligible)
        h.compare(
            f"{tag}{rule_id} contribution {column}",
            ref_file,
            eligible_scope,
            mine,
            _only(_column(reference, column), eligible),
            exact=False,
            rule=rule_id,
        )
    for column, component, side in COMPONENT_CONTRIBUTIONS:
        if component == "U" and not run.manifest.uses_urgency:
            continue
        mine = _results(run, lambda r, c=component, s=side: _contribution(r, c, s), eligible)
        h.compare(
            f"{tag}{rule_id} contribution {column}",
            ref_file,
            eligible_scope,
            mine,
            _only(_column(reference, column), eligible),
            exact=False,
            rule=rule_id,
        )


def _benchmark_checks(
    h: Harness,
    run: ScreeningRun,
    reference: pd.DataFrame,
    ref_file: str,
    eligible: set[str],
    scope: str,
    tag: str = "",
) -> None:
    for column, getter, exact in (
        ("score_point", lambda r: r.score_point, False),
        ("score_compensatory", lambda r: r.score_point, False),
        ("rank_point", lambda r: r.rank_point, True),
        ("rank_compensatory", lambda r: r.rank_point, True),
    ):
        h.compare(
            f"{tag}benchmark {column}",
            ref_file,
            scope,
            _results(run, getter, eligible),
            _only(_column(reference, column), eligible),
            exact=exact,
            rule="benchmark",
        )


def _need_first_checks(
    h: Harness,
    run: ScreeningRun,
    reference: pd.DataFrame,
    experiment: str,
    folder: str,
    eligible: set[str],
    eligible_scope: str,
    tag: str = "",
) -> NeedFirstPositions:
    """Secondary-score bounds and rank bounds against an experiment, then its position of each complete school."""
    rule_id = run.manifest.rule_id
    ref_file = f"{folder}/need_first_results.csv"
    for column, getter, exact in (
        ("secondary_score_lower", lambda r: r.score_lower, False),
        ("secondary_score_upper", lambda r: r.score_upper, False),
        ("need_first_rank_min_possible", lambda r: r.rank_best, True),
        ("need_first_rank_max_possible", lambda r: r.rank_worst, True),
    ):
        h.compare(
            f"{tag}{rule_id} {column}",
            ref_file,
            eligible_scope,
            _results(run, getter, eligible),
            _only(_column(reference, column), eligible),
            exact=exact,
            rule=rule_id,
        )
    # The experiment numbers a complete school by its position among all eligible schools, interval schools included.
    # That position must sit inside the engine's best and worst rank, and equal it where best equals worst.
    position = _column(reference, "need_first_rank_point")
    results = {r.school_name: r for r in run.results}
    complete_names = [n for n, r in results.items() if r.rank_point is not None]
    determined = [n for n in complete_names if results[n].rank_best == results[n].rank_worst]
    h.compare(
        f"{tag}{rule_id} {experiment} position equals the engine's rank where best equals worst",
        ref_file,
        f"{eligible_scope}, schools with a determined rank ({len(determined)})",
        {n: float(results[n].rank_best) for n in determined},
        {n: position[n] for n in determined},
        exact=True,
        rule=rule_id,
    )
    h.compare(
        f"{tag}{rule_id} {experiment} position lies within the engine's best and worst rank",
        ref_file,
        eligible_scope,
        {n: float(results[n].rank_best <= position[n] <= results[n].rank_worst) for n in complete_names},
        {n: 1.0 for n in complete_names},
        exact=True,
        rule=rule_id,
    )
    differing = [n for n in complete_names if results[n].rank_point != position[n]]
    for n in differing:
        gap = int(position[n] - results[n].rank_point)
        h.scope_differences.append(
            {
                "rule_id": rule_id,
                "experiment": experiment,
                "school_name": n,
                "engine_rank_point_complete_scope": results[n].rank_point,
                "experiment_position_eligible_scope": int(position[n]),
                "engine_rank_best": results[n].rank_best,
                "engine_rank_worst": results[n].rank_worst,
                "rank_determined": results[n].rank_best == results[n].rank_worst,
                "gap": gap,
                "reason": f"{experiment} counts {gap} interval school(s) ahead of this school; "
                "the engine ranks only the complete cohort",
            }
        )
    return NeedFirstPositions(rule_id, experiment, complete_names, determined, differing)


def _bottleneck_checks(
    h: Harness,
    run: ScreeningRun,
    reference: pd.DataFrame,
    ref_file: str,
    eligible: set[str],
    eligible_scope: str,
    point_scope: str,
    everyone: str,
    tag: str = "",
) -> None:
    rule_id = run.manifest.rule_id
    for column, getter, exact, scope, keep in (
        ("bottleneck_score_lower", lambda r: r.score_lower, False, eligible_scope, eligible),
        ("bottleneck_score_upper", lambda r: r.score_upper, False, eligible_scope, eligible),
        ("bottleneck_score_point", lambda r: r.score_point, False, everyone, None),
        ("bottleneck_rank_min_possible", lambda r: r.rank_best, True, eligible_scope, eligible),
        ("bottleneck_rank_max_possible", lambda r: r.rank_worst, True, eligible_scope, eligible),
        ("bottleneck_rank_point", lambda r: r.rank_point, True, point_scope, None),
    ):
        values = _column(reference, column)
        h.compare(
            f"{tag}{rule_id} {column}",
            ref_file,
            scope,
            _results(run, getter, keep),
            values if keep is None else _only(values, keep),
            exact=exact,
            rule=rule_id,
        )


# What EXP-22 saved for the accepted deterministic replay of the urgency-omitted rule, against the comparison package.
ACCEPTED_REPLAY_COLUMNS: dict[str, tuple[str, Callable[[SchoolResult], Value], bool]] = {
    "score_lower_replay": ("score_lower", lambda r: r.score_lower, False),
    "score_upper_replay": ("score_upper", lambda r: r.score_upper, False),
    "score_point_replay": ("score_point", lambda r: r.score_point, False),
    "rank_min_possible_replay": ("rank_min_possible", lambda r: r.rank_best, True),
    "rank_max_possible_replay": ("rank_max_possible", lambda r: r.rank_worst, True),
    "rank_point_replay": ("rank_point_complete120", lambda r: r.rank_point, True),
}
# EXP-22's matched-120 comparisons, as (left rule, right rule) of the engine. "Recommended" is the urgency-omitted additive rule.
MATCHED120_PAIRS = {
    "benchmark_to_recommended": ("benchmark", "additive_no_u"),
    "recommended_to_bottleneck": ("additive_no_u", "bottleneck_no_u"),
    "recommended_to_need_first": ("additive_no_u", "need_first_no_u"),
    "need_first_to_bottleneck": ("need_first_no_u", "bottleneck_no_u"),
}
# EXP-22's per-school ranks on the matched cohort, by the engine rule each column belongs to.
MATCHED120_RANK_COLUMNS = {
    "benchmark_rank": "benchmark",
    "recommended_rank": "additive_no_u",
    "bottleneck_rank": "bottleneck_no_u",
    "need_first_rank": "need_first_no_u",
}
MATCHED120_SCORE_COLUMNS = {
    "benchmark_score": "benchmark",
    "recommended_score": "additive_no_u",
    "bottleneck_score": "bottleneck_no_u",
}
# EXP-22's weights table: each criterion's share of the urgency-omitted additive rule. A need part is a fifth of school need.
CONTRIBUTION_WEIGHT_COMPONENTS = {
    "school_need": "N",
    "area": "A",
    "reach": "R",
    "aqi": "Q",
    "emissions": "E",
    "land": "L",
}
NEED_PART_CRITERIA = tuple(NEED_PART_CONTRIBUTIONS.values())


def _exp22_checks(
    h: Harness,
    load: Callable[..., pd.DataFrame],
    runs: dict[str, ScreeningRun],
    eligible: set[str],
    eligible_scope: str,
    everyone: str,
    complete: Callable[[str], str],
) -> NeedFirstPositions:
    """EXP-22, the run behind the revised paper: every rule it reports, compared with the engine school by school.

    That is the urgency-omitted additive, need-first and bottleneck rules, the benchmark and the explicit-urgency
    reference, the accepted deterministic replay, the matched-120 comparisons, the score contributions and the weights.
    The normalization anchors are checked with the EXP-21 ones, by ``_anchor_checks``.
    """
    tag, folder = "EXP-22 ", EXP22
    additive = runs["additive_no_u"]

    # Cohorts: the three urgency-omitted rules read the same components, so they share one cohort.
    all_ref, all_file = load(f"{folder}/all_school_results.csv"), f"{folder}/all_school_results.csv"
    reference_cohort = {
        n: COHORT_BY_REFERENCE_LABEL[c].value for n, c in _column(all_ref, "cohort_class").items()
    }
    for rule_id in ("additive_no_u", "need_first_no_u", "bottleneck_no_u"):
        h.compare(
            f"{tag}{rule_id} cohort",
            all_file,
            everyone,
            {r.school_name: r.cohort.value for r in runs[rule_id].results},
            reference_cohort,
            exact=True,
            rule=rule_id,
        )

    # The urgency-omitted additive rule: scores, bounds and ranks.
    for column, getter, exact, scope in (
        ("score_lower", lambda r: r.score_lower, False, everyone),
        ("score_upper", lambda r: r.score_upper, False, everyone),
        ("score_point", lambda r: r.score_point, False, everyone),
        ("rank_min_possible", lambda r: r.rank_best, True, eligible_scope),
        ("rank_max_possible", lambda r: r.rank_worst, True, eligible_scope),
        ("rank_point", lambda r: r.rank_point, True, complete("additive_no_u")),
    ):
        h.compare(
            f"{tag}additive_no_u {column}",
            all_file,
            scope,
            _results(additive, getter),
            _column(all_ref, column),
            exact=exact,
            rule="additive_no_u",
        )

    # Need-first and bottleneck, and the benchmark, each against its own EXP-22 table.
    positions = _need_first_checks(
        h,
        runs["need_first_no_u"],
        load(f"{folder}/need_first_results.csv"),
        "EXP-22",
        folder,
        eligible,
        eligible_scope,
        tag,
    )
    _bottleneck_checks(
        h,
        runs["bottleneck_no_u"],
        load(f"{folder}/bottleneck_results.csv"),
        f"{folder}/bottleneck_results.csv",
        eligible,
        eligible_scope,
        complete("bottleneck_no_u"),
        everyone,
        tag,
    )
    _benchmark_checks(
        h,
        runs["benchmark"],
        load(f"{folder}/benchmark_replay.csv"),
        f"{folder}/benchmark_replay.csv",
        eligible,
        complete("benchmark"),
        tag,
    )

    # The explicit-urgency reference: the circulated additive rule restored as a sensitivity.
    restored, restored_file = (
        load(f"{folder}/reference_u_restoration.csv"),
        f"{folder}/reference_u_restoration.csv",
    )
    restored_run = runs["additive_u"]
    for column, getter, exact, scope in (
        ("score_lower", lambda r: r.score_lower, False, everyone),
        ("score_upper", lambda r: r.score_upper, False, everyone),
        ("score_point", lambda r: r.score_point, False, everyone),
        ("rank_min_possible", lambda r: r.rank_best, True, eligible_scope),
        ("rank_max_possible", lambda r: r.rank_worst, True, eligible_scope),
        ("rank_point", lambda r: r.rank_point, True, complete("additive_u")),
    ):
        h.compare(
            f"{tag}additive_u {column}",
            restored_file,
            scope,
            _results(restored_run, getter),
            _column(restored, column),
            exact=exact,
            rule="additive_u",
        )
    h.compare(
        f"{tag}additive_u complete exactly where the reference is point eligible",
        restored_file,
        everyone,
        {r.school_name: float(r.cohort is Cohort.COMPLETE) for r in restored_run.results},
        {n: float(v) for n, v in _column(restored, "point_eligible").items()},
        exact=True,
        rule="additive_u",
    )
    h.compare(
        f"{tag}additive_u eligible exactly where the reference is condition eligible",
        restored_file,
        everyone,
        {r.school_name: float(r.cohort is not Cohort.VERIFICATION_QUEUE) for r in restored_run.results},
        {n: float(v) for n, v in _column(restored, "condition_eligible").items()},
        exact=True,
        rule="additive_u",
    )
    for component in "NAURQEL":
        h.compare(
            f"{tag}component {component} in the explicit-urgency reference",
            restored_file,
            everyone,
            {r.school_name: getattr(r.components, component) for r in restored_run.results},
            _column(restored, component),
            exact=False,
            rule="additive_u",
        )

    # Score contributions and the weights behind them.
    contributions, contribution_file = (
        load(f"{folder}/recommended_score_contributions.csv"),
        f"{folder}/recommended_score_contributions.csv",
    )
    for column, getter, exact, scope in (
        ("score_lower", lambda r: r.score_lower, False, everyone),
        ("score_upper", lambda r: r.score_upper, False, everyone),
        ("score_point", lambda r: r.score_point, False, everyone),
        ("rank_min_possible", lambda r: r.rank_best, True, eligible_scope),
        ("rank_max_possible", lambda r: r.rank_worst, True, eligible_scope),
        ("rank_point", lambda r: r.rank_point, True, complete("additive_no_u")),
    ):
        h.compare(
            f"{tag}additive_no_u {column} in the contributions table",
            contribution_file,
            scope,
            _results(additive, getter),
            _column(contributions, column),
            exact=exact,
            rule="additive_no_u",
        )
    _contribution_checks(h, additive, contributions, contribution_file, eligible, eligible_scope, tag)
    h.compare(
        f"{tag}additive_no_u has no urgency contribution",
        contribution_file,
        eligible_scope,
        _results(additive, lambda r: float(_contribution(r, "U", "lower") is None), eligible),
        {n: 1.0 for n in eligible},
        exact=True,
        rule="additive_no_u",
    )
    weights = load(f"{folder}/contribution_weights.csv")
    rule = get_rule("additive_no_u")
    engine_weights = {
        criterion: float(rule.weight(Component(component)))
        for criterion, component in CONTRIBUTION_WEIGHT_COMPONENTS.items()
    }
    engine_weights.update(
        {part: engine_weights["school_need"] / len(NEED_PART_CRITERIA) for part in NEED_PART_CRITERIA}
    )
    h.compare(
        f"{tag}additive_no_u weights",
        f"{folder}/contribution_weights.csv",
        "the rule's criteria",
        engine_weights,
        dict(zip(weights["criterion"], weights["weight"], strict=True)),
        exact=False,
        rule="additive_no_u",
    )

    # The accepted deterministic replay: its own receipt must say passed on every school, and the engine must agree
    # with the file the replay was checked against.
    replay = load(f"{folder}/accepted_no_u_replay.csv")
    if set(replay["check_id"]) != set(ACCEPTED_REPLAY_COLUMNS):
        raise AssertionError(f"accepted replay checks changed: {sorted(replay['check_id'])}")
    for _, row in replay.iterrows():
        column, getter, exact = ACCEPTED_REPLAY_COLUMNS[row["check_id"]]
        named = str(row["reference"])
        if not named.endswith(".csv") or "publication_followup" not in named:
            raise AssertionError(f"accepted replay reference is not the comparison package: {named}")
        relative = named[named.index("publication_followup") :]
        target = load(relative)
        keep = set(target["School Name"])
        h.compare(
            f"{tag}accepted replay {row['check_id']}",
            relative,
            eligible_scope,
            _results(additive, getter, keep),
            _column(target, column),
            exact=exact,
            rule="additive_no_u",
        )
        h.compare(
            f"{tag}accepted replay {row['check_id']} receipt",
            f"{folder}/accepted_no_u_replay.csv",
            "the receipt's own statement",
            {
                "passed": float(row["status"] == "passed"),
                "n": float(row["n"]),
                "within tolerance": float(row["maximum_absolute_difference"] <= TOLERANCE),
            },
            {"passed": 1.0, "n": float(len(keep)), "within tolerance": 1.0},
            exact=True,
            rule="additive_no_u",
        )

    # The matched-120 comparisons and the ranks behind them.
    matched, matched_file = (
        load(f"{folder}/matched120_comparisons.csv"),
        f"{folder}/matched120_comparisons.csv",
    )
    if set(matched["comparison"]) != set(MATCHED120_PAIRS):
        raise AssertionError(f"matched-120 comparisons changed: {sorted(matched['comparison'])}")
    metrics = {name: pairwise_metrics(runs[a], runs[b]) for name, (a, b) in MATCHED120_PAIRS.items()}
    index = matched.set_index("comparison")
    scope = f"each pair's common complete cohort (n={sorted({m.n for m in metrics.values()})})"
    top20 = {name: next(t for t in m.top_k if t.k == 20) for name, m in metrics.items()}
    for column, getter, exact in (
        ("n", lambda name: float(metrics[name].n), True),
        ("spearman_rank", lambda name: metrics[name].spearman_rank, False),
        ("top20_overlap", lambda name: float(top20[name].overlap), True),
        ("top20_left", lambda name: float(top20[name].size_a), True),
        ("top20_right", lambda name: float(top20[name].size_b), True),
        ("median_absolute_rank_shift", lambda name: metrics[name].median_absolute_rank_shift, False),
        ("maximum_absolute_rank_shift", lambda name: metrics[name].maximum_absolute_rank_shift, False),
    ):
        h.compare(
            f"{tag}matched-120 {column}",
            matched_file,
            scope,
            {name: getter(name) for name in MATCHED120_PAIRS},
            {name: index.loc[name, column] for name in MATCHED120_PAIRS},
            exact=exact,
        )
    movements, movement_file = (
        load(f"{folder}/rank_movements_matched120.csv"),
        f"{folder}/rank_movements_matched120.csv",
    )
    four = common_cohort(*(runs[r] for r in dict.fromkeys(MATCHED120_RANK_COLUMNS.values())))
    ranks = {
        rule_id: rank_in_common_cohort(runs[rule_id], four).by_school()
        for rule_id in set(MATCHED120_RANK_COLUMNS.values())
    }
    for column, rule_id in MATCHED120_RANK_COLUMNS.items():
        h.compare(
            f"{tag}matched-120 {column}",
            movement_file,
            four.scope,
            ranks[rule_id],
            _column(movements, column),
            exact=True,
            rule=rule_id,
        )
    for column, rule_id in MATCHED120_SCORE_COLUMNS.items():
        h.compare(
            f"{tag}matched-120 {column}",
            movement_file,
            four.scope,
            _results(runs[rule_id], lambda r: r.score_point, set(four.school_names)),
            _column(movements, column),
            exact=False,
            rule=rule_id,
        )
    for column, (left, right) in (
        ("recommended_minus_benchmark_rank", ("additive_no_u", "benchmark")),
        ("bottleneck_minus_recommended_rank", ("bottleneck_no_u", "additive_no_u")),
        ("need_first_minus_recommended_rank", ("need_first_no_u", "additive_no_u")),
    ):
        h.compare(
            f"{tag}matched-120 {column}",
            movement_file,
            four.scope,
            {n: float(ranks[left][n] - ranks[right][n]) for n in four.school_names},
            _column(movements, column),
            exact=True,
        )
    return positions


def run_reproduction(reference_root: Path, datasets_root: Path, output_dir: Path) -> dict[str, Any]:
    ref, used = Path(reference_root), []

    def load(relative: str, root: Path = ref) -> pd.DataFrame:
        used.append(root / relative)
        return pd.read_csv(root / relative, float_precision="round_trip")

    raw = load(RAW_SCHOOLS_FILE, Path(datasets_root))
    prepared_table = load(PREPARED_FILE)
    tables = {
        Table.RAW_SCHOOLS: raw,
        Table.PREPARED_SCHOOLS: prepared_table,
        Table.ENVIRONMENT_FEATURES: load(EXP20_FEATURES),
    }
    prepared = prepare(parse_records(assemble_frame(tables)))
    runs = screen_all(prepared)
    cohorts = {r.school_name: r.cohort for r in runs["additive_u"].results}
    h = Harness(cohorts)
    eligible = {n for n, c in cohorts.items() if c is not Cohort.VERIFICATION_QUEUE}
    everyone = f"all records ({len(cohorts)})"
    eligible_scope = runs["additive_u"].manifest.rank_bounds_scope

    def complete(rule_id: str) -> str:
        return runs[rule_id].manifest.point_rank_scope.replace("this rule", rule_id)

    # Inputs: the datasets file and the EXP-15 prepared table carry identical raw columns.
    for field_ in INPUT_CONTRACT:
        column = field_.source_column
        if (
            field_.source_table is Table.RAW_SCHOOLS
            and column != "School Name"
            and column in prepared_table.columns
        ):
            h.compare(
                f"raw input {column}: datasets file equals EXP-15 copy",
                "datasets vs EXP-15 prepared table",
                everyone,
                _column(raw, column),
                _column(prepared_table, column),
                exact=True,
            )

    # Parts and components: tolerance against EXP-15, exact against the original EXP-10 output.
    baseline = load(EXP10_BASELINE)
    for column, getter in PART_GETTERS.items():
        mine = {p.record.school_name: getter(p) for p in prepared.records}
        h.compare(
            f"EXP-15 prepared column {column}",
            PREPARED_FILE,
            everyone,
            mine,
            _column(prepared_table, column),
            exact=False,
        )
        if column not in NOT_IN_EXP10_BASELINE:
            h.compare(
                f"EXP-10 baseline column {column}",
                EXP10_BASELINE,
                everyone,
                mine,
                _column(baseline, column),
                exact=True,
            )

    # Cohorts are rule-relative. The urgency-included additive rule has 120 complete, 4 interval and 88 queued schools.
    additive_cohort = {n: c.value for n, c in cohorts.items()}
    for label, relative in (
        ("comparison cohort_manifest", f"{COMPARISON}/cohort_manifest.csv"),
        ("EXP-21 all_school_results", f"{EXP21}/all_school_results.csv"),
    ):
        reference = {
            n: COHORT_BY_REFERENCE_LABEL[c].value for n, c in _column(load(relative), "cohort_class").items()
        }
        h.compare(f"additive_u cohort vs {label}", relative, everyone, additive_cohort, reference, exact=True)
    all21 = load(f"{EXP21}/all_school_results.csv")
    benchmark_ref = load(f"{EXP21}/benchmark_replay.csv")
    ref_file = f"{EXP21}/benchmark_replay.csv"
    h.compare(
        "benchmark cohort is complete exactly where EXP-21 ranks the benchmark",
        ref_file,
        everyone,
        {r.school_name: float(r.cohort is Cohort.COMPLETE) for r in runs["benchmark"].results},
        {n: float(not pd.isna(v)) for n, v in _column(benchmark_ref, "rank_compensatory").items()},
        exact=True,
    )

    # Normalization anchors, against both experiments: the urgency-omitted run fits the same anchors.
    anchors = {a.name: a for a in prepared.anchors}
    for experiment, folder in (("EXP-21", EXP21), ("EXP-22", EXP22)):
        _anchor_checks(h, load, anchors, experiment, folder, everyone)
    luminosity_file = ref / EXP15 / "results/diagnostics/luminosity_normalization.json"
    used.append(luminosity_file)
    bounds = json.loads(luminosity_file.read_text())["percentile_bounds_on_observed_source_population"]
    for label in ("p05", "p95"):
        h.compare(
            f"anchor activity_scale {label}",
            "EXP-15 luminosity_normalization.json",
            f"anchors fit on {everyone}",
            {"a": getattr(anchors["activity_scale"], label)},
            {"a": bounds[label]},
            exact=False,
        )

    # Circulated additive rule: EXP-21 scores, bounds, ranks and contributions.
    additive = runs["additive_u"]
    ref_file = f"{EXP21}/all_school_results.csv"
    for column, getter, exact, scope in (
        ("score_lower", lambda r: r.score_lower, False, everyone),
        ("score_upper", lambda r: r.score_upper, False, everyone),
        ("score_point", lambda r: r.score_point, False, everyone),
        ("rank_min_possible", lambda r: r.rank_best, True, eligible_scope),
        ("rank_max_possible", lambda r: r.rank_worst, True, eligible_scope),
        ("rank_point", lambda r: r.rank_point, True, complete("additive_u")),
    ):
        h.compare(
            f"additive_u {column}",
            ref_file,
            scope,
            _results(additive, getter),
            _column(all21, column),
            exact=exact,
            rule="additive_u",
        )
    contributions = load(f"{EXP21}/recommended_score_contributions.csv")
    ref_file = f"{EXP21}/recommended_score_contributions.csv"
    _contribution_checks(h, additive, contributions, ref_file, eligible, eligible_scope)

    # Benchmark over every eligible school: the benchmark reads no environmental component.
    _benchmark_checks(
        h, runs["benchmark"], benchmark_ref, f"{EXP21}/benchmark_replay.csv", eligible, complete("benchmark")
    )

    # School-need-first. EXP-21 bounds are an eligible-scope quantity and compare directly.
    positions = {
        "need_first_u": _need_first_checks(
            h,
            runs["need_first_u"],
            load(f"{EXP21}/need_first_results.csv"),
            "EXP-21",
            EXP21,
            eligible,
            eligible_scope,
        )
    }

    # Bottleneck against EXP-21.
    _bottleneck_checks(
        h,
        runs["bottleneck_u"],
        load(f"{EXP21}/bottleneck_results.csv"),
        f"{EXP21}/bottleneck_results.csv",
        eligible,
        eligible_scope,
        complete("bottleneck_u"),
        everyone,
    )

    # EXP-22, the run behind the revised paper: every rule it reports, against the engine.
    positions["need_first_no_u"] = _exp22_checks(h, load, runs, eligible, eligible_scope, everyone, complete)

    # Comparison package: component values, all seven rules on the common cohort, and the all-124 bounds.
    components_ref, ref_file = (
        load(f"{COMPARISON}/component_values.csv"),
        f"{COMPARISON}/component_values.csv",
    )
    for component in "NAURQEL":
        mine = {p.record.school_name: getattr(p.components, component) for p in prepared.records}
        h.compare(
            f"component {component}",
            ref_file,
            everyone,
            mine,
            _column(components_ref, component),
            exact=False,
        )

    common, ref_file = (
        load(f"{COMPARISON}/rule_scores_common120.csv"),
        f"{COMPARISON}/rule_scores_common120.csv",
    )
    common_cohort_of_all = common_cohort(*runs.values())
    for rule_id, run in runs.items():
        rows = common[common["rule_id"] == rule_id]
        keep = set(rows["School Name"])
        ranks = rank_in_common_cohort(run, common_cohort_of_all)
        h.compare(
            f"{rule_id} rank",
            ref_file,
            ranks.scope,
            {n: ranks.by_school().get(n) for n in keep},
            _column(rows, "rank"),
            exact=True,
        )
        columns = [
            ("score_point", lambda r: r.score_point),
            ("score_lower", lambda r: r.score_lower),
            ("score_upper", lambda r: r.score_upper),
        ]
        if rule_id.startswith("need_first"):
            columns += [
                ("secondary_score_lower", lambda r: r.score_lower),
                ("secondary_score_upper", lambda r: r.score_upper),
                ("school_need_primary", lambda r: r.components.N),
            ]
        for column, getter in columns:
            h.compare(
                f"{rule_id} {column}",
                ref_file,
                ranks.scope,
                _results(run, getter, keep),
                _column(rows, column),
                exact=False,
            )

    bounds124, ref_file = (
        load(f"{COMPARISON}/all124_additive_no_u_bounds.csv"),
        f"{COMPARISON}/all124_additive_no_u_bounds.csv",
    )
    keep = set(bounds124["School Name"])
    no_u = runs["additive_no_u"]
    for column, getter, exact, scope in (
        ("score_lower", lambda r: r.score_lower, False, eligible_scope),
        ("score_upper", lambda r: r.score_upper, False, eligible_scope),
        ("score_point", lambda r: r.score_point, False, eligible_scope),
        ("rank_min_possible", lambda r: r.rank_best, True, eligible_scope),
        ("rank_max_possible", lambda r: r.rank_worst, True, eligible_scope),
        ("rank_point_complete120", lambda r: r.rank_point, True, complete("additive_no_u")),
    ):
        h.compare(
            f"additive_no_u {column}",
            ref_file,
            scope,
            _results(no_u, getter, keep),
            _column(bounds124, column),
            exact=exact,
        )

    # Pairwise metrics and top-20 changes: every pair of rules, computed by the engine on the pair's common cohort.
    # The pair (or pair and school) stands in the "school" slot of a check, so mismatches name the pair.
    pairs_ref, ref_file = load(f"{COMPARISON}/pairwise_metrics.csv"), f"{COMPARISON}/pairwise_metrics.csv"
    pair_keys = [f"{a} vs {b}" for a, b in zip(pairs_ref["left_rule"], pairs_ref["right_rule"], strict=True)]
    metrics = {
        key: pairwise_metrics(runs[a], runs[b])
        for key, a, b in zip(pair_keys, pairs_ref["left_rule"], pairs_ref["right_rule"], strict=True)
    }
    pair_scope = f"each pair's common complete cohort (n={sorted({m.n for m in metrics.values()})})"
    pair_getters: dict[str, tuple[Callable[[Any], Value], bool]] = {
        "n": (lambda m: float(m.n), True),
        "spearman_rank": (lambda m: m.spearman_rank, False),
        "kendall_tau": (lambda m: m.kendall_tau, False),
        "pairwise_discordance": (lambda m: m.pairwise_discordance, False),
        "median_absolute_rank_shift": (lambda m: m.median_absolute_rank_shift, False),
        "maximum_absolute_rank_shift": (lambda m: m.maximum_absolute_rank_shift, False),
    }
    for index_, k in enumerate(TOP_K_VALUES):
        pair_getters[f"top{k}_overlap"] = (lambda m, i=index_: float(m.top_k[i].overlap), True)
        pair_getters[f"top{k}_jaccard"] = (lambda m, i=index_: m.top_k[i].jaccard, False)
        pair_getters[f"top{k}_left"] = (lambda m, i=index_: float(m.top_k[i].size_a), True)
        pair_getters[f"top{k}_right"] = (lambda m, i=index_: float(m.top_k[i].size_b), True)
    for column, (getter, exact) in pair_getters.items():
        h.compare(
            f"pairwise {column}",
            ref_file,
            pair_scope,
            {key: getter(m) for key, m in metrics.items()},
            dict(zip(pair_keys, pairs_ref[column], strict=True)),
            exact=exact,
        )

    changes_ref, ref_file = load(f"{COMPARISON}/top20_changes.csv"), f"{COMPARISON}/top20_changes.csv"
    by_name = {p.record.school_name: p for p in prepared.records}
    engine_rows: dict[str, dict[str, Value]] = {}
    for pair_key, m in metrics.items():
        a, b = pair_key.split(" vs ")
        score_a, score_b = (
            {r.school_name: r.score_point for r in runs[rule_id].results} for rule_id in (a, b)
        )
        for change in m.top20_changes:
            p, record = by_name[change.school_name], by_name[change.school_name].record
            engine_rows[f"{pair_key} | {change.status.value} | {change.school_name}"] = {
                "left_rank": float(change.rank_a),
                "right_rank": float(change.rank_b),
                "left_score": score_a[change.school_name],
                "right_score": score_b[change.school_name],
                "Province": record.province,
                "District": record.district,
                "Locality": record.locality,
                **{c: getattr(p.components, c) for c in "NAURQEL"},
                "missing_aqi": float(p.components.Q is None),
            }
    change_keys = [
        f"{a} vs {b} | {status} | {name}"
        for a, b, status, name in zip(
            changes_ref["left_rule"],
            changes_ref["right_rule"],
            changes_ref["status"],
            changes_ref["School Name"],
            strict=True,
        )
    ]
    change_scope = f"top-20 entrants and exits over {len(pair_keys)} pairs ({len(change_keys)} rows)"
    for column in (
        "left_rank",
        "right_rank",
        "left_score",
        "right_score",
        "Province",
        "District",
        "Locality",
        *"NAURQEL",
        "missing_aqi",
    ):
        reference_values = changes_ref[column]
        if column == "missing_aqi":
            reference_values = reference_values.astype(float)
        h.compare(
            f"top20 change {column}",
            ref_file,
            change_scope,
            {key: row[column] for key, row in engine_rows.items()},
            dict(zip(change_keys, reference_values, strict=True)),
            exact=column in ("left_rank", "right_rank", "Province", "District", "Locality", "missing_aqi"),
        )

    return _write_report(h, prepared.input_sha256, runs, used, Path(output_dir), positions)


def _position_summary(h: Harness, p: NeedFirstPositions) -> dict[str, Any]:
    gaps = [row["gap"] for row in h.scope_differences if row["rule_id"] == p.rule_id]
    return {
        "complete_schools": len(p.complete_names),
        "rank_determined_by_the_envelope": len(p.determined),
        f"engine_rank_point_differs_from_{p.experiment.lower().replace('-', '')}_position": len(p.differing),
        "gap_min": min(gaps, default=0),
        "gap_max": max(gaps, default=0),
        "reason": f"{p.experiment} counts interval schools in a complete school's position; the engine ranks only "
        "the complete cohort. The position always lies within the engine's best and worst rank.",
    }


def _write_report(
    h: Harness,
    input_sha256: str,
    runs: dict[str, ScreeningRun],
    used: list[Path],
    out: Path,
    positions: dict[str, NeedFirstPositions],
) -> dict[str, Any]:
    groups = {
        "all_records_212": set(h.cohorts),
        "eligible_124": {n for n, c in h.cohorts.items() if c is not Cohort.VERIFICATION_QUEUE},
        "complete_120": {n for n, c in h.cohorts.items() if c is Cohort.COMPLETE},
        "interval_4": {n for n, c in h.cohorts.items() if c is Cohort.INTERVAL},
    }
    covered: dict[str, set[str]] = {}
    for check in h.checks:
        if check.rule is not None:
            for experiment in re.findall(r"EXP-\d+", check.reference):
                covered.setdefault(experiment, set()).add(check.rule)
    report = {
        "passed": all(c.passed for c in h.checks),
        "tolerance_abs": TOLERANCE,
        "agreement_by_cohort": {
            g: {"schools": len(m), "schools_with_no_mismatch": len(m - h.failed_schools)}
            for g, m in groups.items()
        },
        **{
            f"{p.rule_id}_versus_{p.experiment.lower().replace('-', '')}_position": _position_summary(h, p)
            for p in positions.values()
        },
        # Every rule that an experiment reports and the engine reproduces from it, school by school.
        "rules_checked_against_experiment": {name: sorted(rules) for name, rules in sorted(covered.items())},
        "checks": [{**asdict(c), "passed": c.passed} for c in h.checks],
        "environment": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
        "reference_files_sha256": {str(p): _sha256(p) for p in sorted(set(used))},
        "input_sha256": input_sha256,
        "run_manifests": {rule_id: run.manifest.to_dict() for rule_id, run in runs.items()},
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "reproduction_report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    columns = ["check", "school_name", "engine", "reference", "abs_deviation"]
    pd.DataFrame(h.mismatches, columns=columns).to_csv(out / "mismatching_rows.csv", index=False)
    pd.DataFrame(h.scope_differences).to_csv(out / "need_first_scope_differences.csv", index=False)
    return report
