"""Containment controls used before end-user authentication is available."""

from __future__ import annotations

from fastapi import Depends

from .errors import ApiError
from .settings import Settings, get_settings


def require_write_operations(settings: Settings = Depends(get_settings)) -> None:
    """Reject mutations unless a server operator explicitly enables them."""
    if settings.write_operations_enabled:
        return

    raise ApiError(
        "Write operations are disabled while the service is in research-only mode.",
        status_code=503,
        code="write_operations_disabled",
    )
