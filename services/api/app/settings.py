from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .raster_keys import build_district_raster_object_key


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
    gcs_district_clip_prefix: str | None
    gcs_flood_district_clip_prefix: str | None
    gcs_landcover_district_clip_prefix: str | None
    gcs_luminosity_district_clip_prefix: str | None
    gcs_elevation_district_clip_prefix: str | None
    gcs_flood_raster_crs: str | None
    gcs_landcover_raster_crs: str | None
    gcs_luminosity_raster_crs: str | None
    gcs_elevation_raster_crs: str | None
    raster_cache_dir: str
    raster_cache_ttl_seconds: int
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
            gcs_district_clip_prefix=_normalize_path(os.getenv("GCS_DISTRICT_CLIP_PREFIX")),
            gcs_flood_district_clip_prefix=_normalize_path(os.getenv("GCS_FLOOD_DISTRICT_CLIP_PREFIX")),
            gcs_landcover_district_clip_prefix=_normalize_path(os.getenv("GCS_LANDCOVER_DISTRICT_CLIP_PREFIX")),
            gcs_luminosity_district_clip_prefix=_normalize_path(os.getenv("GCS_LUMINOSITY_DISTRICT_CLIP_PREFIX")),
            gcs_elevation_district_clip_prefix=_normalize_path(os.getenv("GCS_ELEVATION_DISTRICT_CLIP_PREFIX")),
            gcs_flood_raster_crs=os.getenv("GCS_FLOOD_RASTER_CRS"),
            gcs_landcover_raster_crs=os.getenv("GCS_LANDCOVER_RASTER_CRS"),
            gcs_luminosity_raster_crs=os.getenv("GCS_LUMINOSITY_RASTER_CRS"),
            gcs_elevation_raster_crs=os.getenv("GCS_ELEVATION_RASTER_CRS"),
            raster_cache_dir=os.getenv("RASTER_CACHE_DIR", str(Path(tempfile.gettempdir()) / "rise-png-raster-cache")),
            raster_cache_ttl_seconds=int(os.getenv("RASTER_CACHE_TTL_SECONDS", "3600")),
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

    def raster_district_clip_prefix(self, layer: str) -> str | None:
        layer = layer.lower()
        explicit_prefix = {
            "flood": self.gcs_flood_district_clip_prefix,
            "landcover": self.gcs_landcover_district_clip_prefix,
            "luminosity": self.gcs_luminosity_district_clip_prefix,
            "elevation": self.gcs_elevation_district_clip_prefix,
        }.get(layer)
        if explicit_prefix:
            return explicit_prefix
        return self.gcs_district_clip_prefix

    def raster_district_clip_path(self, layer: str, province: str, district: str, *, extension: str = "tif") -> str | None:
        prefix = self.raster_district_clip_prefix(layer)
        if not prefix:
            return None
        if not province.strip() or not district.strip():
            return None
        return "/".join(
            [
                prefix,
                build_district_raster_object_key(layer, province, district, extension=extension),
            ]
        )

    def raster_layer_status(self, layer: str) -> dict[str, object]:
        district_clip_prefix = self.raster_district_clip_prefix(layer)
        declared_crs = {
            "flood": self.gcs_flood_raster_crs,
            "landcover": self.gcs_landcover_raster_crs,
            "luminosity": self.gcs_luminosity_raster_crs,
            "elevation": self.gcs_elevation_raster_crs,
        }.get(layer.lower())
        missing_settings: list[str] = []
        if not self.gcs_bucket:
            missing_settings.append("GCS_BUCKET")
        if not district_clip_prefix:
            missing_settings.append(
                {
                    "flood": "GCS_FLOOD_DISTRICT_CLIP_PREFIX or GCS_DISTRICT_CLIP_PREFIX",
                    "landcover": "GCS_LANDCOVER_DISTRICT_CLIP_PREFIX or GCS_DISTRICT_CLIP_PREFIX",
                    "luminosity": "GCS_LUMINOSITY_DISTRICT_CLIP_PREFIX or GCS_DISTRICT_CLIP_PREFIX",
                    "elevation": "GCS_ELEVATION_DISTRICT_CLIP_PREFIX or GCS_DISTRICT_CLIP_PREFIX",
                }.get(layer.lower(), "GCS_DISTRICT_CLIP_PREFIX")
            )

        return {
            "layer": layer,
            "configured": not missing_settings,
            "bucket": self.gcs_bucket,
            "source_path": None,
            "district_clip_prefix": district_clip_prefix,
            "gcs_uri": f"gs://{self.gcs_bucket}/{district_clip_prefix}" if self.gcs_bucket and district_clip_prefix else None,
            "declared_crs": declared_crs,
            "credentials_mode": "service_account_file" if self.google_application_credentials else "adc_or_workload_identity",
            "google_application_credentials": self.google_application_credentials,
            "gcs_project": self.gcs_project,
            "missing_settings": missing_settings,
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
