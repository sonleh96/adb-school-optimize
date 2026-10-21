"""Response models of the screening API.

Every rank travels with the scope label and count of its cohort, and every list with the manifest of its run.
Optional fields mean "unknown" or "not defined for this cohort", never zero.
"""

from __future__ import annotations

import datetime as dt
import uuid
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from school_scoring.screening import Cohort, Component, GateFailure, PolicyRole, Provenance


class Out(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Stored(Out):
    """A model filled from stored JSON. A newer engine may add fields to what it stores, and reading must not break on them."""

    model_config = ConfigDict(extra="ignore", frozen=True)


class Placement(str, Enum):
    """Where an interval school sits in the list: at its lower or its upper score bound."""

    LOWER = "lower"
    UPPER = "upper"


class RowPlacement(str, Enum):
    """How a listed row got its position. Only complete schools are placed exactly."""

    POINT = "point"
    LOWER = "lower"
    UPPER = "upper"
    QUEUE = "queue"


# ---------------------------------------------------------------------------------------------
# Rules and input versions.
# ---------------------------------------------------------------------------------------------


class WeightOut(Stored):
    component: Component
    fraction: str
    value: float


class RuleOut(Out):
    rule_id: str
    label: str
    provenance: Provenance
    policy_role: PolicyRole
    score_kind: str
    formula: str
    weights: list[WeightOut]
    primary_sort_key: Component | None
    maximum_components: list[Component]
    maximum_share: str
    uses_urgency: bool
    is_default: bool
    available_input_versions: list[str]


class InputVersionOut(Out):
    input_version: str
    description: str | None
    input_sha256: str
    record_count: int
    created_at: dt.datetime
    is_default: bool
    rules_available: list[str]


class RulesResponse(Out):
    default_rule_id: str
    rules: list[RuleOut]
    input_versions: list[InputVersionOut]


class InputVersionsResponse(Out):
    default_input_version: str | None
    input_versions: list[InputVersionOut]


# ---------------------------------------------------------------------------------------------
# A run and its manifest.
# ---------------------------------------------------------------------------------------------


class RunOut(Out):
    run_id: uuid.UUID
    input_version: str
    rule_id: str
    input_sha256: str
    anchors_sha256: str
    package_version: str
    created_at: dt.datetime


class AnchorOut(Stored):
    component: Component
    name: str
    source_field: str
    transformation: str
    n_records: int
    n_valid: int
    p05: float | None
    p95: float | None
    degenerate: bool


class ManifestOut(Stored):
    """The run manifest as the engine wrote it. Parsed once, when it leaves the database."""

    rule_id: str
    rule_label: str
    provenance: Provenance
    policy_role: PolicyRole
    rule_formula: str
    score_kind: str
    uses_urgency: bool
    weights: list[WeightOut]
    primary_sort_key: Component | None
    sort_columns: list[str]
    maximum_components: list[Component]
    maximum_share: str
    anchors: list[AnchorOut]
    degenerate_anchors: list[str]
    anchors_sha256: str
    tie_rule: str
    point_rank_scope: str
    point_rank_count: int
    rank_bounds_scope: str
    rank_bounds_count: int
    cohort_counts: dict[str, int]
    input_sha256: str
    package_version: str

    @classmethod
    def from_stored(cls, manifest: dict[str, Any]) -> ManifestOut:
        return cls.model_validate({**manifest, "cohort_counts": dict(manifest["cohort_counts"])})


# ---------------------------------------------------------------------------------------------
# One school under one rule.
# ---------------------------------------------------------------------------------------------


class SchoolIdentityOut(Out):
    school_key: str
    school_id: uuid.UUID | None
    source_school_name: str
    province: str | None
    district: str | None
    locality: str | None
    latitude: float | None
    longitude: float | None


class ComponentsOut(Stored):
    """The components of a rule that does not read urgency. There is no ``U`` key at all."""

    N: float | None
    A: float | None
    R: float | None
    Q: float | None
    E: float | None
    L: float | None


class ComponentsWithUrgencyOut(ComponentsOut):
    U: float | None


class NeedPartsOut(Stored):
    permanent_classroom_deficit: float | None
    teacher_housing_deficit: float | None
    facility_presence_deficit: float | None
    service_deficit: float | None
    locality_disadvantage: float | None


class AreaPartsOut(Stored):
    progression_g10_deficit: float | None
    progression_g12_deficit: float | None
    secondary_participation_deficit: float | None
    activity_scale_deficit: float | None
    conflict_exposure: float | None
    female_disadvantage: float | None


class ContributionOut(Stored):
    component: Component
    weight: float
    lower: float
    upper: float


class MaximumTermOut(Stored):
    share: float
    value: float
    attained_by: list[Component]
    contribution: float


class ScoresOut(Out):
    lower: float | None
    upper: float | None
    point: float | None
    sort_key_primary: float | None


class PointRankOut(Out):
    rank: int | None
    scope: str
    count: int


class RankBoundsOut(Out):
    best: int | None
    worst: int | None
    scope: str
    count: int


class SchoolResultOut(Out):
    """One school under one rule: what the engine produced, with every rank labeled by its scope."""

    cohort: Cohort
    gate_failures: list[GateFailure]
    components: ComponentsWithUrgencyOut | ComponentsOut
    need_parts: NeedPartsOut
    area_parts: AreaPartsOut
    contributions: list[ContributionOut]
    need_part_contributions: NeedPartsOut | None
    maximum_term: MaximumTermOut | None
    scores: ScoresOut
    point_rank: PointRankOut
    rank_bounds: RankBoundsOut


class ListedRowOut(SchoolResultOut):
    display_order: int = Field(
        description="Place of this row in the full unfiltered display. It is not a rank and it does not change with a filter."
    )
    placement: RowPlacement
    school: SchoolIdentityOut


# ---------------------------------------------------------------------------------------------
# Endpoint responses.
# ---------------------------------------------------------------------------------------------


class FiltersOut(Out):
    province: str | None
    district: str | None


class ResultsResponse(Out):
    run: RunOut
    manifest: ManifestOut
    placement: Placement
    filters: FiltersOut
    filters_note: str
    total_schools: int
    returned_schools: int
    rows: list[ListedRowOut]


class RuleSummaryOut(Out):
    rule_id: str
    label: str
    provenance: Provenance
    policy_role: PolicyRole
    score_kind: str
    uses_urgency: bool


class SchoolRuleResultOut(Out):
    rule: RuleSummaryOut
    run: RunOut
    point_rank_scope: str
    rank_bounds_scope: str
    result: SchoolResultOut


class SchoolDetailOut(Out):
    school: SchoolIdentityOut
    inputs: dict[str, float | str | None]
    rules: list[SchoolRuleResultOut]


class SchoolDetailResponse(SchoolDetailOut):
    """One school, found by its ``school_key``."""

    input_version: str
    input_sha256: str


class LinkedSchoolsResponse(Out):
    """Every school of the input version that is linked to one ``schools`` row. Normally one."""

    school_id: uuid.UUID
    input_version: str
    input_sha256: str
    schools: list[SchoolDetailOut]


class TopKOut(Out):
    k: int
    overlap: int
    jaccard: float | None
    size_a: int
    size_b: int


class PairwiseMetricsOut(Out):
    n: int
    spearman_rank: float | None
    kendall_tau: float | None
    pairwise_discordance: float | None
    median_absolute_rank_shift: float | None
    maximum_absolute_rank_shift: float | None
    top_k: list[TopKOut]


class CommonRankOut(Out):
    school: SchoolIdentityOut
    rank_a: int
    rank_b: int
    rank_scope: str


class TopChangeOut(Out):
    status: str
    school: SchoolIdentityOut
    rank_a: int
    rank_b: int
    rank_scope: str
    score_a: float
    score_b: float


class IntervalBoundsOut(Out):
    cohort: Cohort
    score_lower: float | None
    score_upper: float | None
    rank_best: int | None
    rank_worst: int | None
    rank_bounds_scope: str


class IntervalSchoolOut(Out):
    school: SchoolIdentityOut
    under_a: IntervalBoundsOut
    under_b: IntervalBoundsOut


class ExcludedSchoolOut(Out):
    """A school the comparison does not rank, because it is not complete under both rules."""

    school: SchoolIdentityOut
    cohort_a: Cohort
    cohort_b: Cohort
    reason: str


class CompareResponse(Out):
    input_version: str
    input_sha256: str
    run_a: RunOut
    run_b: RunOut
    common_cohort_scope: str
    common_cohort_count: int
    metrics: PairwiseMetricsOut
    ranks: list[CommonRankOut]
    entrants: list[TopChangeOut]
    exits: list[TopChangeOut]
    excluded_schools: list[ExcludedSchoolOut]
    interval_schools: list[IntervalSchoolOut]
