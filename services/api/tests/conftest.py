"""Shared fixtures and stubs for the API test suite."""

from __future__ import annotations

import os
import uuid
from contextlib import contextmanager
from types import SimpleNamespace

import psycopg
import pytest
from app import main as app_main
from app.main import app
from app.routers import districts, exports, meta, rasters, scenarios, schools, scoring
from app.security import require_write_operations, write_rate_limiter
from app.settings import get_settings
from fastapi.testclient import TestClient
from psycopg import sql
from psycopg.conninfo import make_conninfo
from screening_db_helpers import (
    SCREENING_MIGRATION,
    DatabaseTestsUnavailable,
    apply_migrations,
    migration_files,
    require_database_tests,
    server_url,
)


@pytest.fixture
def fake_connection():
    return object()


@pytest.fixture(autouse=True)
def reset_write_rate_limiter():
    write_rate_limiter.clear()
    yield
    write_rate_limiter.clear()


@pytest.fixture
def client(fake_connection, monkeypatch):
    @contextmanager
    def fake_get_db(_settings=None):
        yield fake_connection

    for module in (meta, schools, districts, scenarios, scoring, exports, rasters):
        monkeypatch.setattr(module, "get_db", fake_get_db)
    # These tests never reach a database. Without this the app's startup opens a pool whenever DATABASE_URL is set,
    # which the screening database tests need, and then demands SUPABASE_URL as well.
    monkeypatch.setattr(app_main, "open_pool", lambda _settings=None: None)

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def write_enabled_client(client):
    app.dependency_overrides[require_write_operations] = lambda: None
    try:
        yield client
    finally:
        app.dependency_overrides.pop(require_write_operations, None)


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


# ---------------------------------------------------------------------------------------------
# Real PostGIS for the screening database tests. Each test gets its own database, cloned from a
# template that has every migration applied, so tests never see each other's rows.
# ---------------------------------------------------------------------------------------------

# Supabase provides these roles; a plain PostGIS server does not, and 002_security_lockdown.sql refers to them.
BOOTSTRAP_ROLES = """
do $$
begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end
$$
"""


def _server_url() -> str:
    try:
        return server_url(os.environ)
    except DatabaseTestsUnavailable as error:
        if require_database_tests(os.environ):
            pytest.fail(
                f"REQUIRE_DATABASE_TESTS is set but the database tests cannot run: {error}", pytrace=False
            )
        pytest.skip(str(error))


def _drop(admin: psycopg.Connection, name: str) -> None:
    admin.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name)))


@pytest.fixture(scope="session")
def migrated_template():
    url = _server_url()
    name = f"rise_screening_tmpl_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(BOOTSTRAP_ROLES)
        admin.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
        try:
            with psycopg.connect(make_conninfo(url, dbname=name), autocommit=True) as connection:
                apply_migrations(connection)
            yield name
        finally:
            _drop(admin, name)


@pytest.fixture
def database_url(migrated_template):
    url = _server_url()
    name = f"rise_screening_test_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            sql.SQL("create database {} template {}").format(
                sql.Identifier(name), sql.Identifier(migrated_template)
            )
        )
        try:
            yield make_conninfo(url, dbname=name)
        finally:
            _drop(admin, name)


@pytest.fixture
def connection(database_url):
    with psycopg.connect(database_url, autocommit=True) as conn:
        yield conn


@pytest.fixture
def connection_before_screening(migrated_template):
    """A fresh database with the migrations before 005 applied; the test applies 005 itself."""
    url = _server_url()
    name = f"rise_screening_pre_{uuid.uuid4().hex[:8]}"
    earlier = [path for path in migration_files() if path.name < SCREENING_MIGRATION.name]
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
        try:
            with psycopg.connect(make_conninfo(url, dbname=name), autocommit=True) as conn:
                apply_migrations(conn, earlier)
                yield conn
        finally:
            _drop(admin, name)


@pytest.fixture
def connection_before_persistence(migrated_template):
    """A fresh database with the migrations before 006 applied; the test applies 006 itself."""
    url = _server_url()
    name = f"rise_screening_pre6_{uuid.uuid4().hex[:8]}"
    earlier = [path for path in migration_files() if path.name < "006_screening_persistence.sql"]
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
        try:
            with psycopg.connect(make_conninfo(url, dbname=name), autocommit=True) as conn:
                apply_migrations(conn, earlier)
                yield conn
        finally:
            _drop(admin, name)


# ---------------------------------------------------------------------------------------------
# The real application on a real, migrated database, for the screening API tests.
# The app opens its own connection pool from DATABASE_URL, exactly as it does when deployed.
# ---------------------------------------------------------------------------------------------


@pytest.fixture
def api(database_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    get_settings.cache_clear()
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        get_settings.cache_clear()
