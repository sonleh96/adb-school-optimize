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
import sys
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from school_scoring.screening import (
    INPUT_CONTRACT,
    Cohort,
    PreparedRecord,
    SchoolResult,
    ScreeningRun,
    Table,
    assemble_frame,
    parse_records,
    prepare,
    screen_all,
)

TOLERANCE = 1e-12
EXP15 = "experiments/nightlights/EXP-15-v0.1.0-20261008"
EXP10_BASELINE = "experiments/nightlights/EXP-10-v0.1.0-20261006/scoring/baseline_reconstruction/deterministic_school_results.csv"
EXP20_FEATURES = "experiments/environment/EXP-20-v0.1.0-20261012/features/results/environment_features.csv"
EXP21 = "experiments/decision_rules/EXP-21-v0.1.0-20261012/results"
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
    kind: str
    n_compared: int = 0
    n_bit_identical: int = 0
    max_abs_deviation: float = 0.0
    n_mismatch: int = 0

    @property
    def passed(self) -> bool:
        return self.n_mismatch == 0


@dataclass
class Harness:
    cohorts: dict[str, Cohort]
    checks: list[Check] = field(default_factory=list)
    mismatches: list[dict[str, Any]] = field(default_factory=list)
    failed_schools: set[str] = field(default_factory=set)

    def compare(
        self,
        name: str,
        reference_label: str,
        engine: dict[str, Any],
        reference: dict[str, Any],
        *,
        exact: bool,
    ) -> None:
        """Compare name-keyed values. A missing value only agrees with a missing value."""
        check = Check(name, reference_label, "exact" if exact else f"abs<={TOLERANCE:g}")
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
    cohorts = {p.record.school_name: p.cohort for p in prepared.records}
    h = Harness(cohorts)
    eligible = {n for n, c in cohorts.items() if c is not Cohort.VERIFICATION_QUEUE}
    cohort_value = {n: c.value for n, c in cohorts.items()}

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
            mine,
            _column(prepared_table, column),
            exact=False,
        )
        if column not in NOT_IN_EXP10_BASELINE:
            h.compare(
                f"EXP-10 baseline column {column}",
                EXP10_BASELINE,
                mine,
                _column(baseline, column),
                exact=True,
            )

    # Cohorts.
    for label, relative in (
        ("comparison cohort_manifest", f"{COMPARISON}/cohort_manifest.csv"),
        ("EXP-21 all_school_results", f"{EXP21}/all_school_results.csv"),
    ):
        table = load(relative)
        reference = {n: COHORT_BY_REFERENCE_LABEL[c].value for n, c in _column(table, "cohort_class").items()}
        h.compare(f"cohort vs {label}", relative, cohort_value, reference, exact=True)
    all21 = load(f"{EXP21}/all_school_results.csv")

    # Normalization anchors.
    anchors = {a.name: a for a in prepared.anchors}
    primary = load(f"{EXP21}/normalization_anchors.csv").query("variant == 'primary'").set_index("component")
    for name in ("aqi", "emissions", "land"):
        for label, mine, reference in (
            ("p05", anchors[name].p05, primary.loc[name, "p05_transformed"]),
            ("p95", anchors[name].p95, primary.loc[name, "p95_transformed"]),
            ("valid_rows", float(anchors[name].n_valid), primary.loc[name, "valid_rows"]),
        ):
            h.compare(
                f"anchor {name} {label}",
                f"{EXP21}/normalization_anchors.csv",
                {"a": mine},
                {"a": reference},
                exact=label == "valid_rows",
            )
    luminosity_file = ref / EXP15 / "results/diagnostics/luminosity_normalization.json"
    used.append(luminosity_file)
    bounds = json.loads(luminosity_file.read_text())["percentile_bounds_on_observed_source_population"]
    for label in ("p05", "p95"):
        h.compare(
            f"anchor activity_scale {label}",
            "EXP-15 luminosity_normalization.json",
            {"a": getattr(anchors["activity_scale"], label)},
            {"a": bounds[label]},
            exact=False,
        )

    # Circulated additive rule: EXP-21 scores, bounds, ranks and contributions.
    additive = runs["additive_u"]
    ref_file = f"{EXP21}/all_school_results.csv"
    for column, getter, exact in (
        ("score_lower", lambda r: r.score_lower, False),
        ("score_upper", lambda r: r.score_upper, False),
        ("score_point", lambda r: r.score_point, False),
        ("rank_min_possible", lambda r: r.rank_best, True),
        ("rank_max_possible", lambda r: r.rank_worst, True),
        ("rank_point", lambda r: r.rank_point, True),
    ):
        h.compare(
            f"additive_u {column}", ref_file, _results(additive, getter), _column(all21, column), exact=exact
        )
    contributions = load(f"{EXP21}/recommended_score_contributions.csv")
    ref_file = f"{EXP21}/recommended_score_contributions.csv"
    for column, part in NEED_PART_CONTRIBUTIONS.items():
        mine = _results(additive, lambda r, p=part: getattr(r.need_part_contributions, p, None), eligible)
        h.compare(
            f"contribution {column}",
            ref_file,
            mine,
            _only(_column(contributions, column), eligible),
            exact=False,
        )
    for column, component, side in COMPONENT_CONTRIBUTIONS:
        mine = _results(additive, lambda r, c=component, s=side: _contribution(r, c, s), eligible)
        h.compare(
            f"contribution {column}",
            ref_file,
            mine,
            _only(_column(contributions, column), eligible),
            exact=False,
        )

    # School-need-first against EXP-21 bounds. EXP-21 numbers its point rank by position among all eligible schools.
    need_ref, ref_file = load(f"{EXP21}/need_first_results.csv"), f"{EXP21}/need_first_results.csv"
    need_run = runs["need_first_u"]
    for column, getter, exact in (
        ("secondary_score_lower", lambda r: r.score_lower, False),
        ("secondary_score_upper", lambda r: r.score_upper, False),
        ("need_first_rank_min_possible", lambda r: r.rank_best, True),
        ("need_first_rank_max_possible", lambda r: r.rank_worst, True),
    ):
        h.compare(
            f"need_first_u {column}",
            ref_file,
            _results(need_run, getter, eligible),
            _only(_column(need_ref, column), eligible),
            exact=exact,
        )
    in_sort_order = sorted(
        (r for r in need_run.results if r.school_name in eligible),
        key=lambda r: (-r.components.N, -r.score_lower, r.school_name),
    )
    position = {r.school_name: float(i) for i, r in enumerate(in_sort_order, start=1)}
    h.compare(
        "need_first_u need_first_rank_point (EXP-21 scope: position among eligible schools)",
        ref_file,
        {n: (position[n] if cohorts[n] is Cohort.COMPLETE else None) for n in cohorts},
        _column(need_ref, "need_first_rank_point"),
        exact=True,
    )

    # Bottleneck against EXP-21.
    bottleneck_ref, ref_file = load(f"{EXP21}/bottleneck_results.csv"), f"{EXP21}/bottleneck_results.csv"
    bottleneck_run = runs["bottleneck_u"]
    for column, getter, exact, scope in (
        ("bottleneck_score_lower", lambda r: r.score_lower, False, eligible),
        ("bottleneck_score_upper", lambda r: r.score_upper, False, eligible),
        ("bottleneck_score_point", lambda r: r.score_point, False, None),
        ("bottleneck_rank_min_possible", lambda r: r.rank_best, True, eligible),
        ("bottleneck_rank_max_possible", lambda r: r.rank_worst, True, eligible),
        ("bottleneck_rank_point", lambda r: r.rank_point, True, None),
    ):
        reference = _column(bottleneck_ref, column)
        h.compare(
            f"bottleneck_u {column}",
            ref_file,
            _results(bottleneck_run, getter, scope),
            reference if scope is None else _only(reference, scope),
            exact=exact,
        )

    # Comparison package: component values, all seven rules on the common 120, and the all-124 bounds.
    components_ref, ref_file = (
        load(f"{COMPARISON}/component_values.csv"),
        f"{COMPARISON}/component_values.csv",
    )
    for component in "NAURQEL":
        mine = {p.record.school_name: getattr(p.components, component) for p in prepared.records}
        h.compare(f"component {component}", ref_file, mine, _column(components_ref, component), exact=False)

    common, ref_file = (
        load(f"{COMPARISON}/rule_scores_common120.csv"),
        f"{COMPARISON}/rule_scores_common120.csv",
    )
    for rule_id, run in runs.items():
        rows = common[common["rule_id"] == rule_id]
        keep = set(rows["School Name"])
        for column, getter, exact in (
            ("rank", lambda r: r.rank_point, True),
            ("score_point", lambda r: r.score_point, False),
            ("score_lower", lambda r: r.score_lower, False),
            ("score_upper", lambda r: r.score_upper, False),
        ):
            h.compare(
                f"{rule_id} {column} (common 120)",
                ref_file,
                _results(run, getter, keep),
                _column(rows, column),
                exact=exact,
            )
        if rule_id.startswith("need_first"):
            h.compare(
                f"{rule_id} school_need_primary (common 120)",
                ref_file,
                _results(run, lambda r: r.components.N, keep),
                _column(rows, "school_need_primary"),
                exact=False,
            )
            for column, getter in (
                ("secondary_score_lower", lambda r: r.score_lower),
                ("secondary_score_upper", lambda r: r.score_upper),
            ):
                h.compare(
                    f"{rule_id} {column} (common 120)",
                    ref_file,
                    _results(run, getter, keep),
                    _column(rows, column),
                    exact=False,
                )

    bounds124, ref_file = (
        load(f"{COMPARISON}/all124_additive_no_u_bounds.csv"),
        f"{COMPARISON}/all124_additive_no_u_bounds.csv",
    )
    keep = set(bounds124["School Name"])
    for column, getter, exact in (
        ("score_lower", lambda r: r.score_lower, False),
        ("score_upper", lambda r: r.score_upper, False),
        ("score_point", lambda r: r.score_point, False),
        ("rank_min_possible", lambda r: r.rank_best, True),
        ("rank_max_possible", lambda r: r.rank_worst, True),
        ("rank_point_complete120", lambda r: r.rank_point, True),
    ):
        h.compare(
            f"additive_no_u {column} (all 124)",
            ref_file,
            _results(runs["additive_no_u"], getter, keep),
            _column(bounds124, column),
            exact=exact,
        )

    return _write_report(h, prepared.input_sha256, runs, used, Path(output_dir))


def _write_report(
    h: Harness, input_sha256: str, runs: dict[str, ScreeningRun], used: list[Path], out: Path
) -> dict[str, Any]:
    groups = {
        "all_records_212": set(h.cohorts),
        "eligible_124": {n for n, c in h.cohorts.items() if c is not Cohort.VERIFICATION_QUEUE},
        "complete_120": {n for n, c in h.cohorts.items() if c is Cohort.COMPLETE},
        "interval_4": {n for n, c in h.cohorts.items() if c is Cohort.INTERVAL},
    }
    report = {
        "passed": all(c.passed for c in h.checks),
        "tolerance_abs": TOLERANCE,
        "agreement_by_cohort": {
            g: {"schools": len(m), "schools_with_no_mismatch": len(m - h.failed_schools)}
            for g, m in groups.items()
        },
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
    return report
