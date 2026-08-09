"""Routes for exporting ranked school data in download-friendly formats."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from ..db import get_db
from ..repository import export_full_xlsx, export_ranked_csv, export_ranked_xlsx, export_scores_xlsx

router = APIRouter(prefix="/api/v1/exports", tags=["exports"])

RESEARCH_EXPORT_HEADERS = {
    "X-RISE-PNG-Decision-Use": "research-prototype-only",
}


@router.get("/ranked.csv")
def export_csv(scenario_id: str | None = None):
    with get_db() as connection:
        content = export_ranked_csv(connection, scenario_id=scenario_id)
    return Response(
        content=content,
        media_type="text/csv",
        headers={
            **RESEARCH_EXPORT_HEADERS,
            "Content-Disposition": 'attachment; filename="research_prototype_ranked_schools.csv"',
        },
    )


@router.get("/ranked.xlsx")
def export_xlsx(scenario_id: str | None = None):
    with get_db() as connection:
        content = export_ranked_xlsx(connection, scenario_id=scenario_id)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            **RESEARCH_EXPORT_HEADERS,
            "Content-Disposition": 'attachment; filename="research_prototype_ranked_schools.xlsx"',
        },
    )


@router.get("/scores.xlsx")
def export_scores(scenario_id: str | None = None):
    with get_db() as connection:
        content = export_scores_xlsx(connection, scenario_id=scenario_id)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            **RESEARCH_EXPORT_HEADERS,
            "Content-Disposition": 'attachment; filename="research_prototype_scores.xlsx"',
        },
    )


@router.get("/full.xlsx")
def export_full(scenario_id: str | None = None):
    with get_db() as connection:
        content = export_full_xlsx(connection, scenario_id=scenario_id)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            **RESEARCH_EXPORT_HEADERS,
            "Content-Disposition": 'attachment; filename="research_prototype_full.xlsx"',
        },
    )
