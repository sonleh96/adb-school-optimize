"""Apply one registered rule to prepared records and return a frozen, self-describing run."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, replace
from fractions import Fraction
from typing import Any

import numpy as np
import pandas as pd

from .components import (
    Anchor,
    AreaParts,
    ComponentValues,
    NeedParts,
    PreparedRecord,
    PreparedRecords,
)
from .ranking import need_first_envelope, point_ranks, rank_envelope
from .rules import (
    ENVIRONMENTAL,
    RULES,
    TIE_RULE,
    Cohort,
    Component,
    GateFailure,
    Rule,
    RuleKind,
    get_rule,
)
from .version import PACKAGE_VERSION


def point_rank_scope(count: int) -> str:
    return f"complete under this rule ({count})"


def rank_bounds_scope(count: int) -> str:
    return f"eligible ({count})"


@dataclass(frozen=True)
class ComponentContribution:
    component: Component
    weight: float
    lower: float
    upper: float


@dataclass(frozen=True)
class MaximumTerm:
    """The ``share * max(...)`` term of a bottleneck score, with the components that attain the maximum."""

    share: float
    value: float
    attained_by: tuple[Component, ...]
    contribution: float


@dataclass(frozen=True)
class SchoolResult:
    """One record under one rule.

    ``rank_point`` ranks among the complete cohort of this rule.
    ``rank_best`` and ``rank_worst`` bound the rank among the eligible cohort, which also holds the interval schools.
    The two scopes differ, so a complete school's point rank can lie outside its own bounds.
    """

    school_name: str
    province: str | None
    district: str | None
    locality: str | None
    cohort: Cohort
    gate_failures: tuple[GateFailure, ...]
    components: ComponentValues
    need_parts: NeedParts
    area_parts: AreaParts
    contributions: tuple[ComponentContribution, ...]
    need_part_contributions: NeedParts | None
    maximum: MaximumTerm | None
    score_lower: float | None
    score_upper: float | None
    score_point: float | None
    rank_point: int | None
    rank_best: int | None
    rank_worst: int | None

    @property
    def maximum_component(self) -> float | None:
        return None if self.maximum is None else self.maximum.value

    @property
    def missing_environmental(self) -> tuple[Component, ...]:
        return tuple(c for c in ENVIRONMENTAL if self.components.get(c) is None)


@dataclass(frozen=True)
class ManifestWeight:
    component: Component
    fraction: str
    value: float


@dataclass(frozen=True)
class RunManifest:
    rule_id: str
    rule_label: str
    provenance: str
    policy_role: str
    rule_formula: str
    score_kind: str
    uses_urgency: bool
    weights: tuple[ManifestWeight, ...]
    primary_sort_key: str | None
    sort_columns: tuple[str, ...]
    maximum_components: tuple[Component, ...]
    maximum_share: str
    anchors: tuple[Anchor, ...]
    anchors_sha256: str
    tie_rule: str
    point_rank_scope: str
    point_rank_count: int
    rank_bounds_scope: str
    rank_bounds_count: int
    cohort_counts: tuple[tuple[str, int], ...]
    input_sha256: str
    package_version: str

    def to_dict(self) -> dict[str, Any]:
        return json.loads(json.dumps(asdict(self), sort_keys=True))


@dataclass(frozen=True)
class ScreeningRun:
    manifest: RunManifest
    results: tuple[SchoolResult, ...]

    def to_frame(self) -> pd.DataFrame:
        """Flat export in input order, enough to rebuild the shortlist.

        Every row carries the rule, the manifest identity, the score kind and both rank scopes.
        Sort ``manifest.sort_columns`` descending, then ``school_name`` ascending, to reproduce ``rank_point``.
        """
        m = self.manifest
        contribution_columns = [
            f"contribution_{w.component.value}_{side}" for w in m.weights for side in ("lower", "upper")
        ]
        columns = [
            "rule_id", "rule_label", "provenance", "policy_role", "score_kind",
            "input_sha256", "anchors_sha256", "package_version",
            "school_name", "province", "district", "locality",
            "cohort", "gate_failures", "missing_environmental",
            *(c.value for c in Component), "sort_key_primary",
            *contribution_columns,
            "maximum_component", "maximum_attained_by", "maximum_term",
            "score_lower", "score_upper", "score_point",
            "rank_point", "rank_point_scope", "rank_best", "rank_worst", "rank_bounds_scope",
        ]  # fmt: skip
        rows = []
        for r in self.results:
            row: dict[str, Any] = {
                "rule_id": m.rule_id,
                "rule_label": m.rule_label,
                "provenance": m.provenance,
                "policy_role": m.policy_role,
                "score_kind": m.score_kind,
                "input_sha256": m.input_sha256,
                "anchors_sha256": m.anchors_sha256,
                "package_version": m.package_version,
                "school_name": r.school_name,
                "province": r.province,
                "district": r.district,
                "locality": r.locality,
                "cohort": r.cohort.value,
                "gate_failures": ";".join(f.value for f in r.gate_failures),
                "missing_environmental": ";".join(c.value for c in r.missing_environmental),
                "sort_key_primary": r.components.get(Component(m.primary_sort_key))
                if m.primary_sort_key
                else None,
                "maximum_component": r.maximum_component,
                "maximum_attained_by": ";".join(c.value for c in r.maximum.attained_by)
                if r.maximum
                else None,
                "maximum_term": r.maximum.contribution if r.maximum else None,
                "score_lower": r.score_lower,
                "score_upper": r.score_upper,
                "score_point": r.score_point,
                "rank_point": r.rank_point,
                "rank_point_scope": m.point_rank_scope,
                "rank_best": r.rank_best,
                "rank_worst": r.rank_worst,
                "rank_bounds_scope": m.rank_bounds_scope,
            }
            row.update({c.value: r.components.get(c) for c in Component})
            for contribution in r.contributions:
                row[f"contribution_{contribution.component.value}_lower"] = contribution.lower
                row[f"contribution_{contribution.component.value}_upper"] = contribution.upper
            rows.append(row)
        frame = pd.DataFrame(rows, columns=columns)
        for column in ("rank_point", "rank_best", "rank_worst"):
            frame[column] = pd.array(frame[column].tolist(), dtype="Int64")
        return frame


def _array(prepared: PreparedRecords, component: Component) -> np.ndarray:
    return np.array([np.nan if (v := p.components.get(component)) is None else v for p in prepared.records])


def _additive_bounds(rule: Rule, values: dict[Component, np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Sum in the reference order. A missing environmental input contributes 0 below and its full weight above."""
    lower = upper = None
    for component in rule.score_components:
        weight = float(rule.weight(component))
        x = values[component]
        if component in ENVIRONMENTAL:
            low, high = weight * np.nan_to_num(x, nan=0.0), weight * np.where(np.isnan(x), 1.0, x)
        else:
            low = high = weight * x
        lower = low if lower is None else lower + low
        upper = high if upper is None else upper + high
    return lower, upper


def _score_bounds(
    rule: Rule, values: dict[Component, np.ndarray]
) -> tuple[np.ndarray, np.ndarray, np.ndarray | None]:
    lower, upper = _additive_bounds(rule, values)
    if rule.kind is not RuleKind.BOTTLENECK:
        return lower, upper, None
    maximum = np.maximum.reduce([values[c] for c in rule.max_components])
    additive_share, maximum_share = float(1 - rule.max_share), float(rule.max_share)
    return (
        additive_share * lower + maximum_share * maximum,
        additive_share * upper + maximum_share * maximum,
        maximum,
    )


def _optional(value: float) -> float | None:
    return None if np.isnan(value) else float(value)


def _score_share(rule: Rule) -> Fraction:
    """Share of the final score that the weighted sum carries. A bottleneck blends it with the maximum term."""
    return 1 - rule.max_share if rule.kind is RuleKind.BOTTLENECK else Fraction(1)


def _contributions(rule: Rule, components: ComponentValues) -> tuple[ComponentContribution, ...]:
    result = []
    for component in rule.score_components:
        weight, value = float(rule.weight(component) * _score_share(rule)), components.get(component)
        if component in ENVIRONMENTAL:
            result.append(
                ComponentContribution(
                    component, weight, weight * (value or 0.0), weight * (1.0 if value is None else value)
                )
            )
        else:
            result.append(ComponentContribution(component, weight, weight * value, weight * value))
    return tuple(result)


def _need_part_contributions(rule: Rule, parts: NeedParts) -> NeedParts | None:
    weight = float(rule.weight(Component.N) * _score_share(rule))
    if rule.kind is RuleKind.NEED_FIRST or weight == 0.0:
        return None
    return NeedParts(*(None if value is None else (value * weight) / 5 for value in asdict(parts).values()))


def _maximum_term(
    rule: Rule, values: dict[Component, np.ndarray], maximum: np.ndarray, i: int
) -> MaximumTerm:
    share, value = float(rule.max_share), float(maximum[i])
    attained = tuple(c for c in rule.max_components if values[c][i] == maximum[i])
    return MaximumTerm(share, value, attained, share * value)


def _manifest(rule: Rule, prepared: PreparedRecords, cohorts: list[Cohort]) -> RunManifest:
    anchors = tuple(a for a in prepared.anchors if a.component in rule.required_components)
    anchors_hash = hashlib.sha256(
        json.dumps([asdict(a) for a in anchors], sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return RunManifest(
        rule_id=rule.rule_id,
        rule_label=rule.label,
        provenance=rule.provenance.value,
        policy_role=rule.policy_role.value,
        rule_formula=rule.formula,
        score_kind=rule.score_kind.value,
        uses_urgency=rule.uses_urgency,
        weights=tuple(
            ManifestWeight(c, str(w), float(w)) for c, w in rule.weights if c in rule.score_components
        ),
        primary_sort_key=rule.primary_sort_key.value if rule.primary_sort_key else None,
        sort_columns=rule.sort_columns,
        maximum_components=rule.max_components,
        maximum_share=str(rule.max_share),
        anchors=anchors,
        anchors_sha256=anchors_hash,
        tie_rule=TIE_RULE,
        point_rank_scope=point_rank_scope(cohorts.count(Cohort.COMPLETE)),
        point_rank_count=cohorts.count(Cohort.COMPLETE),
        rank_bounds_scope=rank_bounds_scope(len(cohorts) - cohorts.count(Cohort.VERIFICATION_QUEUE)),
        rank_bounds_count=len(cohorts) - cohorts.count(Cohort.VERIFICATION_QUEUE),
        cohort_counts=(("records", len(cohorts)), *((c.value, cohorts.count(c)) for c in Cohort)),
        input_sha256=prepared.input_sha256,
        package_version=PACKAGE_VERSION,
    )


def _cohort(rule: Rule, p: PreparedRecord) -> tuple[Cohort, tuple[GateFailure, ...]]:
    """Cohort of one record under one rule. It depends only on what the rule reads.

    Queue: the gate fails, or the rule reads U and U is unknown.
    Interval: the rule reads an environmental component that is missing.
    Complete: otherwise.
    """
    failures = p.gate_failures
    if Component.U in rule.required_components and Component.U in p.missing_components:
        failures = (*failures, GateFailure.URGENCY_UNKNOWN)
    if failures:
        return Cohort.VERIFICATION_QUEUE, failures
    if any(c in p.missing_components for c in ENVIRONMENTAL if c in rule.required_components):
        return Cohort.INTERVAL, failures
    return Cohort.COMPLETE, failures


def screen(prepared: PreparedRecords, rule_id: str) -> ScreeningRun:
    """Score and rank every record under one rule. Only the components the rule requires are ever read."""
    rule = get_rule(rule_id)
    rows = prepared.records
    decided = [_cohort(rule, p) for p in rows]
    cohorts = [cohort for cohort, _ in decided]
    failures = [gate for _, gate in decided]

    eligible = np.array([c is not Cohort.VERIFICATION_QUEUE for c in cohorts], dtype=bool)
    complete = np.array([c is Cohort.COMPLETE for c in cohorts], dtype=bool)
    values = {c: _array(prepared, c) for c in rule.required_components}
    lower, upper, maximum = _score_bounds(rule, values)
    names = [p.record.school_name for p in rows]

    if rule.kind is RuleKind.NEED_FIRST:
        keys = [
            (-float(values[Component.N][i]), -float(lower[i])) if complete[i] else ()
            for i in range(len(rows))
        ]
        best, worst = need_first_envelope(values[Component.N], lower, upper, names, eligible)
    else:
        keys = [(-float(lower[i]),) if complete[i] else () for i in range(len(rows))]
        best, worst = rank_envelope(lower, upper, names, eligible)
    ranks = point_ranks(keys, names, complete.tolist())

    results = []
    for i, p in enumerate(rows):
        scored = bool(eligible[i])
        components = p.components if rule.uses_urgency else replace(p.components, U=None)
        results.append(
            SchoolResult(
                school_name=p.record.school_name,
                province=p.record.province,
                district=p.record.district,
                locality=p.record.locality,
                cohort=cohorts[i],
                gate_failures=failures[i],
                components=components,
                need_parts=p.need_parts,
                area_parts=p.area_parts,
                contributions=_contributions(rule, components) if scored else (),
                need_part_contributions=_need_part_contributions(rule, p.need_parts) if scored else None,
                maximum=_maximum_term(rule, values, maximum, i) if maximum is not None and scored else None,
                score_lower=float(lower[i]) if scored else None,
                score_upper=float(upper[i]) if scored else None,
                score_point=float(lower[i]) if complete[i] else None,
                rank_point=ranks[i],
                rank_best=best[i],
                rank_worst=worst[i],
            )
        )
    return ScreeningRun(_manifest(rule, prepared, cohorts), tuple(results))


def screen_all(prepared: PreparedRecords) -> dict[str, ScreeningRun]:
    return {rule_id: screen(prepared, rule_id) for rule_id in RULES}
