"""Prepared-record builders: literal component values fed straight to the scoring layer."""

from __future__ import annotations

from school_scoring.screening import (
    Anchor,
    AreaParts,
    Component,
    ComponentValues,
    NeedParts,
    PreparedRecord,
    PreparedRecords,
)
from screening_factories import record


def prepared(*rows: tuple, with_parts: bool = False) -> PreparedRecords:
    """Prepared records built from literal component values, for tests of the scoring layer.

    A row is ``(name, components)`` or ``(name, components, gate_failures)``.
    The cohort is not given: ``screen`` decides it from the rule.
    """
    need = NeedParts(0.25, 0.5, 0.5, 0.6, 0.7) if with_parts else NeedParts(None, None, None, None, None)
    area = AreaParts(None, None, None, None, None, None)
    built = tuple(
        PreparedRecord(
            record(name),
            failures[0] if failures else (),
            tuple(c for c in Component if values.get(c) is None),
            need,
            area,
            values,
        )
        for name, values, *failures in rows
    )
    anchors = (
        Anchor(Component.U, "urgency", "urgency_source_scalar", "t", 1, 1, 0.0, 1.0),
        Anchor(Component.R, "reach", "walking_catchment_population", "t", 1, 1, 0.0, 1.0),
    )
    return PreparedRecords(built, anchors, "input-hash")


def components(N=0.8, A=0.4, U=0.2, R=0.6, Q=0.3, E=0.7, L=0.5) -> ComponentValues:
    return ComponentValues(N=N, A=A, U=U, R=R, Q=Q, E=E, L=L)
