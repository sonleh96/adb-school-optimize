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

    def validate(self) -> None:
        if not self.database_url:
            raise ValueError("DATABASE_URL is required for FastAPI to access Supabase Postgres.")
        if not self.supabase_url:
            raise ValueError("SUPABASE_URL is required.")

