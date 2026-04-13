from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import districts, exports, meta, rasters, scenarios, schools, scoring


@pytest.fixture
def fake_connection():
    return object()


@pytest.fixture
def client(fake_connection, monkeypatch):
    @contextmanager
    def fake_get_db(_settings=None):
        yield fake_connection

    for module in (meta, schools, districts, scenarios, scoring, exports, rasters):
        monkeypatch.setattr(module, "get_db", fake_get_db)

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def fake_settings():
    return SimpleNamespace(
        gcs_bucket="adb-school-optimize",
        gcs_project="adb-sr",
        google_application_credentials="/tmp/service-account.json",
        raster_district_clip_path=lambda layer, province, district, extension="tif": None,
        raster_layer_status=lambda layer: {
            "layer": layer,
            "configured": True,
            "bucket": "adb-school-optimize",
            "source_path": f"rise-png/rasters/{layer}/example.tif",
            "district_clip_prefix": None,
            "gcs_uri": f"gs://adb-school-optimize/rise-png/rasters/{layer}/example.tif",
            "declared_crs": "EPSG:4326",
            "credentials_mode": "service_account_file",
            "google_application_credentials": "/tmp/service-account.json",
            "gcs_project": "adb-sr",
            "missing_settings": [],
        },
    )
