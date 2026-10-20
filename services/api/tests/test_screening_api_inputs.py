"""The bulk inputs route, the machine-readable scopes and the persistence flag, against a real database and the real app."""

from __future__ import annotations

import json
from dataclasses import fields, replace
from urllib.parse import quote

import pytest
from app.ingestion.load_screening_inputs import read_persistence_source
from app.screening_queries import school_key
from school_scoring.screening import (
    RULES,
    Cohort,
    point_rank_scope,
    prepare,
    rank_bounds_scope,
    screen_all,
)
from screening_api_helpers import api_records, load_synthetic
from screening_db_factories import (
    AWKWARD_NAMES as AWK,
)
from screening_db_factories import awkward_number_records, write_persistence_files
from screening_db_helpers import load

API = "/api/v1/screening"
CIRCULATED = "additive_u"
OTHER_RULES = [r for r in RULES if r != CIRCULATED]
IMMUTABLE = "private, max-age=31536000, immutable"
DEFAULT = "private, max-age=60, stale-while-revalidate=120"

# Spelled the way a person would; the stored names keep their own spelling. 0.8 is exactly the threshold.
EXPERIMENT_ROWS = {
    AWK[7]: (0.99, 0.98, 1.0),  # persistent
    AWK[8]: (0.8, 0.8, 0.8),  # exactly at the threshold: persistent
    AWK[5]: (0.9, 0.7999, 0.95),  # one setting just below: not persistent
    "Interval No Air": (0.1, 0.2, 0.3),  # an interval school can be in the experiment
}
EXPECTED_FLAGS = {AWK[7]: True, AWK[8]: True, AWK[5]: False, "Interval No Air": False}


def fetch(api, path: str, **params):
    response = api.get(path, params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def loaded(api, connection, tmp_path):
    reference = tmp_path / "reference"
    relative = write_persistence_files(reference, EXPERIMENT_ROWS)
    return load_synthetic(connection, persistence=read_persistence_source(reference, relative))


@pytest.fixture
def loaded_without_persistence(api, connection):
    return load_synthetic(connection)


# ---------------------------------------------------------------------------------------------
# The bulk inputs route.
# ---------------------------------------------------------------------------------------------


def test_the_bulk_inputs_equal_the_per_school_detail_for_every_school(api, loaded):  # API31
    bulk = fetch(api, f"{API}/inputs")

    assert bulk["input_version"] == loaded.input_version
    assert len(bulk["schools"]) == len(loaded.records)
    for school, record in zip(bulk["schools"], loaded.records, strict=True):  # in the order supplied
        assert school["source_school_name"] == record.school_name
        assert school["school_key"] == school_key(loaded.input_version, record.school_name)
        detail = fetch(api, f"{API}/schools/by-key/{quote(school['school_key'], safe='')}")
        assert school["inputs"] == detail["inputs"], record.school_name
        assert school["inputs"] == {f.name: getattr(record, f.name) for f in fields(record)}
        assert set(school) == {"school_key", "source_school_name", "inputs"}


def test_the_bulk_inputs_name_the_version_and_its_hash_like_every_other_screening_route(api, loaded):  # API31
    response = api.get(f"{API}/inputs")
    results = api.get(f"{API}/results")

    assert response.json()["input_sha256"] == results.json()["run"]["input_sha256"]
    assert response.headers["x-screening-input-version"] == loaded.input_version
    assert response.headers["x-screening-input-sha256"] == response.json()["input_sha256"]


def test_the_bulk_inputs_keep_every_value_exactly(api, connection):  # API12
    records = awkward_number_records()
    load(connection, records)
    by_name = {r.school_name: r for r in records}

    bulk = api.get(f"{API}/inputs")
    schools = json.loads(bulk.text)["schools"]

    extremes = next(s for s in schools if s["source_school_name"] == "Extremes")["inputs"]
    assert (
        extremes["emissions_co2e_100yr_10km_tonnes"] == by_name["Extremes"].emissions_co2e_100yr_10km_tonnes
    )
    assert extremes["urgency_source_scalar"] == 5e-324
    negative_zero = next(s for s in schools if s["source_school_name"] == "Negative Zero")["inputs"]
    assert str(negative_zero["teacher_houses"]) == "-0.0"
    noise = next(s for s in schools if s["source_school_name"] == "Noise")["inputs"]
    assert noise["conflict_population_exposure"] == 0.1 + 0.2
    # An unknown input stays null, never zero, and names keep their spaces.
    queued = next(s for s in schools if s["source_school_name"] == "Zed queue")["inputs"]
    assert queued["teachers"] is None
    assert [s["source_school_name"] for s in schools if s["source_school_name"].endswith(" ")] == [AWK[1]]


def test_the_default_is_the_latest_version_and_a_named_version_gives_its_own_schools(
    api, connection
):  # API14, API31
    first = load_synthetic(connection, version="paper-v1")
    changed = tuple(
        replace(r, aqi_p95_selected=55.0) if r.school_name == AWK[0] else r for r in first.records
    )
    load(connection, changed, "paper-v2")

    default = fetch(api, f"{API}/inputs")
    old = fetch(api, f"{API}/inputs", input_version="paper-v1")

    assert (default["input_version"], old["input_version"]) == ("paper-v2", "paper-v1")
    assert default["input_sha256"] != old["input_sha256"]
    assert default["schools"][0]["inputs"]["aqi_p95_selected"] == 55.0
    assert old["schools"][0]["inputs"]["aqi_p95_selected"] == first.records[0].aqi_p95_selected
    # A school's key differs between versions, because the key names its version.
    assert default["schools"][0]["school_key"] != old["schools"][0]["school_key"]


def test_an_unknown_version_is_a_404_in_the_error_envelope_and_nothing_loaded_is_too(
    api, connection
):  # API11
    empty = api.get(f"{API}/inputs")
    assert empty.status_code == 404 and empty.json()["error"]["code"] == "no_input_versions"

    load_synthetic(connection)
    unknown = api.get(f"{API}/inputs", params={"input_version": "nope"})
    assert unknown.status_code == 404
    error = unknown.json()["error"]
    assert error["code"] == "unknown_input_version" and error["details"]["known"] == ["synthetic-v1"]
    assert "etag" not in unknown.headers and "cache-control" not in unknown.headers


def test_a_request_that_names_the_version_is_immutable_and_the_default_is_not(api, loaded):  # API10, API31
    default = api.get(f"{API}/inputs")
    named = api.get(f"{API}/inputs", params={"input_version": loaded.input_version})

    assert default.headers["cache-control"] == DEFAULT
    assert named.headers["cache-control"] == IMMUTABLE
    assert named.headers["etag"] == default.headers["etag"] and named.content == default.content
    again = api.get(
        f"{API}/inputs",
        params={"input_version": loaded.input_version},
        headers={"If-None-Match": named.headers["etag"]},
    )
    assert again.status_code == 304 and again.headers["cache-control"] == IMMUTABLE


def test_the_validator_changes_with_the_input_version(api, connection):  # API10
    first = load_synthetic(connection, version="paper-v1")
    changed = tuple(
        replace(r, aqi_p95_selected=55.0) if r.school_name == AWK[0] else r for r in first.records
    )
    load(connection, changed, "paper-v2")

    tags = {
        v: api.get(f"{API}/inputs", params={"input_version": v}).headers["etag"]
        for v in ("paper-v1", "paper-v2")
    }

    assert tags["paper-v1"] != tags["paper-v2"]


# ---------------------------------------------------------------------------------------------
# Scope codes.
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize("rule_id", list(RULES))
def test_every_rank_carries_a_scope_code_that_matches_its_label_and_count(api, loaded, rule_id):  # API32
    body = fetch(api, f"{API}/results", rule=rule_id)
    manifest = body["manifest"]
    counts = manifest["cohort_counts"]
    complete, interval = counts[Cohort.COMPLETE.value], counts[Cohort.INTERVAL.value]

    # The labels are the engine's own, built from the count the same response states.
    assert manifest["point_rank_scope"] == point_rank_scope(manifest["point_rank_count"])
    assert manifest["rank_bounds_scope"] == rank_bounds_scope(manifest["rank_bounds_count"])
    assert manifest["point_rank_count"] == complete
    assert manifest["rank_bounds_count"] == complete + interval
    assert (manifest["point_rank_scope_code"], manifest["rank_bounds_scope_code"]) == (
        "complete_under_rule",
        "eligible",
    )
    for row in body["rows"]:
        point, bounds = row["point_rank"], row["rank_bounds"]
        assert point["scope_code"] == "complete_under_rule" and bounds["scope_code"] == "eligible"
        assert point["scope"] == manifest["point_rank_scope"] and point["count"] == complete
        assert bounds["scope"] == manifest["rank_bounds_scope"] and bounds["count"] == complete + interval


def test_a_range_school_has_two_different_scopes_and_the_codes_say_which_is_which(api, loaded):  # API32
    rows = fetch(api, f"{API}/results", rule=CIRCULATED)["rows"]
    interval = next(r for r in rows if r["cohort"] == "interval")
    complete = next(r for r in rows if r["cohort"] == "complete")

    assert interval["point_rank"]["rank"] is None
    assert interval["point_rank"]["scope_code"] == "complete_under_rule"  # the scope it is not ranked in
    assert interval["rank_bounds"]["scope_code"] == "eligible" and interval["rank_bounds"]["best"] is not None
    assert complete["point_rank"]["scope"] != complete["rank_bounds"]["scope"]
    assert complete["point_rank"]["scope_code"] != complete["rank_bounds"]["scope_code"]


def test_the_school_detail_carries_the_codes_for_every_rule(api, loaded):  # API32
    key = quote(school_key(loaded.input_version, AWK[7]), safe="")
    detail = fetch(api, f"{API}/schools/by-key/{key}")

    assert len(detail["rules"]) == len(RULES)
    for entry in detail["rules"]:
        result = entry["result"]
        assert entry["point_rank_scope_code"] == result["point_rank"]["scope_code"] == "complete_under_rule"
        assert entry["rank_bounds_scope_code"] == result["rank_bounds"]["scope_code"] == "eligible"


def test_the_codes_follow_the_engine_for_the_stored_runs(api, loaded):  # API32
    engine = screen_all(prepare(loaded.records))
    for rule_id, run in engine.items():
        body = fetch(api, f"{API}/results", rule=rule_id)
        assert body["manifest"]["point_rank_scope"] == run.manifest.point_rank_scope
        assert body["manifest"]["rank_bounds_scope"] == run.manifest.rank_bounds_scope


# ---------------------------------------------------------------------------------------------
# The persistence flag. It belongs to the circulated rule and to no other.
# ---------------------------------------------------------------------------------------------


def test_the_circulated_list_flags_the_schools_of_the_experiment_and_leaves_the_rest_null(
    api, loaded
):  # API33
    body = fetch(api, f"{API}/results", rule=CIRCULATED)

    flags = {r["school"]["source_school_name"]: r["persistent_candidate"] for r in body["rows"]}
    assert len(flags) == len(loaded.records)
    assert {n: f for n, f in flags.items() if f is not None} == EXPECTED_FLAGS
    assert [n for n, f in flags.items() if f is None and n in EXPECTED_FLAGS] == []
    assert sum(f is None for f in flags.values()) == len(loaded.records) - len(EXPECTED_FLAGS)


def test_no_other_rule_carries_the_flag_or_the_provenance_at_all(api, loaded):  # API34
    for rule_id in OTHER_RULES:
        body = fetch(api, f"{API}/results", rule=rule_id)
        assert "persistence" not in body, rule_id
        assert all("persistent_candidate" not in row for row in body["rows"]), rule_id
        text = json.dumps(body)
        assert "persistent" not in text and "limitation" not in text, rule_id

    # Nor does a comparison of the circulated rule with another.
    compare = fetch(api, f"{API}/compare", a=CIRCULATED, b="additive_no_u")
    assert "persistent" not in json.dumps(compare)


def test_the_school_detail_flags_only_the_circulated_rules_entry(api, loaded):  # API34
    detail = fetch(api, f"{API}/schools/by-key/{quote(school_key(loaded.input_version, AWK[7]), safe='')}")
    absent = fetch(api, f"{API}/schools/by-key/{quote(school_key(loaded.input_version, AWK[0]), safe='')}")

    flagged = {e["rule"]["rule_id"]: e for e in detail["rules"] if "persistent_candidate" in e}
    assert list(flagged) == [CIRCULATED] and flagged[CIRCULATED]["persistent_candidate"] is True
    assert "persistent_candidate" not in json.dumps(
        [e for e in detail["rules"] if e["rule"]["rule_id"] != CIRCULATED]
    )
    assert (
        next(e for e in absent["rules"] if e["rule"]["rule_id"] == CIRCULATED)["persistent_candidate"] is None
    )
    assert "persistent_candidate" not in json.dumps(detail["inputs"]) + json.dumps(detail["school"])


def test_the_provenance_travels_with_the_flag_and_names_the_rule_and_the_limit(api, loaded):  # API35
    results = fetch(api, f"{API}/results", rule=CIRCULATED)["persistence"]
    rules = fetch(api, f"{API}/rules")["input_versions"][0]["persistence"]
    listing = fetch(api, f"{API}/input-versions")["input_versions"][0]["persistence"]

    assert results == rules == listing
    assert results["rule_id"] == CIRCULATED and results["draws"] == 5000 and results["threshold"] == 0.8
    assert results["experiment_id"].startswith("EXP-") and len(results["source_sha256"]) == 64
    assert [s["setting_id"] for s in results["settings"]] == [
        "concentration_20_15",
        "concentration_40_35",
        "concentration_100_80",
    ]
    assert (
        "included urgency" in results["limitation"]
        and "not a result of the proposed rule" in results["limitation"]
    )


def test_a_version_without_the_numbers_has_null_flags_and_no_provenance(
    api, loaded_without_persistence
):  # API33, API35
    body = fetch(api, f"{API}/results", rule=CIRCULATED)

    assert body["persistence"] is None
    assert {r["persistent_candidate"] for r in body["rows"]} == {None}
    assert fetch(api, f"{API}/rules")["input_versions"][0]["persistence"] is None


def test_another_versions_numbers_are_not_lent_to_a_version_without_them(api, connection, tmp_path):  # API33
    reference = tmp_path / "reference"
    relative = write_persistence_files(reference, EXPERIMENT_ROWS)
    load_synthetic(connection, version="with", persistence=read_persistence_source(reference, relative))
    load(connection, api_records(), "without")  # loaded last, so it is the default

    default = fetch(api, f"{API}/results", rule=CIRCULATED)
    pinned = fetch(api, f"{API}/results", rule=CIRCULATED, input_version="with")

    assert default["run"]["input_version"] == "without" and default["persistence"] is None
    assert {r["persistent_candidate"] for r in default["rows"]} == {None}
    assert pinned["persistence"] is not None
    assert {r["school"]["source_school_name"]: r["persistent_candidate"] for r in pinned["rows"]}[
        AWK[7]
    ] is True


def test_the_flag_does_not_move_a_rank_or_a_score(api, loaded, connection):  # API12
    with_flag = fetch(api, f"{API}/results", rule=CIRCULATED)

    stripped = [{k: v for k, v in row.items() if k != "persistent_candidate"} for row in with_flag["rows"]]
    engine = screen_all(prepare(loaded.records))[CIRCULATED]
    by_name = {r.school_name: r for r in engine.results}
    for row in stripped:
        expected = by_name[row["school"]["source_school_name"]]
        assert row["point_rank"]["rank"] == expected.rank_point
        assert row["scores"]["point"] == expected.score_point
