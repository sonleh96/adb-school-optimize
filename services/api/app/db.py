"""Database connection helpers used by the API and ingestion scripts."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .errors import ConfigurationError, DependencyError
from .settings import Settings, get_settings

_pool: ConnectionPool | None = None


def create_connection(settings: Settings | None = None) -> psycopg.Connection:
    settings = settings or get_settings()
    try:
        settings.validate_database()
    except ValueError as exc:
        raise ConfigurationError(str(exc)) from exc

    try:
        return psycopg.connect(settings.database_url, row_factory=dict_row)
    except psycopg.Error as exc:
        raise DependencyError(
            "Unable to connect to Supabase Postgres.", details={"type": exc.__class__.__name__}
        ) from exc


def open_pool(settings: Settings | None = None) -> ConnectionPool | None:
    """Open a process-wide connection pool. No-op when DATABASE_URL is unset."""
    global _pool
    if _pool is not None:
        return _pool

    settings = settings or get_settings()
    if not settings.database_url:
        return None

    try:
        settings.validate_database()
    except ValueError as exc:
        raise ConfigurationError(str(exc)) from exc

    try:
        _pool = ConnectionPool(
            conninfo=settings.database_url,
            # min_size=0 keeps startup/tests from blocking on a remote DB connect.
            min_size=0,
            max_size=10,
            timeout=30,
            kwargs={"row_factory": dict_row},
            open=True,
        )
    except Exception as exc:
        raise DependencyError(
            "Unable to open Supabase Postgres connection pool.",
            details={"type": exc.__class__.__name__},
        ) from exc
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is None:
        return
    _pool.close()
    _pool = None


@contextmanager
def get_db(settings: Settings | None = None) -> Iterator[psycopg.Connection]:
    """Yield a pooled connection when available; otherwise open a one-off connection."""
    settings = settings or get_settings()
    pool = _pool
    if pool is None and settings.database_url:
        pool = open_pool(settings)

    if pool is not None:
        try:
            with pool.connection() as connection:
                yield connection
            return
        except psycopg.Error as exc:
            raise DependencyError(
                "Unable to connect to Supabase Postgres.", details={"type": exc.__class__.__name__}
            ) from exc

    connection = create_connection(settings)
    try:
        yield connection
    finally:
        connection.close()
