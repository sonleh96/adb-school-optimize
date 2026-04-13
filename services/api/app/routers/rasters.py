from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from ..db import get_db
from ..services.rasters import build_raster_headers, build_raster_metadata, clip_raster_for_district
from ..settings import get_settings

router = APIRouter(prefix="/api/v1/rasters", tags=["rasters"])


def _raster_overlay_response(
    layer: str,
    district: str,
    province: str | None,
    opacity: float,
    format: str,
):
    with get_db() as connection:
        result = clip_raster_for_district(
            connection,
            layer=layer,
            district=district,
            province=province,
            output_format=format,
        )
    return Response(
        content=result.content,
        media_type=result.media_type,
        headers=build_raster_headers(result, opacity=opacity),
    )


def _raster_metadata_response(layer: str, district: str, province: str | None, opacity: float):
    with get_db() as connection:
        result = clip_raster_for_district(
            connection,
            layer=layer,
            district=district,
            province=province,
            output_format="png",
        )
    return build_raster_metadata(result, opacity=opacity)


@router.get("/status")
def raster_status():
    settings = get_settings()
    return {
        "gcs_bucket": settings.gcs_bucket,
        "gcs_project": settings.gcs_project,
        "credentials_mode": "service_account_file" if settings.google_application_credentials else "adc_or_workload_identity",
        "layers": [
            settings.raster_layer_status("flood"),
            settings.raster_layer_status("landcover"),
            settings.raster_layer_status("luminosity"),
            settings.raster_layer_status("elevation"),
        ],
    }


@router.get("/flood/metadata")
def flood_metadata(district: str, province: str | None = None, opacity: float = 0.55):
    return _raster_metadata_response("flood", district, province, opacity)


@router.get("/flood/overlay")
def flood_overlay(
    district: str,
    province: str | None = None,
    opacity: float = 0.55,
    format: str = "png",
):
    return _raster_overlay_response("flood", district, province, opacity, format)


@router.get("/landcover/metadata")
def landcover_metadata(district: str, province: str | None = None, opacity: float = 1.0):
    return _raster_metadata_response("landcover", district, province, opacity)


@router.get("/landcover/overlay")
def landcover_overlay(
    district: str,
    province: str | None = None,
    opacity: float = 1.0,
    format: str = "png",
):
    return _raster_overlay_response("landcover", district, province, opacity, format)


@router.get("/luminosity/metadata")
def luminosity_metadata(district: str, province: str | None = None, opacity: float = 0.7):
    return _raster_metadata_response("luminosity", district, province, opacity)


@router.get("/luminosity/overlay")
def luminosity_overlay(
    district: str,
    province: str | None = None,
    opacity: float = 0.7,
    format: str = "png",
):
    return _raster_overlay_response("luminosity", district, province, opacity, format)


@router.get("/elevation/metadata")
def elevation_metadata(district: str, province: str | None = None, opacity: float = 0.7):
    return _raster_metadata_response("elevation", district, province, opacity)


@router.get("/elevation/overlay")
def elevation_overlay(
    district: str,
    province: str | None = None,
    opacity: float = 0.7,
    format: str = "png",
):
    return _raster_overlay_response("elevation", district, province, opacity, format)
