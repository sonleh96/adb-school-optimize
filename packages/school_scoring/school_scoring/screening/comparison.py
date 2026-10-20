"""Compare rules on one declared common cohort.

Point ranks from different rules use different cohorts, so they are not comparable as they stand.
This module ranks each rule's point scores within the schools that are complete under every compared rule.
The tie rule is the engine's: exact score, then school name ascending.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum

import numpy as np

from .engine import ScreeningRun
from .ranking import point_ranks
from .rules import Cohort, get_rule

TOP_K_VALUES = (10, 20, 30, 40)
TOP_CHANGE_K = 20


@dataclass(frozen=True)
class CommonCohort:
    rule_ids: tuple[str, ...]
    school_names: tuple[str, ...]
    input_sha256: str

    @property
    def scope(self) -> str:
        return f"common complete cohort of {', '.join(self.rule_ids)} ({len(self.school_names)})"


@dataclass(frozen=True)
class CommonRanks:
    rule_id: str
    scope: str
    count: int
    ranks: tuple[tuple[str, int], ...]

    def by_school(self) -> dict[str, int]:
        return dict(self.ranks)


def common_cohort(*runs: ScreeningRun) -> CommonCohort:
    """Schools that are complete under every run, in input order. The runs must share one input."""
    if not runs:
        raise ValueError("common_cohort needs at least one run")
    names = [r.school_name for r in runs[0].results]
    for run in runs[1:]:
        if (
            run.manifest.input_sha256 != runs[0].manifest.input_sha256
            or [r.school_name for r in run.results] != names
        ):
            raise ValueError("runs must come from the same input records")
    complete = [all(run.results[i].cohort is Cohort.COMPLETE for run in runs) for i in range(len(names))]
    return CommonCohort(
        tuple(run.manifest.rule_id for run in runs),
        tuple(name for name, keep in zip(names, complete, strict=True) if keep),
        runs[0].manifest.input_sha256,
    )


@dataclass(frozen=True)
class PointScore:
    """What a rule's point ranking reads from one school: its name, its primary sort key if any, its point score."""

    school_name: str
    sort_key_primary: float | None
    score_point: float


def rank_point_scores(rule_id: str, scope: str, scores: Sequence[PointScore]) -> CommonRanks:
    """Rank point scores under one rule, with the engine's tie rule.

    Under need-first ordering every score carries its N as the primary key, and under any other rule none does.
    Callers supply exactly the schools of the cohort being ranked.
    """
    uses_primary = get_rule(rule_id).primary_sort_key is not None
    if any((s.sort_key_primary is not None) != uses_primary for s in scores):
        raise ValueError(
            f"{rule_id}: primary sort keys must be given exactly when the rule orders by need first"
        )
    keys = [(-s.sort_key_primary, -s.score_point) if uses_primary else (-s.score_point,) for s in scores]
    ranks = point_ranks(keys, [s.school_name for s in scores], [True] * len(scores))
    return CommonRanks(
        rule_id,
        scope,
        len(scores),
        tuple((s.school_name, rank) for s, rank in zip(scores, ranks, strict=True)),
    )


def rank_in_common_cohort(run: ScreeningRun, cohort: CommonCohort) -> CommonRanks:
    """Rank one run's point scores within a common cohort, with an explicit scope label and count."""
    if run.manifest.rule_id not in cohort.rule_ids or run.manifest.input_sha256 != cohort.input_sha256:
        raise ValueError("the run was not one of the runs that defined this common cohort")
    members = set(cohort.school_names)
    scores = [
        PointScore(r.school_name, r.components.N if run.manifest.primary_sort_key else None, r.score_point)
        for r in run.results
        if r.school_name in members
    ]
    return rank_point_scores(run.manifest.rule_id, cohort.scope, scores)


class TopChange(str, Enum):
    EXIT = "exit"  # in the top K under rule a, outside it under rule b
    ENTRANT = "entrant"  # outside the top K under rule a, in it under rule b


@dataclass(frozen=True)
class TopKAgreement:
    k: int
    overlap: int
    jaccard: float | None
    size_a: int
    size_b: int


@dataclass(frozen=True)
class RankChange:
    status: TopChange
    school_name: str
    rank_a: int
    rank_b: int


@dataclass(frozen=True)
class PairwiseMetrics:
    """How two rules order the same schools. Ranks are common-cohort ranks, so ``n`` is the size of that cohort.

    Spearman correlation, Kendall tau and the discordance are undefined below two schools,
    and the rank shifts below one, and are then ``None``.
    ``pairwise_discordance`` is the fraction of school pairs whose order reverses, so ``kendall_tau = 1 - 2 * discordance``.
    ``top_k`` sizes are ``min(k, n)``.
    ``top20_changes`` lists exits by rank under ``a`` and then entrants by rank under ``b``.
    """

    rule_id_a: str
    rule_id_b: str
    scope: str
    n: int
    spearman_rank: float | None
    kendall_tau: float | None
    pairwise_discordance: float | None
    median_absolute_rank_shift: float | None
    maximum_absolute_rank_shift: float | None
    top_k: tuple[TopKAgreement, ...]
    top20_changes: tuple[RankChange, ...]


def _discordant_fraction(a: np.ndarray, b: np.ndarray) -> float:
    """Fraction of unordered pairs that the two rank vectors order oppositely. Ranks are unique, so there are no ties."""
    sequence = b[np.argsort(a, kind="stable")]
    inversions = sum(int(np.count_nonzero(sequence[i + 1 :] < sequence[i])) for i in range(len(sequence)))
    return inversions / (len(sequence) * (len(sequence) - 1) / 2)


def compare_ranks(a: CommonRanks, b: CommonRanks) -> PairwiseMetrics:
    """Agreement between two rules on one cohort. Both rank tables must cover the same schools and scope."""
    if a.scope != b.scope or {name for name, _ in a.ranks} != {name for name, _ in b.ranks}:
        raise ValueError("both rank tables must cover the same schools under the same scope")
    rank_b = b.by_school()
    names = [name for name, _ in a.ranks]
    left = np.array([rank for _, rank in a.ranks], dtype=float)
    right = np.array([rank_b[name] for name in names], dtype=float)
    n = len(names)
    shifts = np.abs(left - right)
    discordance = _discordant_fraction(left, right) if n >= 2 else None

    top_k = []
    for k in TOP_K_VALUES:
        in_a, in_b = (
            {nm for nm, r in zip(names, left, strict=True) if r <= k},
            {nm for nm, r in zip(names, right, strict=True) if r <= k},
        )
        union = len(in_a | in_b)
        top_k.append(
            TopKAgreement(
                k, len(in_a & in_b), len(in_a & in_b) / union if union else None, len(in_a), len(in_b)
            )
        )

    ranks_a = a.by_school()
    in_a, in_b = (
        {nm for nm in names if ranks_a[nm] <= TOP_CHANGE_K},
        {nm for nm in names if rank_b[nm] <= TOP_CHANGE_K},
    )
    changes = tuple(
        RankChange(TopChange.EXIT, nm, ranks_a[nm], rank_b[nm]) for nm in sorted(in_a - in_b, key=ranks_a.get)
    ) + tuple(
        RankChange(TopChange.ENTRANT, nm, ranks_a[nm], rank_b[nm])
        for nm in sorted(in_b - in_a, key=rank_b.get)
    )
    return PairwiseMetrics(
        rule_id_a=a.rule_id,
        rule_id_b=b.rule_id,
        scope=a.scope,
        n=n,
        spearman_rank=float(np.corrcoef(left, right)[0, 1]) if n >= 2 else None,
        kendall_tau=None if discordance is None else 1.0 - 2.0 * discordance,
        pairwise_discordance=discordance,
        median_absolute_rank_shift=float(np.median(shifts)) if n else None,
        maximum_absolute_rank_shift=float(np.max(shifts)) if n else None,
        top_k=tuple(top_k),
        top20_changes=changes,
    )


def pairwise_metrics(run_a: ScreeningRun, run_b: ScreeningRun) -> PairwiseMetrics:
    """Compare two runs of one input on the schools that are complete under both."""
    cohort = common_cohort(run_a, run_b)
    return compare_ranks(rank_in_common_cohort(run_a, cohort), rank_in_common_cohort(run_b, cohort))
