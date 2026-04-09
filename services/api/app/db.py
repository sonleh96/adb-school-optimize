from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from .settings import Settings


def create_connection(settings: Settings | None = None) -> psycopg.Connection:
    settings = settings or Settings()
    settings.validate()
    return psycopg.connect(settings.database_url, row_factory=dict_row)


@contextmanager
def get_db(settings: Settings | None = None) -> Iterator[psycopg.Connection]:
    connection = create_connection(settings)
    try:
        yield connection
    finally:
        connection.close()

