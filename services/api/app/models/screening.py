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


class ScopeCode(str, Enum):
    """Which cohort a rank counts, as a code to branch on. The label beside it is for reading, not for parsing.

    The engine writes one label per kind of scope (``point_rank_scope`` and ``rank_bounds_scope`` in the engine's
    ``engine`` module, and the comparison's ``CommonCohort.scope``), and a rank field has exactly one kind: a point
    rank counts the schools that are complete under its rule, rank bounds count the eligible schools, and a compared
    rank counts the schools complete under both rules. The code is chosen by the field, never read from the label.
    """

    COMPLETE_UNDER_RULE = "complete_under_rule"
    ELIGIBLE = "eligible"
    COMMON_COMPLETE_COHORT = "common_complete_cohort"


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


PERSISTENCE_LIMITATION = (
    "These numbers come from an experiment that included urgency, so they describe the circulated rule only. "
    "They are not a result of the proposed rule that leaves urgency out."
)


PERSISTENCE_ADJACENT_RULE = (
    "A persistent school is threshold-adjacent when its lowest frequency is less than one standard error above "
    "the threshold. The standard error is sqrt(threshold * (1 - threshold) / draws), the Monte Carlo error of a "
    "frequency at the threshold, so such a school could fall below the line on another run of the draws."
)


class PersistenceSettingOut(Out):
    setting_id: str
    top_level_concentration: float
    school_need_concentration: float


class PersistenceOut(Out):
    """Where the persistence flag of an input version came from and how it was drawn.

    A school is a persistent candidate when its lower top-20 frequency is at or above ``threshold`` in every setting.
    ``rule_id`` names the one rule the flag describes; the API serves the flag nowhere else.
    """

    rule_id: str
    experiment_id: str
    source_path: str
    source_sha256: str
    draws: int
    threshold: float
    settings: list[PersistenceSettingOut]
    standard_error: float
    threshold_adjacent_rule: str = PERSISTENCE_ADJACENT_RULE
    limitation: str = PERSISTENCE_LIMITATION


class InputVersionOut(Out):
    input_version: str
    description: str | None
    input_sha256: str
    record_count: int
    created_at: dt.datetime
    is_default: bool
    rules_available: list[str]
    persistence: PersistenceOut | None = Field(
        description="Provenance of the persistent-candidate flag, or null when this version has none."
    )


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
    point_rank_scope_code: ScopeCode
    point_rank_count: int
    rank_bounds_scope: str
    rank_bounds_scope_code: ScopeCode
    rank_bounds_count: int
    cohort_counts: dict[str, int]
    input_sha256: str
    package_version: str

    @classmethod
    def from_stored(cls, manifest: dict[str, Any]) -> ManifestOut:
        return cls.model_validate(
            {
                **manifest,
                "cohort_counts": dict(manifest["cohort_counts"]),
                "point_rank_scope_code": ScopeCode.COMPLETE_UNDER_RULE,
                "rank_bounds_scope_code": ScopeCode.ELIGIBLE,
            }
        )


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
    scope_code: ScopeCode
    count: int


class RankBoundsOut(Out):
    best: int | None
    worst: int | None
    scope: str
    scope_code: ScopeCode
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


class PersistenceFlagsOut(Out):
    """What the experiment says about one school of the circulated rule. All null when it was not in the experiment."""

    persistent_candidate: bool | None = Field(
        description="True or false from the experiment's lower top-20 frequencies; null when the school was not in the "
        "experiment or this input version has no persistence numbers. It describes the circulated rule only."
    )
    lowest_top20_frequency: float | None = Field(
        description="The school's lowest lower top-20 frequency over the settings."
    )
    threshold_adjacent: bool | None = Field(
        description="True for a persistent school whose lowest frequency is less than one standard error above the "
        "threshold (see the provenance block); false for any other school of the experiment."
    )


class ListedRowWithPersistenceOut(ListedRowOut, PersistenceFlagsOut):
    """A row of the circulated rule's list. Rows of every other rule have none of the persistence keys at all."""


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
    rows: list[ListedRowWithPersistenceOut | ListedRowOut]


class CirculatedResultsResponse(ResultsResponse):
    """The list of the circulated rule, the only one that carries the persistence flag and its provenance."""

    persistence: PersistenceOut | None


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
    point_rank_scope_code: ScopeCode
    rank_bounds_scope: str
    rank_bounds_scope_code: ScopeCode
    result: SchoolResultOut


class SchoolRuleResultWithPersistenceOut(SchoolRuleResultOut, PersistenceFlagsOut):
    """The circulated rule's entry. The flag sits here and nowhere else, so it cannot be read as another rule's."""


class SchoolDetailOut(Out):
    school: SchoolIdentityOut
    inputs: dict[str, float | str | None]
    rules: list[SchoolRuleResultWithPersistenceOut | SchoolRuleResultOut]


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


class InputSchoolOut(Out):
    """A school's key and exact name, with its stored inputs in the shape of ``SchoolDetailOut.inputs``."""

    school_key: str
    source_school_name: str
    inputs: dict[str, float | str | None]


class InputsResponse(Out):
    """The stored inputs of every school of an input version, in the order they were supplied."""

    input_version: str
    input_sha256: str
    schools: list[InputSchoolOut]


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
    rank_scope_code: ScopeCode


class TopChangeOut(Out):
    status: str
    school: SchoolIdentityOut
    rank_a: int
    rank_b: int
    rank_scope: str
    rank_scope_code: ScopeCode
    score_a: float
    score_b: float


class IntervalBoundsOut(Out):
    cohort: Cohort
    score_lower: float | None
    score_upper: float | None
    rank_best: int | None
    rank_worst: int | None
    rank_bounds_scope: str
    rank_bounds_scope_code: ScopeCode


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
    common_cohort_scope_code: ScopeCode
    common_cohort_count: int
    metrics: PairwiseMetricsOut
    ranks: list[CommonRankOut]
    entrants: list[TopChangeOut]
    exits: list[TopChangeOut]
    excluded_schools: list[ExcludedSchoolOut]
    interval_schools: list[IntervalSchoolOut]
