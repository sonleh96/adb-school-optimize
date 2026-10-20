"""The rule registry: properties that catch a wrong weight, a leaked component or a lost identity."""

from __future__ import annotations

from itertools import combinations

import pytest
from school_scoring.screening import (
    RULES,
    Component,
    PolicyRole,
    Provenance,
    UnknownRuleError,
    get_rule,
)

N, A, U, R, Q, E, L = Component
PAIRS = [
    ("additive_u", "additive_no_u"),
    ("need_first_u", "need_first_no_u"),
    ("bottleneck_u", "bottleneck_no_u"),
]
URGENCY_OMITTED = [omitted for _, omitted in PAIRS]


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


@pytest.mark.parametrize("rule_id", list(RULES))
def test_declared_weights_sum_to_exactly_one(rule_id):  # FM8
    rule = get_rule(rule_id)
    assert sum(weight for _, weight in rule.weights) == 1
    assert all(weight > 0 for _, weight in rule.weights)


@pytest.mark.parametrize("rule_id", [r for r in RULES if get_rule(r).primary_sort_key is None])
def test_summand_weights_of_additive_style_rules_are_the_whole_declared_vector(rule_id):  # FM8
    rule = get_rule(rule_id)
    assert sum(rule.weight(c) for c in rule.score_components) == 1


@pytest.mark.parametrize(("included", "omitted"), PAIRS)
def test_omitting_urgency_keeps_the_ratios_between_the_remaining_weights(included, omitted):  # FM8
    before, after = get_rule(included), get_rule(omitted)
    kept = [c for c in Component if after.weight(c) > 0]
    assert U not in kept
    for left, right in combinations(kept, 2):
        assert before.weight(left) * after.weight(right) == before.weight(right) * after.weight(left)
    assert all(after.weight(c) == before.weight(c) / (1 - before.weight(U)) for c in kept)
    assert after.max_share == before.max_share


@pytest.mark.parametrize("rule_id", URGENCY_OMITTED)
def test_urgency_is_absent_from_every_urgency_omitted_rule(rule_id):  # FM8
    rule = get_rule(rule_id)
    assert rule.uses_urgency is False
    assert U not in rule.required_components
    assert U not in rule.score_components
    assert U not in rule.max_components
    assert rule.weight(U) == 0


@pytest.mark.parametrize("rule_id", [r for r in RULES if r not in URGENCY_OMITTED])
def test_every_other_rule_reads_urgency(rule_id):  # FM8
    rule = get_rule(rule_id)
    assert rule.uses_urgency is True
    assert U in rule.required_components


@pytest.mark.parametrize("rule_id", list(RULES))
def test_a_rule_reads_exactly_the_components_it_weights_or_maximizes_or_sorts_on(rule_id):  # FM8
    rule = get_rule(rule_id)
    expected = {c for c, w in rule.weights if w > 0} | set(rule.max_components)
    assert set(rule.required_components) == expected


def test_only_need_first_rules_have_a_primary_sort_key_and_it_is_not_a_summand():  # FM8
    for rule_id, rule in RULES.items():
        if rule_id.startswith("need_first"):
            assert rule.primary_sort_key is N
            assert N not in rule.score_components
            assert N in rule.required_components
        else:
            assert rule.primary_sort_key is None


@pytest.mark.parametrize("rule_id", ["additive_u", "need_first_u", "bottleneck_u", "benchmark"])
def test_urgency_included_and_benchmark_rules_come_from_the_circulated_paper(rule_id):  # FM8
    assert get_rule(rule_id).provenance is Provenance.CIRCULATED_PAPER


@pytest.mark.parametrize("rule_id", URGENCY_OMITTED)
def test_urgency_omitted_rules_are_the_proposed_follow_up_pending_author_review(rule_id):  # FM8
    rule = get_rule(rule_id)
    assert rule.provenance is Provenance.PROPOSED_FOLLOW_UP_PENDING_AUTHOR_REVIEW
    assert "urgency omitted" in rule.label


def test_policy_role_is_independent_of_provenance():  # FM8
    roles = {rule_id: rule.policy_role for rule_id, rule in RULES.items()}
    assert roles["additive_u"] is roles["additive_no_u"] is PolicyRole.PRIMARY
    assert roles["need_first_u"] is roles["need_first_no_u"] is PolicyRole.STRICT_ALTERNATIVE
    assert roles["bottleneck_u"] is roles["bottleneck_no_u"] is PolicyRole.POLICY_SENSITIVITY
    assert roles["benchmark"] is PolicyRole.CONVENTIONAL_REFERENCE


def test_unknown_rule_id_is_refused():  # FM8
    with pytest.raises(UnknownRuleError, match="additive_u"):
        get_rule("additive")
