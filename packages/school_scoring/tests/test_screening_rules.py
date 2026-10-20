"""The rule registry: identities, weights and the urgency boundary."""

from __future__ import annotations

from fractions import Fraction

import pytest
from school_scoring.screening import RULES, Component, RuleKind, UnknownRuleError, get_rule

N, A, U, R, Q, E, L = Component


def test_registry_holds_exactly_the_seven_declared_rule_ids_in_order():  # FM8
    assert list(RULES) == [
        "additive_u",
        "additive_no_u",
        "need_first_u",
        "need_first_no_u",
        "bottleneck_u",
        "bottleneck_no_u",
        "benchmark",
    ]


def test_circulated_weights_are_exact_decimals_and_sum_to_one():  # FM8
    weights = dict(get_rule("additive_u").weights)
    assert weights == {
        N: Fraction(3, 5),
        A: Fraction(3, 20),
        U: Fraction(1, 20),
        R: Fraction(1, 20),
        Q: Fraction(1, 20),
        E: Fraction(1, 20),
        L: Fraction(1, 20),
    }
    assert sum(weights.values()) == 1


def test_urgency_omitted_weights_are_the_retained_weights_divided_by_ninety_five_hundredths():  # FM8
    weights = dict(get_rule("additive_no_u").weights)
    assert weights == {
        N: Fraction(12, 19),
        A: Fraction(3, 19),
        R: Fraction(1, 19),
        Q: Fraction(1, 19),
        E: Fraction(1, 19),
        L: Fraction(1, 19),
    }
    assert sum(weights.values()) == 1


def test_benchmark_weights():  # FM8
    assert dict(get_rule("benchmark").weights) == {
        N: Fraction(11, 20),
        A: Fraction(1, 5),
        U: Fraction(3, 20),
        R: Fraction(1, 10),
    }


@pytest.mark.parametrize("rule_id", ["additive_no_u", "need_first_no_u", "bottleneck_no_u"])
def test_urgency_omitted_rules_never_require_urgency(rule_id):  # FM8
    rule = get_rule(rule_id)
    assert rule.uses_urgency is False
    assert U not in rule.required_components


@pytest.mark.parametrize("rule_id", ["additive_u", "need_first_u", "bottleneck_u", "benchmark"])
def test_urgency_included_rules_require_urgency(rule_id):  # FM8
    assert get_rule(rule_id).uses_urgency is True


def test_bottleneck_maximum_drops_urgency_with_the_additive_weight():  # FM8
    assert get_rule("bottleneck_u").max_components == (N, A, U)
    assert get_rule("bottleneck_no_u").max_components == (N, A)


def test_need_first_sorts_on_n_and_scores_the_remaining_components():
    rule = get_rule("need_first_no_u")
    assert rule.kind is RuleKind.NEED_FIRST
    assert rule.score_components == (A, R, Q, E, L)
    assert rule.required_components == (N, A, R, Q, E, L)


def test_unknown_rule_id_is_refused():  # FM8
    with pytest.raises(UnknownRuleError, match="additive_u"):
        get_rule("additive")
