"""Apply one registered rule to prepared records and return a frozen, self-describing run."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, replace
from typing import Any

import numpy as np
import pandas as pd

from .components import Anchor, AreaParts, ComponentValues, NeedParts, PreparedRecords
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

POINT_RANK_SCOPE = "complete cohort"
RANK_BOUNDS_SCOPE = "eligible cohort"


@dataclass(frozen=True)
class ComponentContribution:
    component: Component
    weight: float
    lower: float
    upper: float


@dataclass(frozen=True)
class SchoolResult:
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
    maximum_component: float | None
    score_lower: float | None
    score_upper: float | None
    score_point: float | None
    rank_point: int | None
    rank_best: int | None
    rank_worst: int | None

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
    uses_urgency: bool
    weights: tuple[ManifestWeight, ...]
    maximum_components: tuple[Component, ...]
    maximum_share: str
    anchors: tuple[Anchor, ...]
    anchors_sha256: str
    tie_rule: str
    point_rank_scope: str
    rank_bounds_scope: str
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
        """Flat export in input order. Rule identity and rank scopes travel with every row."""
        rows = []
        for r in self.results:
            row: dict[str, Any] = {
                "rule_id": self.manifest.rule_id,
                "school_name": r.school_name,
                "province": r.province,
                "district": r.district,
                "locality": r.locality,
                "cohort": r.cohort.value,
                "gate_failures": ";".join(f.value for f in r.gate_failures),
                "missing_environmental": ";".join(c.value for c in r.missing_environmental),
            }
            row.update({c.value: r.components.get(c) for c in Component})
            for contribution in r.contributions:
                row[f"contribution_{contribution.component.value}_lower"] = contribution.lower
                row[f"contribution_{contribution.component.value}_upper"] = contribution.upper
            row.update(
                score_lower=r.score_lower,
                score_upper=r.score_upper,
                score_point=r.score_point,
                rank_point=r.rank_point,
                rank_point_scope=POINT_RANK_SCOPE,
                rank_best=r.rank_best,
                rank_worst=r.rank_worst,
                rank_bounds_scope=RANK_BOUNDS_SCOPE,
            )
            rows.append(row)
        return pd.DataFrame(rows)


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


def _contributions(rule: Rule, components: ComponentValues) -> tuple[ComponentContribution, ...]:
    result = []
    for component in rule.score_components:
        weight, value = float(rule.weight(component)), components.get(component)
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
    weight = float(rule.weight(Component.N))
    if rule.kind is RuleKind.NEED_FIRST or weight == 0.0:
        return None
    return NeedParts(*(None if value is None else (value * weight) / 5 for value in asdict(parts).values()))


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
        uses_urgency=rule.uses_urgency,
        weights=tuple(ManifestWeight(c, str(w), float(w)) for c, w in rule.weights),
        maximum_components=rule.max_components,
        maximum_share=str(rule.max_share),
        anchors=anchors,
        anchors_sha256=anchors_hash,
        tie_rule=TIE_RULE,
        point_rank_scope=POINT_RANK_SCOPE,
        rank_bounds_scope=RANK_BOUNDS_SCOPE,
        cohort_counts=(("records", len(cohorts)), *((c.value, cohorts.count(c)) for c in Cohort)),
        input_sha256=prepared.input_sha256,
        package_version=PACKAGE_VERSION,
    )


def screen(prepared: PreparedRecords, rule_id: str) -> ScreeningRun:
    """Score and rank every record under one rule. Only the components the rule requires are ever read."""
    rule = get_rule(rule_id)
    rows = prepared.records
    cohorts: list[Cohort] = []
    failures: list[tuple[GateFailure, ...]] = []
    for p in rows:
        if rule.uses_urgency and p.components.U is None and p.cohort is not Cohort.VERIFICATION_QUEUE:
            cohorts.append(Cohort.VERIFICATION_QUEUE)
            failures.append((*p.gate_failures, GateFailure.URGENCY_UNKNOWN))
        else:
            cohorts.append(p.cohort)
            failures.append(p.gate_failures)

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
                maximum_component=_optional(maximum[i]) if maximum is not None and scored else None,
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
