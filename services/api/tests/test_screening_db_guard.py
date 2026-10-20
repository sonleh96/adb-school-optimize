"""The guard that decides whether the database tests may run, and what happens when they cannot.

These tests need no database: they exercise the guard itself.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from screening_db_helpers import (
    NO_DATABASE,
    DatabaseTestsUnavailable,
    require_database_tests,
    server_url,
)

API_ROOT = Path(__file__).resolve().parents[1]

ACCEPTED = [
    "postgresql://postgres:pw@localhost:5432/postgres",
    "postgresql://postgres:pw@127.0.0.1:55432/postgres",
    "postgresql://postgres:pw@[::1]:5432/postgres",
    "host=localhost port=5432 user=postgres dbname=postgres",
    "postgresql:///postgres?host=localhost",
]

REFUSED = {
    "remote host": "postgresql://postgres:pw@db.example.com:5432/postgres",
    "host-less url": "postgresql://postgres:pw@/postgres",
    "no host at all": "postgresql:///postgres",
    "host list with a remote entry": "postgresql://postgres:pw@localhost,db.example.com/postgres",
    "hostaddr beside a local host": "postgresql://postgres:pw@localhost/postgres?hostaddr=203.0.113.7",
    "hostaddr in key-value form": "host=localhost hostaddr=203.0.113.7 dbname=postgres",
    "service entry": "service=remote",
    "unix socket path": "postgresql://postgres@%2Fvar%2Frun%2Fpostgresql/postgres",
    "unparseable": "postgresql://[bad",
}


@pytest.mark.parametrize("url", ACCEPTED)
def test_explicit_local_hosts_are_accepted(url):  # DB20
    assert server_url({"DATABASE_URL": url}) == url


@pytest.mark.parametrize("url", REFUSED.values(), ids=REFUSED.keys())
def test_anything_that_could_reach_another_server_is_refused(url):  # DB20
    with pytest.raises(DatabaseTestsUnavailable, match=r"refusing|cannot be parsed"):
        server_url({"DATABASE_URL": url})


@pytest.mark.parametrize("name", ["PGHOST", "PGHOSTADDR", "PGSERVICE"])
def test_a_redirecting_environment_variable_is_refused_even_with_a_local_url(name):  # DB20
    environ = {"DATABASE_URL": ACCEPTED[0], name: "db.example.com"}
    with pytest.raises(DatabaseTestsUnavailable, match=f"{name} is set"):
        server_url(environ)


def test_a_missing_url_is_reported_with_the_documented_message():  # DB20
    with pytest.raises(DatabaseTestsUnavailable) as error:
        server_url({})
    assert str(error.value) == NO_DATABASE


@pytest.mark.parametrize(
    ("value", "required"), [("1", True), ("true", True), (" YES ", True), ("0", False), ("", False)]
)
def test_require_flag_reads_the_environment(value, required):  # DB21
    assert require_database_tests({"REQUIRE_DATABASE_TESTS": value}) is required
    assert require_database_tests({}) is False


def run_one_database_test(**env: str) -> subprocess.CompletedProcess:
    """Run a single database test in a child pytest with a controlled environment."""
    clean = {k: v for k, v in os.environ.items() if k not in {"DATABASE_URL", "REQUIRE_DATABASE_TESTS"}}
    clean = {k: v for k, v in clean.items() if not k.startswith("PG")}
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/test_screening_db_schema.py::test_inputs_table_has_one_column_per_contract_field",
            "-q",
            "-rs",
            "-p",
            "no:cacheprovider",
        ],
        cwd=API_ROOT,
        env={**clean, **env},
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_database_tests_skip_without_a_database_unless_required():  # DB21
    skipped = run_one_database_test()
    assert skipped.returncode == 0, skipped.stdout
    assert "1 skipped" in skipped.stdout and NO_DATABASE in skipped.stdout

    required = run_one_database_test(REQUIRE_DATABASE_TESTS="1")
    assert required.returncode != 0
    assert "REQUIRE_DATABASE_TESTS is set but the database tests cannot run" in required.stdout
    assert "skipped" not in required.stdout


def test_a_refused_server_also_fails_when_the_database_tests_are_required():  # DB20, DB21
    remote = "postgresql://postgres:pw@db.example.com:5432/postgres"

    skipped = run_one_database_test(DATABASE_URL=remote)
    assert skipped.returncode == 0 and "1 skipped" in skipped.stdout
    assert "refusing to create test databases" in skipped.stdout

    required = run_one_database_test(DATABASE_URL=remote, REQUIRE_DATABASE_TESTS="1")
    assert required.returncode != 0
    assert "REQUIRE_DATABASE_TESTS is set but the database tests cannot run" in required.stdout
