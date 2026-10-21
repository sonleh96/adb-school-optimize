"""Environment-backed configuration for the API service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]


def _strip_optional_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        os.environ.setdefault(key, _strip_optional_quotes(value))


def load_env_files() -> None:
    for path in (
        SERVICE_ROOT / ".env.local",
        SERVICE_ROOT / ".env",
        REPO_ROOT / ".env.local",
        REPO_ROOT / ".env",
    ):
        _load_env_file(path)


def _env_flag(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    supabase_url: str | None
    supabase_anon_key: str | None
    supabase_service_role_key: str | None
    cors_origins_raw: str | None
    auth_required: bool
    supabase_jwt_secret: str | None
    supabase_jwt_audience: str
    auth_allowed_email_domains_raw: str | None
    auth_allowed_emails_raw: str | None

    @classmethod
    def from_env(cls) -> Settings:
        load_env_files()
        return cls(
            database_url=os.getenv("DATABASE_URL"),
            supabase_url=os.getenv("SUPABASE_URL"),
            supabase_anon_key=os.getenv("SUPABASE_ANON_KEY"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            cors_origins_raw=os.getenv(
                "CORS_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000",
            ),
            auth_required=_env_flag("AUTH_REQUIRED"),
            supabase_jwt_secret=os.getenv("SUPABASE_JWT_SECRET"),
            supabase_jwt_audience=os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated"),
            auth_allowed_email_domains_raw=os.getenv("AUTH_ALLOWED_EMAIL_DOMAINS"),
            auth_allowed_emails_raw=os.getenv("AUTH_ALLOWED_EMAILS"),
        )

    def validate_database(self) -> None:
        if not self.database_url:
            raise ValueError("DATABASE_URL is required for FastAPI to access Supabase Postgres.")
        if not self.supabase_url:
            raise ValueError("SUPABASE_URL is required.")

    @property
    def cors_origins(self) -> list[str]:
        if not self.cors_origins_raw:
            return []
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

    @property
    def supabase_jwt_issuer(self) -> str | None:
        return f"{self.supabase_url.rstrip('/')}/auth/v1" if self.supabase_url else None

    @property
    def supabase_jwks_url(self) -> str | None:
        return f"{self.supabase_jwt_issuer}/.well-known/jwks.json" if self.supabase_jwt_issuer else None

    def is_allowed_email(self, email: str | None) -> bool:
        normalized = (email or "").strip().lower()
        if not normalized:
            return False
        allowed_emails = {
            item.strip().lower() for item in (self.auth_allowed_emails_raw or "").split(",") if item.strip()
        }
        allowed_domains = {
            item.strip().lower()
            for item in (self.auth_allowed_email_domains_raw or "").split(",")
            if item.strip()
        }
        if not allowed_emails and not allowed_domains:
            return True
        domain = normalized.rsplit("@", 1)[-1] if "@" in normalized else ""
        return normalized in allowed_emails or domain in allowed_domains


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
