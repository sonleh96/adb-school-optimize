"""Routes for school list, detail, and map-oriented data access."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response

from ..db import get_db
from ..http_cache import SCHOOLS_CACHE_CONTROL, set_cache_control
from ..repository import SCHOOL_LIST_LIMIT_MAX, fetch_school_detail, fetch_schools

router = APIRouter(prefix="/api/v1/schools", tags=["schools"])


@router.get("")
def list_schools(
    response: Response,
    province: str | None = None,
    district: str | None = None,
    scenario_id: str | None = None,
    limit: int = Query(500, ge=1, le=SCHOOL_LIST_LIMIT_MAX),
):
    with get_db() as connection:
        rows = fetch_schools(
            connection, province=province, district=district, scenario_id=scenario_id, limit=limit
        )
    set_cache_control(response, SCHOOLS_CACHE_CONTROL)
    return rows


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
