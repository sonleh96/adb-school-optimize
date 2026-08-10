"""Authentication, trusted identity, and bounded mutation controls."""

from __future__ import annotations

from collections import OrderedDict, deque
from dataclasses import dataclass
from functools import lru_cache
from threading import Lock
from time import monotonic
from typing import Annotated, Any

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from .errors import ApiError
from .settings import Settings, get_settings

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    email: str | None

    @property
    def actor(self) -> str:
        return self.email or self.user_id


@lru_cache(maxsize=4)
def _jwk_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url, cache_keys=True, lifespan=300, timeout=5)


def decode_access_token(token: str, settings: Settings) -> dict[str, Any]:
    issuer = settings.supabase_jwt_issuer
    if not issuer:
        raise ApiError("Authentication is not configured.", status_code=503, code="auth_configuration_error")

    decode_options = {
        "audience": settings.supabase_jwt_audience,
        "issuer": issuer,
        "options": {"require": ["exp", "iat", "sub", "aud"]},
    }
    try:
        if settings.supabase_jwt_secret:
            return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], **decode_options)

        if not settings.supabase_jwks_url:
            raise ApiError(
                "Authentication is not configured.", status_code=503, code="auth_configuration_error"
            )
        signing_key = _jwk_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token)
        return jwt.decode(token, signing_key.key, algorithms=["RS256", "ES256"], **decode_options)
    except ApiError:
        raise
    except jwt.PyJWTError as error:
        raise ApiError("Authentication is required.", status_code=401, code="unauthorized") from error
    except Exception as error:
        raise ApiError(
            "Authentication service is temporarily unavailable.",
            status_code=503,
            code="auth_dependency_error",
        ) from error


def require_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),  # noqa: B008
    settings: Settings = Depends(get_settings),  # noqa: B008
) -> AuthenticatedUser:
    if not settings.auth_required:
        return AuthenticatedUser(user_id="local-development", email=None)
    if not credentials or credentials.scheme.lower() != "bearer":
        raise ApiError("Authentication is required.", status_code=401, code="unauthorized")

    claims = decode_access_token(credentials.credentials, settings)
    user_id = claims.get("sub")
    email = claims.get("email")
    if not isinstance(user_id, str) or not user_id:
        raise ApiError("Authentication is required.", status_code=401, code="unauthorized")
    if email is not None and not isinstance(email, str):
        raise ApiError("Authentication is required.", status_code=401, code="unauthorized")
    if not settings.is_allowed_email(email):
        raise ApiError("This account is not authorized.", status_code=403, code="forbidden")
    return AuthenticatedUser(user_id=user_id, email=email)


CurrentUser = Annotated[AuthenticatedUser, Depends(require_authenticated_user)]


class WriteRateLimiter:
    def __init__(self, max_keys: int = 5000) -> None:
        self.max_keys = max_keys
        self._events: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = Lock()

    def check(self, key: str, limit: int, window_seconds: float = 60.0) -> None:
        now = monotonic()
        cutoff = now - window_seconds
        with self._lock:
            events = self._events.setdefault(key, deque())
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                raise ApiError(
                    "Write rate limit exceeded. Try again shortly.",
                    status_code=429,
                    code="rate_limit_exceeded",
                )
            events.append(now)
            self._events.move_to_end(key)
            while len(self._events) > self.max_keys:
                self._events.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


write_rate_limiter = WriteRateLimiter()


def require_write_rate_limit(
    user: AuthenticatedUser = Depends(require_authenticated_user),  # noqa: B008
    settings: Settings = Depends(get_settings),  # noqa: B008
) -> None:
    write_rate_limiter.check(user.user_id, settings.write_rate_limit_per_minute)


def require_write_operations(settings: Settings = Depends(get_settings)) -> None:  # noqa: B008
    """Reject mutations unless a server operator explicitly enables them."""
    if settings.write_operations_enabled:
        return

    raise ApiError(
        "Write operations are disabled while the service is in research-only mode.",
        status_code=503,
        code="write_operations_disabled",
    )
