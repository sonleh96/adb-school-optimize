from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from ..db import get_db
from ..repository import export_ranked_csv, export_ranked_xlsx

router = APIRouter(prefix="/api/v1/exports", tags=["exports"])


@router.get("/ranked.csv")
def export_csv(scenario_id: str | None = None):
    with get_db() as connection:
        content = export_ranked_csv(connection, scenario_id=scenario_id)
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="ranked_schools.csv"'},
    )


@router.get("/ranked.xlsx")
def export_xlsx(scenario_id: str | None = None):
    with get_db() as connection:
        content = export_ranked_xlsx(connection, scenario_id=scenario_id)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="ranked_schools.xlsx"'},
    )

