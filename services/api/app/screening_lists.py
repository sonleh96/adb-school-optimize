"""Pure list logic of the screening API: the paper's order, filters, the top-K selection and two-rule comparison.

Nothing here reads a database or renumbers a rank.
A rank is whatever the stored run says; these functions only order, hide and pair rows.

The order of a list:

1. Complete schools by point rank.
2. Interval schools, each at the position its lower score (or, as a sensitivity, its upper score) would take
   among the complete schools, with the engine's tie rule: score descending, then name ascending.
   Under a need-first rule the primary key N comes first.
3. Queued schools by province, district and name.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from school_scoring.screening import (
    Cohort,
    CommonCohort,
    PairwiseMetrics,
    PointScore,
    Rule,
    compare_ranks,
    rank_point_scores,
)

from .models.screening import Placement, RowPlacement
from .screening_queries import SchoolRow

FILTERS_NOTE = (
    "Filters only hide rows. Ranks, bounds and normalization anchors are those of the full run, "
    "so a rank may skip numbers in a filtered list."
)


@dataclass(frozen=True)
class Filters:
    province: str | None = None
    district: str | None = None

    def admits(self, row: SchoolRow) -> bool:
        return (self.province is None or row.identity.province == self.province) and (
            self.district is None or row.identity.district == self.district
        )

    def describe(self) -> str:
        parts = [
            f"{name}={value}"
            for name, value in (("province", self.province), ("district", self.district))
            if value
        ]
        return "; ".join(parts) or "none"


@dataclass(frozen=True)
class ListedRow:
    list_position: int
    placement: RowPlacement
    row: SchoolRow


def _score_key(rule: Rule, row: SchoolRow, score: float) -> tuple:
    primary = row.result.sort_key_primary
    return (-primary, -score, row.name) if rule.primary_sort_key else (-score, row.name)


def _queue_key(row: SchoolRow) -> tuple:
    """Province, district, name; a missing province or district sorts before any named one."""
    i = row.identity
    return (i.province is not None, i.province or "", i.district is not None, i.district or "", row.name)


def ordered_list(rule: Rule, rows: Sequence[SchoolRow], placement: Placement) -> list[ListedRow]:
    """Every school of a run in the paper's order, before any filter."""
    bound = placement.value
    ranked: list[tuple[tuple, RowPlacement, SchoolRow]] = []
    queue: list[SchoolRow] = []
    for row in rows:
        r = row.result
        if r.cohort is Cohort.COMPLETE:
            ranked.append((_score_key(rule, row, r.score_point), RowPlacement.POINT, row))
        elif r.cohort is Cohort.INTERVAL:
            score = r.score_lower if placement is Placement.LOWER else r.score_upper
            ranked.append((_score_key(rule, row, score), RowPlacement(bound), row))
        else:
            queue.append(row)
    ranked.sort(key=lambda item: item[0])
    queue.sort(key=_queue_key)
    placed = [(p, row) for _, p, row in ranked] + [(RowPlacement.QUEUE, row) for row in queue]
    return [ListedRow(position, p, row) for position, (p, row) in enumerate(placed, start=1)]


@dataclass(frozen=True)
class TopSelection:
    """The shortlist of a rule: complete schools within the first ``k`` point ranks, and the range schools that could reach it.

    ``ranges_reaching_k`` is always computed, so a record can say how many range schools a list leaves out.
    """

    k: int
    include_ranges: bool
    point_rows: tuple[SchoolRow, ...]
    ranges_reaching_k: tuple[SchoolRow, ...]

    @property
    def range_rows(self) -> tuple[SchoolRow, ...]:
        return self.ranges_reaching_k if self.include_ranges else ()


def select_top(rows: Sequence[SchoolRow], k: int, include_ranges: bool, filters: Filters) -> TopSelection:
    """The top ``k`` of the rule's list, then hide what the filters hide.

    ``k`` cuts the global point rank, so a filter never changes what the list contains, only what is shown.
    A range school is an interval school whose best possible rank among the eligible schools is at most ``k``.
    """
    visible = [row for row in rows if filters.admits(row)]
    point = sorted(
        (r for r in visible if r.result.cohort is Cohort.COMPLETE and r.result.rank_point <= k),
        key=lambda r: r.result.rank_point,
    )
    reaching = sorted(
        (r for r in visible if r.result.cohort is Cohort.INTERVAL and r.result.rank_best <= k),
        key=lambda r: (r.result.rank_best, r.result.rank_worst, r.name),
    )
    return TopSelection(k, include_ranges, tuple(point), tuple(reaching))


def queue_rows(rows: Sequence[SchoolRow], filters: Filters) -> list[SchoolRow]:
    """Queued schools that pass the filters, ordered by province, district and name."""
    return sorted(
        (r for r in rows if r.result.cohort is Cohort.VERIFICATION_QUEUE and filters.admits(r)),
        key=_queue_key,
    )


# ---------------------------------------------------------------------------------------------
# Comparison of two rules on their common cohort.
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Comparison:
    cohort_scope: str
    cohort_count: int
    metrics: PairwiseMetrics
    ranks: tuple[tuple[str, int, int], ...]  # school name, rank under a, rank under b
    interval_schools: tuple[str, ...]  # names of schools that are interval under either rule


def compare_stored(
    rule_a: Rule, rows_a: Sequence[SchoolRow], rule_b: Rule, rows_b: Sequence[SchoolRow], input_sha256: str
) -> Comparison:
    """Compare two stored runs of one input version on the schools complete under both."""
    by_name_b = {r.name: r for r in rows_b}
    complete = [
        r
        for r in rows_a
        if r.result.cohort is Cohort.COMPLETE and by_name_b[r.name].result.cohort is Cohort.COMPLETE
    ]
    rule_ids = (rule_a.rule_id,) if rule_a.rule_id == rule_b.rule_id else (rule_a.rule_id, rule_b.rule_id)
    cohort = CommonCohort(rule_ids, tuple(r.name for r in complete), input_sha256)

    def ranked(rule: Rule, rows: Sequence[SchoolRow]):
        scores = [PointScore(r.name, r.result.sort_key_primary, r.result.score_point) for r in rows]
        return rank_point_scores(rule.rule_id, cohort.scope, scores)

    ranks_a = ranked(rule_a, complete)
    ranks_b = ranked(rule_b, [by_name_b[r.name] for r in complete])
    by_b = ranks_b.by_school()
    interval = tuple(
        r.name
        for r in rows_a
        if r.result.cohort is Cohort.INTERVAL or by_name_b[r.name].result.cohort is Cohort.INTERVAL
    )
    return Comparison(
        cohort.scope,
        len(complete),
        compare_ranks(ranks_a, ranks_b),
        tuple(sorted(((name, rank, by_b[name]) for name, rank in ranks_a.ranks), key=lambda t: (t[1], t[0]))),
        interval,
    )
