from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/v1/rasters", tags=["rasters"])


@router.get("/flood/overlay")
def flood_overlay(district: str, province: str | None = None, opacity: float = 0.55):
    raise HTTPException(
        status_code=501,
        detail={
            "message": "Runtime raster clipping is not implemented yet.",
            "layer": "flood",
            "district": district,
            "province": province,
            "opacity": opacity,
        },
    )


@router.get("/landcover/overlay")
def landcover_overlay(district: str, province: str | None = None, opacity: float = 1.0):
    raise HTTPException(
        status_code=501,
        detail={
            "message": "Runtime raster clipping is not implemented yet.",
            "layer": "landcover",
            "district": district,
            "province": province,
            "opacity": opacity,
        },
    )

