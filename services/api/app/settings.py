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


def _normalize_path(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().strip("/")
    return normalized or None


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    supabase_url: str | None
    supabase_anon_key: str | None
    supabase_service_role_key: str | None
    gcs_bucket: str | None
    gcs_project: str | None
    google_application_credentials: str | None
    gcs_raster_prefix: str | None
    gcs_flood_raster_path: str | None
    gcs_landcover_raster_path: str | None
    gcs_flood_raster_crs: str | None
    gcs_landcover_raster_crs: str | None
    cors_origins_raw: str | None

    @classmethod
    def from_env(cls) -> "Settings":
        load_env_files()
        return cls(
            database_url=os.getenv("DATABASE_URL"),
            supabase_url=os.getenv("SUPABASE_URL"),
            supabase_anon_key=os.getenv("SUPABASE_ANON_KEY"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            gcs_bucket=os.getenv("GCS_BUCKET"),
            gcs_project=os.getenv("GCS_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT"),
            google_application_credentials=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
            gcs_raster_prefix=_normalize_path(os.getenv("GCS_RASTER_PREFIX")),
            gcs_flood_raster_path=_normalize_path(os.getenv("GCS_FLOOD_RASTER_PATH")),
            gcs_landcover_raster_path=_normalize_path(os.getenv("GCS_LANDCOVER_RASTER_PATH")),
            gcs_flood_raster_crs=os.getenv("GCS_FLOOD_RASTER_CRS"),
            gcs_landcover_raster_crs=os.getenv("GCS_LANDCOVER_RASTER_CRS"),
            cors_origins_raw=os.getenv(
                "CORS_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000",
            ),
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

    def raster_source_path(self, layer: str) -> str | None:
        layer = layer.lower()
        explicit_path = {
            "flood": self.gcs_flood_raster_path,
            "landcover": self.gcs_landcover_raster_path,
        }.get(layer)
        if explicit_path:
            return explicit_path
        if self.gcs_raster_prefix:
            return f"{self.gcs_raster_prefix}/{layer}"
        return None

    def raster_layer_status(self, layer: str) -> dict[str, object]:
        source_path = self.raster_source_path(layer)
        declared_crs = {
            "flood": self.gcs_flood_raster_crs,
            "landcover": self.gcs_landcover_raster_crs,
        }.get(layer.lower())
        missing_settings: list[str] = []
        if not self.gcs_bucket:
            missing_settings.append("GCS_BUCKET")
        if not source_path:
            missing_settings.append(
                {
                    "flood": "GCS_FLOOD_RASTER_PATH or GCS_RASTER_PREFIX",
                    "landcover": "GCS_LANDCOVER_RASTER_PATH or GCS_RASTER_PREFIX",
                }.get(layer.lower(), "GCS_RASTER_PREFIX")
            )

        return {
            "layer": layer,
            "configured": not missing_settings,
            "bucket": self.gcs_bucket,
            "source_path": source_path,
            "gcs_uri": f"gs://{self.gcs_bucket}/{source_path}" if self.gcs_bucket and source_path else None,
            "declared_crs": declared_crs,
            "credentials_mode": "service_account_file" if self.google_application_credentials else "adc_or_workload_identity",
            "google_application_credentials": self.google_application_credentials,
            "gcs_project": self.gcs_project,
            "missing_settings": missing_settings,
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
