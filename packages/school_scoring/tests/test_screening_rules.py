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


# The revised paper's reading of every rule: where it comes from and how it is meant to be used.
PROVENANCE_AND_ROLE = {
    "additive_no_u": ("revised_paper", "primary"),
    "need_first_no_u": ("revised_paper", "strict_alternative"),
    "bottleneck_no_u": ("revised_paper", "policy_sensitivity"),
    "additive_u": ("circulated_paper", "urgency_sensitivity"),
    "need_first_u": ("circulated_paper", "urgency_sensitivity"),
    "bottleneck_u": ("circulated_paper", "urgency_sensitivity"),
    "benchmark": ("circulated_paper", "conventional_reference"),
}


def test_every_rule_has_the_provenance_and_policy_role_of_the_revised_paper():  # FM8
    assert {
        rule_id: (rule.provenance.value, rule.policy_role.value) for rule_id, rule in RULES.items()
    } == PROVENANCE_AND_ROLE


def test_exactly_one_rule_is_primary_and_it_omits_urgency():  # FM8
    primary = [rule for rule in RULES.values() if rule.policy_role is PolicyRole.PRIMARY]
    assert [rule.rule_id for rule in primary] == ["additive_no_u"]
    assert not primary[0].uses_urgency


@pytest.mark.parametrize("rule_id", URGENCY_OMITTED)
def test_urgency_omitted_rules_come_from_the_revised_paper(rule_id):  # FM8
    rule = get_rule(rule_id)
    assert rule.provenance is Provenance.REVISED_PAPER
    assert "urgency omitted" in rule.label


def test_the_retired_provenance_is_gone():  # FM8
    assert {p.value for p in Provenance} == {"circulated_paper", "revised_paper"}


def test_unknown_rule_id_is_refused():  # FM8
    with pytest.raises(UnknownRuleError, match="additive_u"):
        get_rule("additive")
