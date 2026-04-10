from __future__ import annotations

from types import SimpleNamespace

from app.services import rasters
from app.services.rasters import RasterClipResult


def test_clip_raster_for_district_uses_cache(monkeypatch, tmp_path):
    call_count = {"value": 0}

    monkeypatch.setattr(
        rasters,
        "get_settings",
        lambda: SimpleNamespace(
            gcs_bucket="adb-school-optimize",
            raster_cache_dir=str(tmp_path),
            raster_cache_ttl_seconds=3600,
            raster_source_path=lambda layer: "rise-png/rasters/flood/PNG_flood_JRC.tif",
            gcs_flood_raster_crs="EPSG:4326",
            gcs_landcover_raster_crs="EPSG:4326",
        ),
    )

    def fake_build(connection, *, layer, district, province=None, output_format="png"):
        call_count["value"] += 1
        return RasterClipResult(
            content=b"cached-png",
            media_type="image/png",
            filename="flood_demo.png",
            bounds_4326=(147.0, -9.6, 147.3, -9.3),
            district=district,
            province=province or "National Capital District",
            layer=layer,
            source_uri="gs://adb-school-optimize/rise-png/rasters/flood/PNG_flood_JRC.tif",
            width=321,
            height=232,
        )

    monkeypatch.setattr(rasters, "_build_raster_clip_result", fake_build)

    first = rasters.clip_raster_for_district(
        object(),
        layer="flood",
        district="National Capital District",
        province="National Capital District",
        output_format="png",
    )
    second = rasters.clip_raster_for_district(
        object(),
        layer="flood",
        district="National Capital District",
        province="National Capital District",
        output_format="png",
    )

    assert first.content == b"cached-png"
    assert second.content == b"cached-png"
    assert call_count["value"] == 1
