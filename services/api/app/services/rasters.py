from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..errors import ApiError, ConfigurationError, DependencyError
from ..repository import fetch_district_geometry
from ..settings import get_settings


@dataclass
class RasterClipResult:
    content: bytes
    media_type: str
    filename: str
    bounds_4326: tuple[float, float, float, float]
    district: str
    province: str
    layer: str
    source_uri: str
    width: int
    height: int
    cache_status: str = "miss"


def _cache_key(payload: dict[str, object]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _cache_entry_dir(settings, cache_key: str) -> Path:
    return Path(settings.raster_cache_dir) / cache_key


def _serialize_result(result: RasterClipResult) -> dict[str, object]:
    return {
        "media_type": result.media_type,
        "filename": result.filename,
        "bounds_4326": list(result.bounds_4326),
        "district": result.district,
        "province": result.province,
        "layer": result.layer,
        "source_uri": result.source_uri,
        "width": result.width,
        "height": result.height,
    }


def _deserialize_result(metadata: dict[str, object], content: bytes) -> RasterClipResult:
    bounds = metadata["bounds_4326"]
    return RasterClipResult(
        content=content,
        media_type=str(metadata["media_type"]),
        filename=str(metadata["filename"]),
        bounds_4326=(float(bounds[0]), float(bounds[1]), float(bounds[2]), float(bounds[3])),
        district=str(metadata["district"]),
        province=str(metadata["province"]),
        layer=str(metadata["layer"]),
        source_uri=str(metadata["source_uri"]),
        width=int(metadata["width"]),
        height=int(metadata["height"]),
        cache_status="hit",
    )


def _load_cached_result(settings, cache_key: str) -> RasterClipResult | None:
    entry_dir = _cache_entry_dir(settings, cache_key)
    metadata_path = entry_dir / "metadata.json"
    content_path = entry_dir / "content.bin"
    if not metadata_path.exists() or not content_path.exists():
        return None

    ttl_seconds = max(0, settings.raster_cache_ttl_seconds)
    if ttl_seconds:
        age_seconds = time.time() - metadata_path.stat().st_mtime
        if age_seconds > ttl_seconds:
            return None

    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        content = content_path.read_bytes()
    except Exception:
        return None
    return _deserialize_result(metadata, content)


def _store_cached_result(settings, cache_key: str, result: RasterClipResult) -> None:
    entry_dir = _cache_entry_dir(settings, cache_key)
    entry_dir.mkdir(parents=True, exist_ok=True)
    (entry_dir / "metadata.json").write_text(json.dumps(_serialize_result(result), sort_keys=True), encoding="utf-8")
    (entry_dir / "content.bin").write_bytes(result.content)


def _import_raster_dependencies():
    try:
        import numpy as np
        from google.cloud import storage
        import rasterio
        from rasterio.io import MemoryFile
        from rasterio.mask import mask
        from rasterio.transform import array_bounds
        from rasterio.warp import transform_bounds, transform_geom
    except ImportError as exc:
        raise DependencyError(
            "Raster dependencies are not installed. Install the API package again to pull raster support.",
            details={"missing_dependency": exc.name if hasattr(exc, "name") else str(exc)},
        ) from exc

    return {
        "np": np,
        "storage": storage,
        "rasterio": rasterio,
        "MemoryFile": MemoryFile,
        "mask": mask,
        "array_bounds": array_bounds,
        "transform_bounds": transform_bounds,
        "transform_geom": transform_geom,
    }


def _download_gcs_bytes(bucket_name: str, source_path: str) -> bytes:
    deps = _import_raster_dependencies()
    settings = get_settings()

    client_kwargs: dict[str, Any] = {}
    if settings.gcs_project:
        client_kwargs["project"] = settings.gcs_project

    try:
        client = deps["storage"].Client(**client_kwargs)
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(source_path)
        if not blob.exists(client):
            raise ApiError(
                "Raster object not found in GCS.",
                status_code=404,
                code="raster_source_not_found",
                details={"bucket": bucket_name, "source_path": source_path},
            )
        return blob.download_as_bytes()
    except ApiError:
        raise
    except Exception as exc:
        raise DependencyError(
            "Unable to read the raster object from GCS.",
            details={"bucket": bucket_name, "source_path": source_path, "type": exc.__class__.__name__},
        ) from exc


def _normalize_to_uint8(np, array):
    if array.size == 0:
        return array.astype("uint8")
    finite = array[np.isfinite(array)]
    if finite.size == 0:
        return np.zeros(array.shape, dtype="uint8")
    min_value = float(finite.min())
    max_value = float(finite.max())
    if max_value <= min_value:
        return np.zeros(array.shape, dtype="uint8")
    scaled = ((array.astype("float32") - min_value) / (max_value - min_value) * 255.0).clip(0, 255)
    scaled[~np.isfinite(scaled)] = 0
    return scaled.astype("uint8")


def _is_wgs84_like(crs: object) -> bool:
    if crs is None:
        return False
    value = str(crs).strip().upper()
    return value in {"EPSG:4326", "OGC:CRS84", "CRS84", "WGS84"}


def _encode_png(clipped, profile, deps) -> bytes:
    np = deps["np"]
    MemoryFile = deps["MemoryFile"]

    count, height, width = clipped.shape
    if count >= 3:
        data = clipped[:3]
    else:
        grayscale = _normalize_to_uint8(np, clipped[0])
        data = np.stack([grayscale, grayscale, grayscale])

    png_profile = {
        "driver": "PNG",
        "height": height,
        "width": width,
        "count": data.shape[0],
        "dtype": "uint8",
    }

    with MemoryFile() as memfile:
        with memfile.open(**png_profile) as dst:
            dst.write(data.astype("uint8"))
        return memfile.read()


def _encode_geotiff(clipped, profile, deps) -> bytes:
    MemoryFile = deps["MemoryFile"]

    geotiff_profile = profile.copy()
    geotiff_profile.update(driver="GTiff")

    with MemoryFile() as memfile:
        with memfile.open(**geotiff_profile) as dst:
            dst.write(clipped)
        return memfile.read()


def _build_raster_clip_result(
    connection,
    *,
    layer: str,
    district: str,
    province: str | None = None,
    output_format: str = "png",
) -> RasterClipResult:
    settings = get_settings()
    layer_status = settings.raster_layer_status(layer)
    if not layer_status["configured"]:
        raise ConfigurationError(
            "Raster storage is not fully configured.",
            details={"layer": layer, "missing_settings": layer_status["missing_settings"]},
        )

    deps = _import_raster_dependencies()
    MemoryFile = deps["MemoryFile"]
    mask = deps["mask"]
    array_bounds = deps["array_bounds"]
    transform_bounds = deps["transform_bounds"]
    transform_geom = deps["transform_geom"]
    district_row = fetch_district_geometry(connection, district=district, province=province)
    province_name = district_row["province"]
    geometry = district_row["geometry"]

    bucket_name = str(layer_status["bucket"])
    source_path = str(layer_status["source_path"])
    raster_bytes = _download_gcs_bytes(bucket_name, source_path)

    try:
        with MemoryFile(raster_bytes) as memfile:
            with memfile.open() as src:
                declared_crs = {
                    "flood": settings.gcs_flood_raster_crs,
                    "landcover": settings.gcs_landcover_raster_crs,
                }.get(layer.lower())

                try:
                    detected_crs = src.crs
                except Exception:
                    detected_crs = None

                raster_crs = declared_crs.strip() if isinstance(declared_crs, str) and declared_crs.strip() else detected_crs

                if not raster_crs:
                    raise ApiError(
                        "Raster CRS is missing, so the district geometry cannot be transformed for clipping.",
                        status_code=422,
                        code="raster_missing_crs",
                        details={
                            "layer": layer,
                            "source_uri": f"gs://{bucket_name}/{source_path}",
                            "declared_crs": declared_crs,
                        },
                    )

                if _is_wgs84_like(raster_crs):
                    geometry_for_raster = geometry
                else:
                    geometry_for_raster = transform_geom("EPSG:4326", raster_crs, geometry)
                clipped, transform = mask(src, [geometry_for_raster], crop=True, filled=True)
                if clipped.size == 0 or clipped.shape[1] == 0 or clipped.shape[2] == 0:
                    raise ApiError(
                        "District clip produced an empty raster.",
                        status_code=422,
                        code="empty_raster_clip",
                        details={"district": district, "province": province_name, "layer": layer},
                    )

                profile = src.profile.copy()
                profile.update(
                    height=clipped.shape[1],
                    width=clipped.shape[2],
                    transform=transform,
                    count=clipped.shape[0],
                )

                bounds_native = array_bounds(clipped.shape[1], clipped.shape[2], transform)
                if _is_wgs84_like(raster_crs):
                    bounds_4326 = tuple(bounds_native)
                else:
                    bounds_4326 = tuple(transform_bounds(raster_crs, "EPSG:4326", *bounds_native))

                output_format = output_format.lower()
                if output_format == "png":
                    content = _encode_png(clipped, profile, deps)
                    media_type = "image/png"
                    filename = f"{layer}_{province_name}_{district}.png".replace(" ", "_")
                elif output_format in {"tif", "tiff", "geotiff"}:
                    content = _encode_geotiff(clipped, profile, deps)
                    media_type = "image/tiff"
                    filename = f"{layer}_{province_name}_{district}.tif".replace(" ", "_")
                else:
                    raise ApiError(
                        "Unsupported raster output format.",
                        status_code=400,
                        code="invalid_raster_format",
                        details={"format": output_format, "supported_formats": ["png", "geotiff"]},
                    )
    except ApiError:
        raise
    except Exception as exc:
        raise DependencyError(
            "Raster clipping failed.",
            details={
                "layer": layer,
                "district": district,
                "province": province_name,
                "source_uri": f"gs://{bucket_name}/{source_path}",
                "type": exc.__class__.__name__,
            },
        ) from exc

    return RasterClipResult(
        content=content,
        media_type=media_type,
        filename=filename,
        bounds_4326=bounds_4326,
        district=district,
        province=province_name,
        layer=layer,
        source_uri=f"gs://{bucket_name}/{source_path}",
        width=clipped.shape[2],
        height=clipped.shape[1],
        cache_status="miss",
    )


def clip_raster_for_district(
    connection,
    *,
    layer: str,
    district: str,
    province: str | None = None,
    output_format: str = "png",
) -> RasterClipResult:
    settings = get_settings()
    cache_key = _cache_key(
        {
            "layer": layer.lower(),
            "district": district,
            "province": province or "",
            "output_format": output_format.lower(),
            "bucket": settings.gcs_bucket or "",
            "source_path": settings.raster_source_path(layer) or "",
            "declared_crs": {
                "flood": settings.gcs_flood_raster_crs,
                "landcover": settings.gcs_landcover_raster_crs,
            }.get(layer.lower())
            or "",
        }
    )

    cached = _load_cached_result(settings, cache_key)
    if cached is not None:
        return cached

    result = _build_raster_clip_result(
        connection,
        layer=layer,
        district=district,
        province=province,
        output_format=output_format,
    )
    _store_cached_result(settings, cache_key, result)
    return result


def build_raster_headers(result: RasterClipResult, *, opacity: float) -> dict[str, str]:
    return {
        "Content-Disposition": f'inline; filename="{result.filename}"',
        "X-Raster-Layer": result.layer,
        "X-Raster-District": result.district,
        "X-Raster-Province": result.province,
        "X-Raster-Opacity": str(opacity),
        "X-Raster-Bounds-4326": ",".join(str(value) for value in result.bounds_4326),
        "X-Raster-Source": result.source_uri,
        "X-Raster-Width": str(result.width),
        "X-Raster-Height": str(result.height),
        "X-Raster-Cache": result.cache_status,
    }


def build_raster_metadata(result: RasterClipResult, *, opacity: float) -> dict[str, Any]:
    return {
        "layer": result.layer,
        "district": result.district,
        "province": result.province,
        "opacity": opacity,
        "bounds_4326": result.bounds_4326,
        "source_uri": result.source_uri,
        "width": result.width,
        "height": result.height,
        "cache_status": result.cache_status,
    }
