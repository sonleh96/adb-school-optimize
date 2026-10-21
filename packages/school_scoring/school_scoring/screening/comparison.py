"""Compare rules on one declared common cohort.

Point ranks from different rules use different cohorts, so they are not comparable as they stand.
This module ranks each rule's point scores within the schools that are complete under every compared rule.
The tie rule is the engine's: exact score, then school name ascending.
"""

from __future__ import annotations

from dataclasses import dataclass

from .engine import ScreeningRun
from .ranking import point_ranks
from .rules import Cohort, get_rule


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


def rank_in_common_cohort(run: ScreeningRun, cohort: CommonCohort) -> CommonRanks:
    """Rank one run's point scores within a common cohort, with an explicit scope label and count."""
    if run.manifest.rule_id not in cohort.rule_ids or run.manifest.input_sha256 != cohort.input_sha256:
        raise ValueError("the run was not one of the runs that defined this common cohort")
    rule = get_rule(run.manifest.rule_id)
    members = set(cohort.school_names)
    rows = [r for r in run.results if r.school_name in members]
    keys = [(-r.components.N, -r.score_point) if rule.primary_sort_key else (-r.score_point,) for r in rows]
    ranks = point_ranks(keys, [r.school_name for r in rows], [True] * len(rows))
    return CommonRanks(
        run.manifest.rule_id,
        cohort.scope,
        len(rows),
        tuple((r.school_name, rank) for r, rank in zip(rows, ranks, strict=True)),
    )
