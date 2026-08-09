"""Shared Cache-Control helpers for read-mostly API routes."""

from __future__ import annotations

from fastapi import Response

# Immutable-ish catalog data (layers, districts list, indicators).
META_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=600"

# School lists keyed by scenario; short private cache avoids hammering on remounts.
SCHOOLS_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=120"


def set_cache_control(response: Response, value: str) -> None:
    response.headers["Cache-Control"] = value
