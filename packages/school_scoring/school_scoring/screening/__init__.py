"""Screening engine for the circulated method and the urgency-omitted scenario.

Pipeline: ``parse_records`` (boundary) -> ``prepare`` (components, anchors, cohorts) -> ``screen`` (one rule).
"""

from .comparison import CommonCohort, CommonRanks, common_cohort, rank_in_common_cohort
from .components import (
    Anchor,
    AreaParts,
    ComponentValues,
    NeedParts,
    PreparedRecord,
    PreparedRecords,
    prepare,
)
from .engine import (
    ComponentContribution,
    RunManifest,
    SchoolResult,
    ScreeningRun,
    point_rank_scope,
    rank_bounds_scope,
    screen,
    screen_all,
)
from .inputs import (
    INPUT_CONTRACT,
    InputContractError,
    InputField,
    SchoolRecord,
    Table,
    assemble_frame,
    parse_records,
    records_sha256,
)
from .rules import (
    RULES,
    Cohort,
    Component,
    GateFailure,
    PolicyRole,
    Provenance,
    Rule,
    RuleKind,
    ScoreKind,
    UnknownRuleError,
    get_rule,
)
from .version import PACKAGE_VERSION

__all__ = [
    "INPUT_CONTRACT",
    "PACKAGE_VERSION",
    "RULES",
    "Anchor",
    "AreaParts",
    "Cohort",
    "CommonCohort",
    "CommonRanks",
    "Component",
    "ComponentContribution",
    "ComponentValues",
    "GateFailure",
    "InputContractError",
    "InputField",
    "NeedParts",
    "PolicyRole",
    "PreparedRecord",
    "PreparedRecords",
    "Provenance",
    "Rule",
    "RuleKind",
    "RunManifest",
    "SchoolRecord",
    "SchoolResult",
    "ScoreKind",
    "ScreeningRun",
    "Table",
    "UnknownRuleError",
    "assemble_frame",
    "common_cohort",
    "get_rule",
    "parse_records",
    "point_rank_scope",
    "prepare",
    "rank_bounds_scope",
    "rank_in_common_cohort",
    "records_sha256",
    "screen",
    "screen_all",
]
