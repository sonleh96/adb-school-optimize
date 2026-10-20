"""Shared Cache-Control helpers for read-mostly API routes."""

from __future__ import annotations

import hashlib

from fastapi import Request, Response

# Immutable-ish catalog data (layers, districts list, indicators).
META_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=600"

# School lists keyed by scenario; short private cache avoids hammering on remounts.
SCHOOLS_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=120"


def set_cache_control(response: Response, value: str) -> None:
    response.headers["Cache-Control"] = value


# Screening results are stored runs. A request that names its input version is stable until the links to `schools` change,
# so it may be reused longer than a request for the default version, which moves when a newer version is loaded.
SCREENING_PINNED_CACHE_CONTROL = "private, max-age=300, stale-while-revalidate=600"
SCREENING_DEFAULT_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=120"

# Exports carry their generation time and are downloaded on purpose.
NO_STORE_CACHE_CONTROL = "private, no-store"


def weak_etag(body: bytes) -> str:
    return f'W/"{hashlib.sha256(body).hexdigest()[:32]}"'


def _matches(if_none_match: str | None, etag: str) -> bool:
    if not if_none_match:
        return False
    candidates = [c.strip() for c in if_none_match.split(",")]
    opaque = etag.removeprefix("W/")
    return "*" in candidates or any(c.removeprefix("W/") == opaque for c in candidates)


def conditional_json(
    request: Request, body: bytes, cache_control: str, headers: dict[str, str] | None = None
) -> Response:
    """A JSON body with a validator derived from its content, answering 304 when the client already holds it.

    The body names its input version and run, so the validator changes with either.
    """
    etag = weak_etag(body)
    validators = {"Cache-Control": cache_control, "ETag": etag, **(headers or {})}
    if _matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=validators)
    return Response(content=body, media_type="application/json", headers=validators)
