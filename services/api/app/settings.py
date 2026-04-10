from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class Settings:
    database_url: str | None = os.getenv("DATABASE_URL")
    supabase_url: str | None = os.getenv("SUPABASE_URL")
    supabase_anon_key: str | None = os.getenv("SUPABASE_ANON_KEY")
    supabase_service_role_key: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    gcs_bucket: str | None = os.getenv("GCS_BUCKET")
    cors_origins_raw: str | None = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )

    def validate(self) -> None:
        if not self.database_url:
            raise ValueError("DATABASE_URL is required for FastAPI to access Supabase Postgres.")
        if not self.supabase_url:
            raise ValueError("SUPABASE_URL is required.")

    @property
    def cors_origins(self) -> list[str]:
        if not self.cors_origins_raw:
            return []
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]
