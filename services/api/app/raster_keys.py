"""Helpers for deriving deterministic object keys for district raster assets."""

from __future__ import annotations

import re


def normalize_admin_name(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def slugify_admin_name(value: str) -> str:
    normalized = normalize_admin_name(value)
    return re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")


def slugify_layer_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


def build_district_raster_object_key(
    layer: str,
    province: str,
    district: str,
    *,
    extension: str = "tif",
) -> str:
    suffix = extension.lstrip(".").lower()
    return "/".join(
        [
            slugify_layer_name(layer),
            slugify_admin_name(province),
            f"{slugify_admin_name(district)}.{suffix}",
        ]
    )
