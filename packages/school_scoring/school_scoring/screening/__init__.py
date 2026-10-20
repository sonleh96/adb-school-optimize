"""Screening engine for the circulated method and the urgency-omitted scenario.

Pipeline: ``parse_records`` (boundary) -> ``prepare`` (components, anchors, cohorts) -> ``screen`` (one rule).
"""

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
    POINT_RANK_SCOPE,
    RANK_BOUNDS_SCOPE,
    ComponentContribution,
    RunManifest,
    SchoolResult,
    ScreeningRun,
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
    Rule,
    RuleKind,
    RuleRole,
    UnknownRuleError,
    get_rule,
)
from .version import PACKAGE_VERSION

__all__ = [
    "INPUT_CONTRACT",
    "PACKAGE_VERSION",
    "POINT_RANK_SCOPE",
    "RANK_BOUNDS_SCOPE",
    "RULES",
    "Anchor",
    "AreaParts",
    "Cohort",
    "Component",
    "ComponentContribution",
    "ComponentValues",
    "GateFailure",
    "InputContractError",
    "InputField",
    "NeedParts",
    "PreparedRecord",
    "PreparedRecords",
    "Rule",
    "RuleKind",
    "RuleRole",
    "RunManifest",
    "SchoolRecord",
    "SchoolResult",
    "ScreeningRun",
    "Table",
    "UnknownRuleError",
    "assemble_frame",
    "get_rule",
    "parse_records",
    "prepare",
    "records_sha256",
    "screen",
    "screen_all",
]
