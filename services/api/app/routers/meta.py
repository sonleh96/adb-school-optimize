"""Routes for metadata lookups such as available districts and layers."""

from __future__ import annotations

from fastapi import APIRouter

from ..errors import ApiError

from ..db import get_db
from ..repository import fetch_districts, fetch_indicators, fetch_layers, fetch_provinces, fetch_vector_layer_features

router = APIRouter(prefix="/api/v1/meta", tags=["meta"])


@router.get("/layers")
def get_layers():
    with get_db() as connection:
        return fetch_layers(connection)


@router.get("/indicators")
def get_indicators():
    return {"default": "Average AQI", "items": fetch_indicators()}


@router.get("/provinces")
def get_provinces():
    with get_db() as connection:
        return fetch_provinces(connection)


@router.get("/districts")
def get_districts(province: str | None = None):
    with get_db() as connection:
        return fetch_districts(connection, province=province)


@router.get("/layers/{layer_key}/features")
def get_layer_features(
    layer_key: str,
    province: str | None = None,
    district: str | None = None,
    limit: int = 5000,
    min_lon: float | None = None,
    min_lat: float | None = None,
    max_lon: float | None = None,
    max_lat: float | None = None,
):
    bbox_values = [min_lon, min_lat, max_lon, max_lat]
    if any(value is not None for value in bbox_values) and not all(value is not None for value in bbox_values):
        raise ApiError(
            "Incomplete bbox parameters. Provide min_lon, min_lat, max_lon, and max_lat together.",
            status_code=400,
            code="invalid_bbox",
        )
    bbox = None
    if all(value is not None for value in bbox_values):
        assert min_lon is not None and min_lat is not None and max_lon is not None and max_lat is not None
        if min_lon >= max_lon or min_lat >= max_lat:
            raise ApiError(
                "Invalid bbox range. Expected min_lon < max_lon and min_lat < max_lat.",
                status_code=400,
                code="invalid_bbox",
                details={"min_lon": min_lon, "min_lat": min_lat, "max_lon": max_lon, "max_lat": max_lat},
            )
        bbox = (min_lon, min_lat, max_lon, max_lat)

    with get_db() as connection:
        return fetch_vector_layer_features(
            connection,
            layer_key=layer_key,
            province=province,
            district=district,
            limit=limit,
            bbox_4326=bbox,
        )
