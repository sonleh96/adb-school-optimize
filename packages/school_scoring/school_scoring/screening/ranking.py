"""Exact ranking and rank envelopes.

Order is decided by exact floating-point comparison.
Equal scores are separated by school name ascending, and that rule is the same for point ranks and bounds.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np


def point_ranks(
    sort_keys: Sequence[tuple[float, ...]], names: Sequence[str], include: Sequence[bool]
) -> list[int | None]:
    """Rank included records by ascending ``sort_keys`` (callers negate descending quantities), then name."""
    ranks: list[int | None] = [None] * len(names)
    ordered = sorted((i for i, keep in enumerate(include) if keep), key=lambda i: (*sort_keys[i], names[i]))
    for position, index in enumerate(ordered, start=1):
        ranks[index] = position
    return ranks


def _name_order(names: Sequence[str]) -> np.ndarray:
    order = sorted(range(len(names)), key=lambda i: names[i])
    position = np.empty(len(names), dtype=int)
    position[order] = np.arange(len(names))
    return position


def rank_envelope(
    lower: np.ndarray, upper: np.ndarray, names: Sequence[str], include: np.ndarray
) -> tuple[list[int | None], list[int | None]]:
    """Best and worst rank of each included record against the other included records.

    Best is one plus the competitors that are certainly ahead, worst is one plus those possibly ahead.
    """
    best: list[int | None] = [None] * len(names)
    worst: list[int | None] = [None] * len(names)
    name_position = _name_order(names)
    indices = np.flatnonzero(include)
    for i in indices:
        others = indices[indices != i]
        certainly_ahead = (upper[i] < lower[others]) | (
            (upper[i] == lower[others]) & (name_position[i] > name_position[others])
        )
        possibly_ahead = (upper[others] > lower[i]) | (
            (upper[others] == lower[i]) & (name_position[others] < name_position[i])
        )
        best[i] = 1 + int(certainly_ahead.sum())
        worst[i] = 1 + int(possibly_ahead.sum())
    return best, worst


def need_first_envelope(
    need: np.ndarray, lower: np.ndarray, upper: np.ndarray, names: Sequence[str], include: np.ndarray
) -> tuple[list[int | None], list[int | None]]:
    """Rank envelope for lexicographic ordering: equal N groups are bounded on the secondary score.

    Groups form on exactly equal N. A group sits below every group with strictly larger N.
    """
    best: list[int | None] = [None] * len(names)
    worst: list[int | None] = [None] * len(names)
    groups: dict[float, list[int]] = {}
    for index in np.flatnonzero(include):
        groups.setdefault(float(need[index]), []).append(int(index))
    offset = 0
    for need_value in sorted(groups, reverse=True):
        members = groups[need_value]
        mask = np.zeros(len(names), dtype=bool)
        mask[members] = True
        group_best, group_worst = rank_envelope(lower, upper, names, mask)
        for index in members:
            best[index] = offset + group_best[index]
            worst[index] = offset + group_worst[index]
        offset += len(members)
    return best, worst
