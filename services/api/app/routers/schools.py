from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import get_db
from ..repository import fetch_school_detail, fetch_schools

router = APIRouter(prefix="/api/v1/schools", tags=["schools"])


@router.get("")
def list_schools(
    province: str | None = None,
    district: str | None = None,
    scenario_id: str | None = None,
    limit: int = 500,
):
    with get_db() as connection:
        return fetch_schools(connection, province=province, district=district, scenario_id=scenario_id, limit=limit)


@router.get("/{school_id}")
def get_school(school_id: str, scenario_id: str | None = None):
    with get_db() as connection:
        row = fetch_school_detail(connection, school_id=school_id, scenario_id=scenario_id)
    if not row:
        raise HTTPException(status_code=404, detail="School not found")
    return row


@router.get("/{school_id}/explain")
def explain_school(school_id: str, scenario_id: str | None = None):
    with get_db() as connection:
        row = fetch_school_detail(connection, school_id=school_id, scenario_id=scenario_id)
    if not row:
        raise HTTPException(status_code=404, detail="School not found")
    return {
        "school_id": school_id,
        "school_name": row.get("school_name"),
        "scenario_id": row.get("scenario_id"),
        "component_breakdown": row.get("component_breakdown"),
        "rank_priority": row.get("rank_priority"),
        "rank_need": row.get("rank_need"),
    }
