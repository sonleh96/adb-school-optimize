"""The screening migration: re-runnable, locked down, and unable to hold contradictory rows."""

from __future__ import annotations

import psycopg
import pytest
from school_scoring.screening import INPUT_CONTRACT, GateFailure
from screening_db_factories import mixed_records
from screening_db_helpers import TABLES, VERSION, apply_migrations, load, rows, scalar

SCHEMA_QUERY = """
select 'column' as kind, table_name || '.' || column_name as name,
       concat_ws(' ', data_type, is_nullable, column_default, is_generated, generation_expression) as detail
from information_schema.columns where table_schema = 'public'
union all
select 'constraint', conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)
from pg_constraint where connamespace = 'public'::regnamespace
union all
select 'index', tablename || '.' || indexname, indexdef from pg_indexes where schemaname = 'public'
union all
select 'rls', relname, relrowsecurity::text
from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
union all
select 'comment', c.relname || '.' || d.objsubid, d.description
from pg_description d join pg_class c on c.oid = d.objoid where c.relnamespace = 'public'::regnamespace
order by 1, 2
"""


def test_migrations_are_rerunnable_and_leave_the_schema_unchanged(connection):  # DB1
    before = rows(connection, SCHEMA_QUERY)
    assert {r["name"] for r in before if r["kind"] == "rls"} >= set(TABLES)

    apply_migrations(connection)

    assert rows(connection, SCHEMA_QUERY) == before


def test_migrations_keep_rows_when_rerun(connection):  # DB1
    load(connection, mixed_records())
    counts = {t: scalar(connection, f"select count(*) from {t}") for t in TABLES}

    apply_migrations(connection)

    assert {t: scalar(connection, f"select count(*) from {t}") for t in TABLES} == counts
    assert counts["screening_results"] == 7 * len(mixed_records())


PRIVILEGES = ("select", "insert", "update", "delete", "truncate", "references", "trigger")


def test_new_tables_are_closed_to_the_data_api_roles(connection):  # DB2
    for table in TABLES:
        assert (
            scalar(connection, "select relrowsecurity from pg_class where oid = %s::regclass", (table,))
            is True
        )
        for role in ("anon", "authenticated"):
            granted = [
                p
                for p in PRIVILEGES
                if scalar(connection, "select has_table_privilege(%s, %s, %s)", (role, f"public.{table}", p))
            ]
            assert granted == [], f"{role} can {granted} on {table}"

    # The check can fail: a grant is seen.
    connection.execute("grant select on screening_runs to anon")
    assert scalar(connection, "select has_table_privilege('anon', 'public.screening_runs', 'select')") is True


def test_inputs_table_has_one_column_per_contract_field(connection):  # DB12
    stored = {
        r["column_name"]: r["data_type"]
        for r in rows(
            connection,
            "select column_name, data_type from information_schema.columns "
            "where table_schema = 'public' and table_name = 'screening_inputs'",
        )
    }
    expected = {
        "source_school_name" if f.name == "school_name" else f.name: "double precision"
        if f.numeric
        else "text"
        for f in INPUT_CONTRACT
    }
    bookkeeping = {
        "input_version": "text",
        "record_position": "integer",
        "source_school_name_norm": "text",
        "school_id": "uuid",
    }
    assert stored == {**expected, **bookkeeping}


@pytest.fixture
def loaded(connection):
    load(connection, mixed_records())
    return connection


def _name(connection, cohort: str) -> str:
    return scalar(
        connection,
        "select source_school_name from screening_results r join screening_runs u using (run_id) "
        "where u.rule_id = 'additive_u' and r.cohort = %s order by source_school_name limit 1",
        (cohort,),
    )


CONTRADICTIONS = [
    ("complete without a point score", "complete", "score_point = null", "screening_results_point_only_when_complete"),
    ("complete without a point rank", "complete", "rank_point = null", "screening_results_point_only_when_complete"),
    ("interval with a point score", "interval", "score_point = 0.5", "screening_results_point_only_when_complete"),
    ("queued without a gate failure", "verification_queue", "gate_failures = '{}'", "screening_results_queue_has_gate_failures"),
    ("complete with a gate failure", "complete", "gate_failures = array['unresolved_reach']", "screening_results_queue_has_gate_failures"),
    ("unknown gate failure", "verification_queue", "gate_failures = array['made_up']", "screening_results_gate_failures_check"),
    ("unknown cohort", "complete", "cohort = 'unknown'", "screening_results_cohort_check"),
    ("queued with bounds", "verification_queue", "score_lower = 0.1, score_upper = 0.2", "screening_results_bounds_unless_queued"),
    ("best rank worse than worst rank", "complete", "rank_best = 99, rank_worst = 98", "screening_results_bounds_ordered"),
    ("lower bound above upper bound", "complete", "score_lower = score_upper + 1", "screening_results_bounds_ordered"),
    ("point rank beyond its scope count", "complete", "rank_point = rank_point_count + 1", "screening_results_ranks_within_scope"),
    ("rank without its scope label", "complete", "rank_point_scope = ''", "screening_results_rank_point_scope_check"),
    ("components that are not an object", "complete", "components = '[]'::jsonb", "screening_results_components_check"),
]  # fmt: skip


@pytest.mark.parametrize(
    ("why", "cohort", "change", "constraint"), CONTRADICTIONS, ids=[c[0] for c in CONTRADICTIONS]
)
def test_contradictory_result_rows_are_rejected(loaded, why, cohort, change, constraint):  # DB11
    name = _name(loaded, cohort)
    with pytest.raises(psycopg.errors.CheckViolation) as error:
        loaded.execute(
            f"update screening_results set {change} "
            "where source_school_name = %s and run_id = (select run_id from screening_runs where rule_id = 'additive_u')",
            (name,),
        )
    assert error.value.diag.constraint_name == constraint


@pytest.mark.parametrize("failure", list(GateFailure), ids=lambda f: f.value)
def test_every_engine_gate_failure_is_accepted_by_the_database(loaded, failure):  # DB11, DB12
    name = _name(loaded, "verification_queue")
    loaded.execute(
        "update screening_results set gate_failures = array[%s] "
        "where source_school_name = %s and run_id = (select run_id from screening_runs where rule_id = 'additive_u')",
        (failure.value, name),
    )
    stored = scalar(
        loaded,
        "select gate_failures from screening_results r join screening_runs u using (run_id) "
        "where u.rule_id = 'additive_u' and r.source_school_name = %s",
        (name,),
    )
    assert stored == [failure.value]


def test_run_must_state_the_input_hash_of_its_version(loaded):  # DB11
    copy_with_other_hash = (
        "insert into screening_runs (input_version, rule_id, provenance, policy_role, score_kind, manifest, "
        "input_sha256, anchors_sha256, package_version) "
        "select input_version, rule_id, provenance, policy_role, score_kind, manifest, "
        "repeat('a', 64), anchors_sha256, '9.9.9' from screening_runs where rule_id = 'additive_u'"
    )
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        loaded.execute(copy_with_other_hash)
    assert scalar(loaded, "select count(*) from screening_runs where input_version = %s", (VERSION,)) == 7


def test_duplicate_run_for_one_version_rule_and_package_is_rejected(loaded):  # DB4
    with pytest.raises(psycopg.errors.UniqueViolation) as error:
        loaded.execute(
            "insert into screening_runs (input_version, rule_id, provenance, policy_role, score_kind, manifest, "
            "input_sha256, anchors_sha256, package_version) "
            "select input_version, rule_id, provenance, policy_role, score_kind, manifest, "
            "input_sha256, anchors_sha256, package_version from screening_runs where rule_id = 'additive_u'"
        )
    assert error.value.diag.constraint_name == "screening_runs_input_version_rule_id_package_version_key"
