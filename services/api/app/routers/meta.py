from __future__ import annotations

from fastapi import APIRouter

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
):
    with get_db() as connection:
        return fetch_vector_layer_features(
            connection,
            layer_key=layer_key,
            province=province,
            district=district,
            limit=limit,
        )
