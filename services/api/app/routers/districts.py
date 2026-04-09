from __future__ import annotations

from fastapi import APIRouter

from ..db import get_db
from ..repository import fetch_district_choropleth

router = APIRouter(prefix="/api/v1/districts", tags=["districts"])


@router.get("")
def list_districts(province: str | None = None, district: str | None = None):
    with get_db() as connection:
        return fetch_district_choropleth(connection, province=province, district=district)


@router.get("/choropleth")
def district_choropleth(
    indicator: str = "Average AQI",
    province: str | None = None,
    district: str | None = None,
):
    with get_db() as connection:
        return {
            "default_indicator": "Average AQI",
            "selected_indicator": indicator,
            "features": fetch_district_choropleth(connection, province=province, district=district),
        }

