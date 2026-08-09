"""Routes for district metadata used by the frontend explorer."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import Response

from ..db import get_db
from ..http_cache import META_CACHE_CONTROL, set_cache_control
from ..queries import DEFAULT_CHOROPLETH_SIMPLIFY_TOLERANCE
from ..repository import fetch_district_choropleth

router = APIRouter(prefix="/api/v1/districts", tags=["districts"])


def _choropleth_response_headers(response: Response) -> None:
    set_cache_control(response, META_CACHE_CONTROL)


@router.get("")
def list_districts(
    response: Response,
    province: str | None = None,
    district: str | None = None,
    simplify_tolerance: float = Query(DEFAULT_CHOROPLETH_SIMPLIFY_TOLERANCE, ge=0.0, le=0.1),
    fields: Literal["scores", "indicator", "full"] = "scores",
):
    with get_db() as connection:
        features = fetch_district_choropleth(
            connection,
            province=province,
            district=district,
            simplify_tolerance=simplify_tolerance,
            fields=fields,
        )
    _choropleth_response_headers(response)
    return features


@router.get("/choropleth")
def district_choropleth(
    response: Response,
    indicator: str = "Average AQI",
    province: str | None = None,
    district: str | None = None,
    simplify_tolerance: float = Query(DEFAULT_CHOROPLETH_SIMPLIFY_TOLERANCE, ge=0.0, le=0.1),
    fields: Literal["scores", "indicator", "full"] = "indicator",
):
    with get_db() as connection:
        features = fetch_district_choropleth(
            connection,
            province=province,
            district=district,
            simplify_tolerance=simplify_tolerance,
            fields=fields,
            indicator=indicator,
        )
    _choropleth_response_headers(response)
    return {
        "default_indicator": "Average AQI",
        "selected_indicator": indicator,
        "fields": fields,
        "features": features,
    }
