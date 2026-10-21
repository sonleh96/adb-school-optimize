"""A database that an earlier engine loaded: stale runs fail clearly, and loading again with this engine repairs it.

The earlier engine (package version 0.1.0) stored the revised paper's rules with a provenance this API no longer
knows, and stored the circulated rules with the roles they had before the revision. The runs are made here by
rewriting what a load stores, because the earlier engine is not part of this tree.
"""

from __future__ import annotations

import json
from urllib.parse import quote

import pytest
from app.screening_queries import package_version_key, school_key
from school_scoring.screening import PACKAGE_VERSION, RULES
from screening_api_helpers import api_records, load_synthetic
from screening_db_factories import AWKWARD_NAMES as AWK
from screening_db_helpers import load

API = "/api/v1/screening"
OLD_VERSION = "0.1.0"
# What the engine at 0.1.0 stored for each rule: its provenance, then its policy role.
OLD_METADATA = {
    "additive_u": ("circulated_paper", "primary"),
    "additive_no_u": ("proposed_follow_up_pending_author_review", "primary"),
    "need_first_u": ("circulated_paper", "strict_alternative"),
    "need_first_no_u": ("proposed_follow_up_pending_author_review", "strict_alternative"),
    "bottleneck_u": ("circulated_paper", "policy_sensitivity"),
    "bottleneck_no_u": ("proposed_follow_up_pending_author_review", "policy_sensitivity"),
    "benchmark": ("circulated_paper", "conventional_reference"),
}
STALE = sorted(
    r
    for r, (p, role) in OLD_METADATA.items()
    if (p, role) != (RULES[r].provenance.value, RULES[r].policy_role.value)
)


def make_the_runs_those_of_the_earlier_engine(connection) -> None:
    for rule_id, (provenance, role) in OLD_METADATA.items():
        connection.execute(
            "update screening_runs set provenance = %(p)s, policy_role = %(r)s, package_version = %(v)s, "
            "manifest = manifest || jsonb_build_object('provenance', %(p)s::text, 'policy_role', %(r)s::text, "
            "'package_version', %(v)s::text) where rule_id = %(rule)s",
            {"p": provenance, "r": role, "v": OLD_VERSION, "rule": rule_id},
        )


@pytest.fixture
def old_database(api, connection):
    loaded = load_synthetic(connection)
    make_the_runs_those_of_the_earlier_engine(connection)
    return loaded


def test_the_engine_is_newer_than_the_one_that_stored_the_old_runs():  # API40
    assert package_version_key(PACKAGE_VERSION) > package_version_key(OLD_VERSION)
    assert sorted(RULES.keys() - {"benchmark"}) == STALE


@pytest.mark.parametrize("rule_id", STALE)
def test_a_stale_run_answers_409_and_names_itself_never_500(old_database, api, rule_id):  # API40
    response = api.get(f"{API}/results", params={"rule": rule_id})

    assert response.status_code == 409, response.text
    error = response.json()["error"]
    assert error["code"] == "stale_run"
    assert error["details"]["rule"] == rule_id
    assert error["details"]["package_version"] == OLD_VERSION
    assert error["details"]["input_version"] == old_database.input_version
    assert "Load the input version again" in error["message"]


def test_every_route_that_reads_a_run_refuses_a_stale_one_clearly(old_database, api):  # API40
    key = quote(school_key(old_database.input_version, AWK[7]), safe="")
    requests = [
        ("/results", {"rule": "additive_no_u"}),
        ("/compare", {"a": "additive_u", "b": "benchmark"}),
        ("/exports/top.csv", {"rule": "additive_no_u"}),
        ("/exports/top.xlsx", {"rule": "need_first_no_u"}),
        ("/exports/incomplete.csv", {"rule": "additive_u"}),
        (f"/schools/by-key/{key}", {}),
        (f"/schools/{old_database.school_ids[AWK[7]]}", {}),
    ]
    for path, params in requests:
        response = api.get(API + path, params=params)
        assert response.status_code == 409, (path, response.status_code)
        assert response.json()["error"]["code"] == "stale_run", path


def test_a_run_whose_rule_metadata_is_unchanged_is_still_served(old_database, api):  # API40
    # The benchmark's provenance and role are the same now as then, so its old run reads correctly.
    assert api.get(f"{API}/results", params={"rule": "benchmark"}).status_code == 200


def test_loading_the_version_again_stores_the_current_runs_and_the_api_serves_them(
    old_database, api, connection
):  # API41
    report = load(connection, api_records(), old_database.input_version)

    assert sorted(report.runs_created) == sorted(RULES) and report.runs_unchanged == ()
    versions = {
        r[0]: r[1]
        for r in connection.execute(
            "select rule_id, array_agg(package_version order by package_version) from screening_runs group by rule_id"
        ).fetchall()
    }
    assert all(v == [OLD_VERSION, PACKAGE_VERSION] for v in versions.values()), versions

    rules = api.get(f"{API}/rules").json()["rules"]
    roles = {r["rule_id"]: (r["provenance"], r["policy_role"]) for r in rules}
    for rule_id in RULES:
        body = api.get(f"{API}/results", params={"rule": rule_id})
        assert body.status_code == 200, (rule_id, body.text[:200])
        served = body.json()
        assert served["run"]["package_version"] == PACKAGE_VERSION
        # The list says what /rules says: one primary rule, and no stored role from the old engine.
        assert (served["manifest"]["provenance"], served["manifest"]["policy_role"]) == roles[rule_id]
    assert [r for r, (_, role) in roles.items() if role == "primary"] == ["additive_no_u"]
    assert api.get(f"{API}/exports/top.csv", params={"rule": "additive_no_u"}).status_code == 200
    assert api.get(f"{API}/compare", params={"a": "additive_u", "b": "additive_no_u"}).status_code == 200
    detail = api.get(f"{API}/schools/by-key/{quote(school_key(old_database.input_version, AWK[7]), safe='')}")
    assert detail.status_code == 200
    assert {e["run"]["package_version"] for e in detail.json()["rules"]} == {PACKAGE_VERSION}


def test_the_old_run_can_still_be_pinned_and_is_refused_by_name(old_database, api, connection):  # API41
    load(connection, api_records(), old_database.input_version)

    pinned = api.get(f"{API}/results", params={"rule": "additive_no_u", "package_version": OLD_VERSION})

    assert pinned.status_code == 409
    assert json.loads(pinned.text)["error"]["details"]["package_version"] == OLD_VERSION
