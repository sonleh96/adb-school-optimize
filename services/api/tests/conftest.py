"""Shared fixtures and stubs for the API test suite."""

from __future__ import annotations

import os
import uuid

import psycopg
import pytest
from app import main as app_main
from app.main import app
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
def client(monkeypatch):
    # These tests never reach a database. Without this the app's startup opens a pool whenever DATABASE_URL is set,
    # which the screening database tests need, and then demands SUPABASE_URL as well.
    monkeypatch.setattr(app_main, "open_pool", lambda _settings=None: None)

    with TestClient(app) as test_client:
        yield test_client


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


def _connection_before(migration: str, tag: str):
    """A fresh database with the migrations before ``migration`` applied; the test applies ``migration`` itself."""
    url = _server_url()
    name = f"rise_screening_{tag}_{uuid.uuid4().hex[:8]}"
    earlier = [path for path in migration_files() if path.name < migration]
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
        try:
            with psycopg.connect(make_conninfo(url, dbname=name), autocommit=True) as conn:
                apply_migrations(conn, earlier)
                yield conn
        finally:
            _drop(admin, name)


@pytest.fixture
def connection_before_screening(migrated_template):
    """A fresh database with the migrations before 005 applied; the test applies 005 itself."""
    yield from _connection_before(SCREENING_MIGRATION.name, "pre")


@pytest.fixture
def connection_before_persistence(migrated_template):
    """A fresh database with the migrations before 006 applied; the test applies 006 itself."""
    yield from _connection_before("006_screening_persistence.sql", "pre6")


@pytest.fixture
def connection_before_per_rule_persistence(migrated_template):
    """A fresh database with the migrations before 007 applied; the test applies 007 itself."""
    yield from _connection_before("007_screening_persistence_per_rule.sql", "pre7")


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
