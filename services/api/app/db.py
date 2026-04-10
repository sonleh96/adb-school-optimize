from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from .errors import ConfigurationError, DependencyError
from .settings import Settings, get_settings


def create_connection(settings: Settings | None = None) -> psycopg.Connection:
    settings = settings or get_settings()
    try:
        settings.validate_database()
    except ValueError as exc:
        raise ConfigurationError(str(exc)) from exc

    try:
        return psycopg.connect(settings.database_url, row_factory=dict_row)
    except psycopg.Error as exc:
        raise DependencyError("Unable to connect to Supabase Postgres.", details={"type": exc.__class__.__name__}) from exc


@contextmanager
def get_db(settings: Settings | None = None) -> Iterator[psycopg.Connection]:
    connection = create_connection(settings)
    try:
        yield connection
    finally:
        connection.close()
