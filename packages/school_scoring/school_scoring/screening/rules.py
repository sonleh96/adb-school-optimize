"""Domain vocabulary and the registry of screening rules.

Every rule the study defines is one row of ``RULES``.
Weights are exact fractions so that the urgency-omitted vector is derived from the circulated one
by exact division and converted to floating point once, at the point of use.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from fractions import Fraction
from types import MappingProxyType

from ..exceptions import SchoolScoringError


class Component(str, Enum):
    """The seven normalized components of the study, in the reference summation order."""

    N = "N"
    A = "A"
    U = "U"
    R = "R"
    Q = "Q"
    E = "E"
    L = "L"


COMPONENT_ORDER = tuple(Component)
ENVIRONMENTAL = (Component.Q, Component.E, Component.L)


class Cohort(str, Enum):
    COMPLETE = "complete"
    INTERVAL = "interval"
    VERIFICATION_QUEUE = "verification_queue"


class GateFailure(str, Enum):
    MISSING_STOCK_FIELD = "missing_stock_field"
    NEGATIVE_STOCK_VALUE = "negative_stock_value"
    NONPOSITIVE_DENOMINATOR = "nonpositive_denominator"
    UNRECOGNIZED_SERVICE_CODING = "unrecognized_service_coding"
    UNRECOGNIZED_LOCALITY = "unrecognized_locality"
    UNRESOLVED_AREA_CONTEXT = "unresolved_area_context"
    UNRESOLVED_REACH = "unresolved_reach"
    URGENCY_UNKNOWN = "urgency_unknown"


class RuleKind(str, Enum):
    ADDITIVE = "additive"
    NEED_FIRST = "need_first"
    BOTTLENECK = "bottleneck"


class Provenance(str, Enum):
    """Where a rule comes from. This says nothing about how the rule is used.

    The revised paper omits urgency from every primary calculation and keeps the circulated paper's urgency-included
    rules as labelled sensitivities.
    """

    CIRCULATED_PAPER = "circulated_paper"
    REVISED_PAPER = "revised_paper"


class PolicyRole(str, Enum):
    """How a rule is meant to be used in a decision.

    ``URGENCY_SENSITIVITY`` marks a rule that restores the supplied urgency scalar, which the revised paper treats as
    a sensitivity and not as a basis for the primary list.
    """

    PRIMARY = "primary"
    STRICT_ALTERNATIVE = "strict_alternative"
    POLICY_SENSITIVITY = "policy_sensitivity"
    URGENCY_SENSITIVITY = "urgency_sensitivity"
    CONVENTIONAL_REFERENCE = "conventional_reference"


class ScoreKind(str, Enum):
    """What the exported score column means under a rule."""

    ADDITIVE = "additive score"
    NEED_FIRST_SECONDARY = "need-first secondary score"
    BOTTLENECK = "bottleneck score"


class UnknownRuleError(SchoolScoringError, KeyError):
    """Raised when a rule id is not in the registry."""


@dataclass(frozen=True)
class Rule:
    rule_id: str
    label: str
    provenance: Provenance
    policy_role: PolicyRole
    kind: RuleKind
    formula: str
    weights: tuple[tuple[Component, Fraction], ...]
    max_components: tuple[Component, ...] = ()
    max_share: Fraction = Fraction(0)

    def weight(self, component: Component) -> Fraction:
        return dict(self.weights).get(component, Fraction(0))

    @property
    def primary_sort_key(self) -> Component | None:
        """Under need-first ordering N sorts first and is not a summand."""
        return Component.N if self.kind is RuleKind.NEED_FIRST else None

    @property
    def score_kind(self) -> ScoreKind:
        return {
            RuleKind.ADDITIVE: ScoreKind.ADDITIVE,
            RuleKind.NEED_FIRST: ScoreKind.NEED_FIRST_SECONDARY,
            RuleKind.BOTTLENECK: ScoreKind.BOTTLENECK,
        }[self.kind]

    @property
    def sort_columns(self) -> tuple[str, ...]:
        """Export columns that decide point rank, all descending, before school name ascending."""
        return ("sort_key_primary", "score_point") if self.primary_sort_key else ("score_point",)

    @property
    def score_components(self) -> tuple[Component, ...]:
        """Components that carry a weight in the score, in summation order.

        Under need-first ordering N is the primary sort key, not a summand.
        """
        weighted = {component for component, weight in self.weights if weight > 0}
        weighted.discard(self.primary_sort_key)
        return tuple(c for c in COMPONENT_ORDER if c in weighted)

    @property
    def required_components(self) -> tuple[Component, ...]:
        """Every component this rule reads. Nothing else may influence its output."""
        needed = set(self.score_components) | set(self.max_components)
        if self.primary_sort_key:
            needed.add(self.primary_sort_key)
        return tuple(c for c in COMPONENT_ORDER if c in needed)

    @property
    def uses_urgency(self) -> bool:
        return Component.U in self.required_components


_CIRCULATED = (
    (Component.N, Fraction("0.60")),
    (Component.A, Fraction("0.15")),
    (Component.U, Fraction("0.05")),
    (Component.R, Fraction("0.05")),
    (Component.Q, Fraction("0.05")),
    (Component.E, Fraction("0.05")),
    (Component.L, Fraction("0.05")),
)
_RETAINED_SHARE = 1 - Fraction("0.05")
_URGENCY_OMITTED = tuple((c, w / _RETAINED_SHARE) for c, w in _CIRCULATED if c is not Component.U)
_BENCHMARK = (
    (Component.N, Fraction("0.55")),
    (Component.A, Fraction("0.20")),
    (Component.U, Fraction("0.15")),
    (Component.R, Fraction("0.10")),
)
_BOTTLENECK_SHARE = Fraction("0.40")

_RULE_LIST = (
    Rule(
        "additive_u",
        "Additive, urgency included",
        Provenance.CIRCULATED_PAPER,
        PolicyRole.URGENCY_SENSITIVITY,
        RuleKind.ADDITIVE,
        "S = 0.60N + 0.15A + 0.05U + 0.05R + 0.05Q + 0.05E + 0.05L",
        _CIRCULATED,
    ),
    Rule(
        "additive_no_u",
        "Additive, urgency omitted",
        Provenance.REVISED_PAPER,
        PolicyRole.PRIMARY,
        RuleKind.ADDITIVE,
        "S0 = (0.60N + 0.15A + 0.05(R + Q + E + L)) / 0.95 = (12N + 3A + R + Q + E + L) / 19",
        _URGENCY_OMITTED,
    ),
    Rule(
        "need_first_u",
        "School-need-first, urgency included",
        Provenance.CIRCULATED_PAPER,
        PolicyRole.URGENCY_SENSITIVITY,
        RuleKind.NEED_FIRST,
        "Sort N descending, then 0.15A + 0.05U + 0.05R + 0.05Q + 0.05E + 0.05L descending, then school name ascending",
        _CIRCULATED,
    ),
    Rule(
        "need_first_no_u",
        "School-need-first, urgency omitted",
        Provenance.REVISED_PAPER,
        PolicyRole.STRICT_ALTERNATIVE,
        RuleKind.NEED_FIRST,
        "Sort N descending, then (0.15A + 0.05R + 0.05Q + 0.05E + 0.05L) / 0.95 descending, then school name ascending",
        _URGENCY_OMITTED,
    ),
    Rule(
        "bottleneck_u",
        "Bottleneck, urgency included",
        Provenance.CIRCULATED_PAPER,
        PolicyRole.URGENCY_SENSITIVITY,
        RuleKind.BOTTLENECK,
        "T = 0.60S + 0.40 max(N, A, U)",
        _CIRCULATED,
        max_components=(Component.N, Component.A, Component.U),
        max_share=_BOTTLENECK_SHARE,
    ),
    Rule(
        "bottleneck_no_u",
        "Bottleneck, urgency omitted",
        Provenance.REVISED_PAPER,
        PolicyRole.POLICY_SENSITIVITY,
        RuleKind.BOTTLENECK,
        "T0 = 0.60S0 + 0.40 max(N, A)",
        _URGENCY_OMITTED,
        max_components=(Component.N, Component.A),
        max_share=_BOTTLENECK_SHARE,
    ),
    Rule(
        "benchmark",
        "Conventional benchmark",
        Provenance.CIRCULATED_PAPER,
        PolicyRole.CONVENTIONAL_REFERENCE,
        RuleKind.ADDITIVE,
        "B = 0.55N + 0.20A + 0.15U + 0.10R",
        _BENCHMARK,
    ),
)

RULES = MappingProxyType({rule.rule_id: rule for rule in _RULE_LIST})

TIE_RULE = "exact numeric score descending, then school name ascending in Unicode code point order"


def get_rule(rule_id: str) -> Rule:
    try:
        return RULES[rule_id]
    except KeyError:
        raise UnknownRuleError(f"unknown rule id {rule_id!r}; known ids are {sorted(RULES)}") from None
