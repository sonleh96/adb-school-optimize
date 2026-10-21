"""The bulk inputs route, the machine-readable scopes and the persistence flags, against a real database and the real app."""

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
from screening_db_factories import awkward_number_records, record, write_persistence_files
from screening_db_helpers import load

API = "/api/v1/screening"
CIRCULATED = "additive_u"
REVISED = "additive_no_u"
# The two rules that can have persistence numbers, and every other rule, which never carries them.
PERSISTENCE_RULES = [CIRCULATED, REVISED]
OTHER_RULES = [r for r in RULES if r not in PERSISTENCE_RULES]
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
# The urgency-omitted experiment's numbers: different schools are persistent, so one rule's flag is never the other's.
EXPERIMENT_ROWS_NO_U = {
    AWK[7]: (0.85, 0.9, 1.0),  # persistent
    AWK[8]: (
        0.9,
        0.79,
        0.9,
    ),  # one setting below: not persistent here, persistent under the circulated experiment
    AWK[5]: (0.95, 0.95, 0.95),  # persistent here, not under the circulated experiment
    "Interval No Air": (0.1, 0.2, 0.3),
}
EXPECTED_FLAGS_NO_U = {AWK[7]: True, AWK[8]: False, AWK[5]: True, "Interval No Air": False}
EXPECTED_FLAGS_BY_RULE = {CIRCULATED: EXPECTED_FLAGS, REVISED: EXPECTED_FLAGS_NO_U}


def both_sets(reference, circulated=EXPERIMENT_ROWS, revised=EXPERIMENT_ROWS_NO_U):
    """The two experiments' files, invented, read for their own rules."""
    return [
        read_persistence_source(reference, write_persistence_files(reference, circulated), CIRCULATED),
        read_persistence_source(
            reference, write_persistence_files(reference, revised, urgency_omitted=True), REVISED
        ),
    ]


def fetch(api, path: str, **params):
    response = api.get(path, params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def loaded(api, connection, tmp_path):
    return load_synthetic(connection, persistence=both_sets(tmp_path / "reference"))


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
    for school, stored in zip(bulk["schools"], loaded.records, strict=True):  # in the order supplied
        assert school["source_school_name"] == stored.school_name
        assert school["school_key"] == school_key(loaded.input_version, stored.school_name)
        detail = fetch(api, f"{API}/schools/by-key/{quote(school['school_key'], safe='')}")
        assert school["inputs"] == detail["inputs"], stored.school_name
        assert school["inputs"] == {f.name: getattr(stored, f.name) for f in fields(stored)}
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


def scope_pairs(node, where="response"):
    """Every scope label in a JSON body with the code beside it (None when there is none), at its path."""
    found = []
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "scope" or key.endswith("_scope"):
                code_key = "scope_code" if key == "scope" else f"{key}_code"
                found.append((f"{where}.{key}", value, node.get(code_key)))
            else:
                found += scope_pairs(value, f"{where}.{key}")
    elif isinstance(node, list):
        for i, item in enumerate(node):
            found += scope_pairs(item, f"{where}[{i}]")
    return found


def label_of(code: str, label: str) -> bool:
    """Whether the engine writes ``label`` for a scope of kind ``code``. Counts come from the engine's own builders."""
    count = int(label.rsplit("(", 1)[1].rstrip(")"))
    if code == "complete_under_rule":
        return label == point_rank_scope(count)
    if code == "eligible":
        return label == rank_bounds_scope(count)
    if code == "common_complete_cohort":
        return label.startswith("common complete cohort of ") and label.endswith(f" ({count})")
    return False


def test_every_route_that_serves_a_scope_label_serves_its_code_and_the_two_agree(api, loaded):  # API32
    key = quote(school_key(loaded.input_version, AWK[7]), safe="")
    bodies = {
        **{f"results/{r}": fetch(api, f"{API}/results", rule=r) for r in RULES},
        "results/upper": fetch(api, f"{API}/results", rule=CIRCULATED, placement="upper"),
        "detail": fetch(api, f"{API}/schools/by-key/{key}"),
        "linked": fetch(api, f"{API}/schools/{loaded.school_ids[AWK[7]]}"),
        "compare": fetch(api, f"{API}/compare", a=CIRCULATED, b="additive_no_u"),
        "compare/needs-first": fetch(api, f"{API}/compare", a="need_first_u", b="bottleneck_u"),
    }
    for name, body in bodies.items():
        pairs = scope_pairs(body, name)
        assert pairs, name
        for path, label, code in pairs:
            assert code is not None, f"{path} has a label and no code"
            assert label_of(code, label), f"{path}: the label {label!r} is not the engine's for code {code!r}"
    # The comparison serves all three kinds: ranks, entrants and exits, the common cohort and interval bounds.
    compare_codes = {code for _, _, code in scope_pairs(bodies["compare"])}
    assert compare_codes == {"common_complete_cohort", "eligible"}


def thirty_schools():
    """Thirty complete schools whose order differs between rules enough to change the top 20."""
    n = 30
    return tuple(
        record(
            f"Compare School {i:02d}",
            permanent_classrooms=float((i * 3) % 7),
            teacher_houses=float((i * 5) % 6),
            libraries=float(i % 2),
            secondary_students_per_1000=30.0 + 17 * ((i * 7) % n),
            progression_g10_corrected_pct=50.0 + (i * 11) % 45,
            walking_catchment_population=100.0 * (1 + (i * 13) % n),
            aqi_p95_selected=20.0 + 3 * ((i * 5) % n),
            emissions_co2e_100yr_10km_tonnes=float(((i * 3) % n) ** 2),
            water_flooded_vegetation_fraction_500m=round(0.02 * ((i * 7) % n) / 2, 2),
            urgency_source_scalar=round(((i * 17) % n) / n, 3),
        )
        for i in range(n)
    )


def test_every_entrant_and_exit_of_a_comparison_carries_the_common_cohort_scope_code(
    api, connection
):  # API39
    # With fewer than 20 schools in common every school is in both top lists and there are no entrants or exits, so a
    # wrong code on them would go unseen. Thirty schools make the lists change.
    load_synthetic(connection, thirty_schools())

    body = fetch(api, f"{API}/compare", a=CIRCULATED, b="additive_no_u")

    changes = [*body["entrants"], *body["exits"]]
    assert len(body["entrants"]) == len(body["exits"]) > 0  # the precondition: the loop below is not empty
    assert body["common_cohort_count"] == 30
    for change in changes:
        assert change["rank_scope_code"] == "common_complete_cohort", change["status"]
        assert change["rank_scope"] == body["common_cohort_scope"]
        assert label_of(change["rank_scope_code"], change["rank_scope"])
        assert 1 <= change["rank_a"] <= 30 and 1 <= change["rank_b"] <= 30
    assert {c["status"] for c in changes} == {"entrant", "exit"}
    # The ranks of the whole common cohort carry the same code.
    assert {r["rank_scope_code"] for r in body["ranks"]} == {"common_complete_cohort"}


def test_a_wrong_scope_code_on_an_entrant_or_an_exit_is_caught_by_the_check():  # API39
    # The check that the test above uses rejects the other two kinds of scope for a compared rank.
    label = "common complete cohort of additive_u, additive_no_u (30)"
    assert label_of("common_complete_cohort", label)
    assert not label_of("complete_under_rule", label)
    assert not label_of("eligible", label)


def test_a_label_and_a_code_that_disagree_are_caught_by_the_check():  # API32
    assert label_of("eligible", "eligible (5)") and not label_of("complete_under_rule", "eligible (5)")
    assert not label_of("eligible", "complete under this rule (5)")
    assert not label_of("common_complete_cohort", "eligible (5)")
    assert not label_of("made_up", "eligible (5)")


def test_the_codes_follow_the_engine_for_the_stored_runs(api, loaded):  # API32
    engine = screen_all(prepare(loaded.records))
    for rule_id, run in engine.items():
        body = fetch(api, f"{API}/results", rule=rule_id)
        assert body["manifest"]["point_rank_scope"] == run.manifest.point_rank_scope
        assert body["manifest"]["rank_bounds_scope"] == run.manifest.rank_bounds_scope


# ---------------------------------------------------------------------------------------------
# The persistence flags. Each belongs to the rule its experiment was run for, and to no other.
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize("rule_id", PERSISTENCE_RULES)
def test_each_list_flags_the_schools_of_its_own_experiment_and_leaves_the_rest_null(
    api, loaded, rule_id
):  # API33
    body = fetch(api, f"{API}/results", rule=rule_id)

    flags = {r["school"]["source_school_name"]: r["persistent_candidate"] for r in body["rows"]}
    expected = EXPECTED_FLAGS_BY_RULE[rule_id]
    assert len(flags) == len(loaded.records)
    assert {n: f for n, f in flags.items() if f is not None} == expected
    assert [n for n, f in flags.items() if f is None and n in expected] == []
    assert sum(f is None for f in flags.values()) == len(loaded.records) - len(expected)


def test_the_two_rules_disagree_where_their_experiments_do(api, loaded):  # API33
    flags = {
        rule_id: {
            r["school"]["source_school_name"]: r["persistent_candidate"]
            for r in fetch(api, f"{API}/results", rule=rule_id)["rows"]
        }
        for rule_id in PERSISTENCE_RULES
    }

    assert flags[CIRCULATED][AWK[8]] is True and flags[REVISED][AWK[8]] is False
    assert flags[CIRCULATED][AWK[5]] is False and flags[REVISED][AWK[5]] is True


def test_no_other_rule_carries_the_flag_or_the_provenance_at_all(api, loaded):  # API34
    for rule_id in OTHER_RULES:
        body = fetch(api, f"{API}/results", rule=rule_id)
        assert "persistence" not in body, rule_id
        assert all("persistent_candidate" not in row for row in body["rows"]), rule_id
        text = json.dumps(body)
        assert "persistent" not in text and "limitation" not in text, rule_id

    # Nor does a comparison of the two rules that have numbers.
    compare = fetch(api, f"{API}/compare", a=CIRCULATED, b=REVISED)
    assert "persistent" not in json.dumps(compare)


def test_the_school_detail_flags_the_entry_of_each_rule_with_that_rules_own_numbers(api, loaded):  # API34
    detail = fetch(api, f"{API}/schools/by-key/{quote(school_key(loaded.input_version, AWK[8]), safe='')}")
    absent = fetch(api, f"{API}/schools/by-key/{quote(school_key(loaded.input_version, AWK[0]), safe='')}")

    flagged = {e["rule"]["rule_id"]: e for e in detail["rules"] if "persistent_candidate" in e}
    assert sorted(flagged) == sorted(PERSISTENCE_RULES)
    assert flagged[CIRCULATED]["persistent_candidate"] is True
    assert flagged[REVISED]["persistent_candidate"] is False
    assert (flagged[CIRCULATED]["lowest_top20_frequency"], flagged[REVISED]["lowest_top20_frequency"]) == (
        0.8,
        0.79,
    )
    assert "persistent_candidate" not in json.dumps(
        [e for e in detail["rules"] if e["rule"]["rule_id"] in OTHER_RULES]
    )
    for entry in absent["rules"]:
        if entry["rule"]["rule_id"] in PERSISTENCE_RULES:
            assert entry["persistent_candidate"] is None
    assert "persistent_candidate" not in json.dumps(detail["inputs"]) + json.dumps(detail["school"])


def test_each_rules_provenance_names_its_experiment_and_its_own_limit(api, loaded):  # API35
    by_rule = {r: fetch(api, f"{API}/results", rule=r)["persistence"] for r in PERSISTENCE_RULES}
    rules = fetch(api, f"{API}/rules")["input_versions"][0]["persistence"]
    listing = fetch(api, f"{API}/input-versions")["input_versions"][0]["persistence"]

    assert rules == listing
    assert [p["rule_id"] for p in rules] == sorted(PERSISTENCE_RULES)  # ordered by rule id
    assert {p["rule_id"]: p for p in rules} == by_rule
    for rule_id, provenance in by_rule.items():
        assert (
            provenance["rule_id"] == rule_id
            and provenance["draws"] == 5000
            and provenance["threshold"] == 0.8
        )
        assert provenance["experiment_id"].startswith("EXP-") and len(provenance["source_sha256"]) == 64
        assert [s["setting_id"] for s in provenance["settings"]] == [
            "concentration_20_15",
            "concentration_40_35",
            "concentration_100_80",
        ]
    assert by_rule[CIRCULATED]["experiment_id"] != by_rule[REVISED]["experiment_id"]
    assert by_rule[CIRCULATED]["source_sha256"] != by_rule[REVISED]["source_sha256"]
    assert by_rule[CIRCULATED]["limitation"] == (
        "This count belongs to the circulated paper's urgency-included experiment. "
        "It must not be relabelled as an urgency-omitted result."
    )
    assert by_rule[REVISED]["limitation"] == (
        "This is the revised paper's six-component run. "
        "It is a revised sensitivity result, not an isolated estimate of urgency's effect."
    )


def test_the_rules_list_says_which_experiment_backs_each_rule(api, loaded):  # API35
    body = fetch(api, f"{API}/rules")
    experiments = {p["rule_id"]: p["experiment_id"] for p in body["input_versions"][0]["persistence"]}

    for rule in body["rules"]:
        if rule["rule_id"] in PERSISTENCE_RULES:
            assert rule["persistence_by_input_version"] == {
                loaded.input_version: experiments[rule["rule_id"]]
            }
        else:
            assert rule["persistence_by_input_version"] == {}, rule["rule_id"]
    assert len(set(experiments.values())) == 2


# With 5,000 draws the standard error at 0.80 is sqrt(0.8 * 0.2 / 5000) = 0.005657.
MARGIN_ROWS = {
    AWK[0]: (0.8014, 0.9, 0.95),  # persistent, 0.0014 above the line: adjacent
    AWK[1]: (0.9, 0.8056, 0.95),  # persistent, 0.0056 above: just inside the margin
    AWK[2]: (0.95, 0.8057, 0.9),  # persistent, 0.0057 above: just outside the margin
    AWK[3]: (0.99, 0.98, 0.97),  # persistent, far above
    AWK[4]: (0.9, 0.7999, 0.95),  # just below the line in one setting: not persistent, so not adjacent
    "Interval No Air": (0.8, 0.8, 0.8),  # exactly on the line: persistent and adjacent
}
# The revised paper's band is two standard errors, 0.011314.
MARGIN_ROWS_NO_U = {
    AWK[0]: (0.8014, 0.9, 0.95),  # adjacent
    AWK[1]: (0.9, 0.8056, 0.95),  # adjacent
    AWK[2]: (0.95, 0.8113, 0.9),  # 0.0113 above: just inside two standard errors
    AWK[3]: (0.99, 0.8114, 0.97),  # 0.0114 above: just outside
    AWK[4]: (0.9, 0.7999, 0.95),  # not persistent, so not adjacent
    "Interval No Air": (0.8, 0.8, 0.8),  # on the line: adjacent
}


@pytest.fixture
def loaded_with_margins(api, connection, tmp_path):
    return load_synthetic(
        connection, persistence=both_sets(tmp_path / "reference", MARGIN_ROWS, MARGIN_ROWS_NO_U)
    )


def margins(api, rule_id: str, rows: dict) -> dict:
    body = fetch(api, f"{API}/results", rule=rule_id)
    seen = {
        r["school"]["source_school_name"]: (
            r["persistent_candidate"],
            r["lowest_top20_frequency"],
            r["threshold_adjacent"],
        )
        for r in body["rows"]
        if r["school"]["source_school_name"] in rows
    }
    outside = [r for r in body["rows"] if r["school"]["source_school_name"] not in rows]
    assert {
        (r["persistent_candidate"], r["lowest_top20_frequency"], r["threshold_adjacent"]) for r in outside
    } == {(None, None, None)}
    return seen


def test_a_persistent_school_is_threshold_adjacent_under_the_circulated_rule_inside_one_standard_error(
    api, loaded_with_margins
):  # API36
    assert margins(api, CIRCULATED, MARGIN_ROWS) == {
        AWK[0]: (True, 0.8014, True),
        AWK[1]: (True, 0.8056, True),
        AWK[2]: (True, 0.8057, False),
        AWK[3]: (True, 0.97, False),
        AWK[4]: (False, 0.7999, False),
        "Interval No Air": (True, 0.8, True),
    }


def test_a_persistent_school_is_threshold_adjacent_under_the_revised_rule_inside_two_standard_errors(
    api, loaded_with_margins
):  # API36
    assert margins(api, REVISED, MARGIN_ROWS_NO_U) == {
        AWK[0]: (True, 0.8014, True),
        AWK[1]: (True, 0.8056, True),
        AWK[2]: (True, 0.8113, True),
        AWK[3]: (True, 0.8114, False),
        AWK[4]: (False, 0.7999, False),
        "Interval No Air": (True, 0.8, True),
    }


def test_the_detail_carries_the_margin_fields_on_the_entries_of_the_two_rules_only(
    api, loaded_with_margins
):  # API36, API34
    key = quote(school_key(loaded_with_margins.input_version, AWK[2]), safe="")
    detail = fetch(api, f"{API}/schools/by-key/{key}")

    entries = {e["rule"]["rule_id"]: e for e in detail["rules"]}
    assert (entries[CIRCULATED]["lowest_top20_frequency"], entries[CIRCULATED]["threshold_adjacent"]) == (
        0.8057,
        False,
    )
    assert (entries[REVISED]["lowest_top20_frequency"], entries[REVISED]["threshold_adjacent"]) == (
        0.8113,
        True,
    )
    for rule_id in OTHER_RULES:
        assert not {"lowest_top20_frequency", "threshold_adjacent"} & entries[rule_id].keys(), rule_id


def test_the_provenance_states_the_margin_each_rule_is_judged_by(api, loaded_with_margins):  # API36, API35
    circulated = fetch(api, f"{API}/results", rule=CIRCULATED)["persistence"]
    revised = fetch(api, f"{API}/results", rule=REVISED)["persistence"]

    for provenance in (circulated, revised):
        assert provenance["standard_error"] == pytest.approx((0.8 * 0.2 / 5000) ** 0.5, abs=1e-15)
        assert "sqrt(threshold * (1 - threshold) / draws)" in provenance["threshold_adjacent_rule"]
    assert circulated["adjacency_standard_errors"] == 1
    assert "less than one standard error above the threshold" in circulated["threshold_adjacent_rule"]
    assert revised["adjacency_standard_errors"] == 2
    assert "less than two standard errors above the threshold" in revised["threshold_adjacent_rule"]


def test_a_version_without_the_numbers_has_null_flags_and_no_provenance(
    api, loaded_without_persistence
):  # API33, API35
    for rule_id in PERSISTENCE_RULES:
        body = fetch(api, f"{API}/results", rule=rule_id)

        assert body["persistence"] is None, rule_id
        assert {r["persistent_candidate"] for r in body["rows"]} == {None}
        assert {(r["lowest_top20_frequency"], r["threshold_adjacent"]) for r in body["rows"]} == {
            (None, None)
        }
    rules = fetch(api, f"{API}/rules")
    assert rules["input_versions"][0]["persistence"] == []
    assert all(r["persistence_by_input_version"] == {} for r in rules["rules"])


def test_a_version_with_one_set_serves_only_that_rules_provenance(api, connection, tmp_path):  # API35
    reference = tmp_path / "reference"
    circulated_only = both_sets(reference)[:1]
    load_synthetic(connection, persistence=circulated_only)

    body = fetch(api, f"{API}/rules")

    assert [p["rule_id"] for p in body["input_versions"][0]["persistence"]] == [CIRCULATED]
    assert fetch(api, f"{API}/results", rule=CIRCULATED)["persistence"]["rule_id"] == CIRCULATED
    revised = fetch(api, f"{API}/results", rule=REVISED)
    assert revised["persistence"] is None and {r["persistent_candidate"] for r in revised["rows"]} == {None}


def test_another_versions_numbers_are_not_lent_to_a_version_without_them(api, connection, tmp_path):  # API33
    load_synthetic(connection, version="with", persistence=both_sets(tmp_path / "reference"))
    load(connection, api_records(), "without")  # loaded last, so it is the default

    for rule_id in PERSISTENCE_RULES:
        default = fetch(api, f"{API}/results", rule=rule_id)
        pinned = fetch(api, f"{API}/results", rule=rule_id, input_version="with")

        assert default["run"]["input_version"] == "without" and default["persistence"] is None
        assert {r["persistent_candidate"] for r in default["rows"]} == {None}
        assert pinned["persistence"] is not None
        assert {r["school"]["source_school_name"]: r["persistent_candidate"] for r in pinned["rows"]}[
            AWK[7]
        ] is True


@pytest.mark.parametrize("rule_id", PERSISTENCE_RULES)
def test_the_flag_does_not_move_a_rank_or_a_score(api, loaded, rule_id):  # API12
    with_flag = fetch(api, f"{API}/results", rule=rule_id)

    stripped = [{k: v for k, v in row.items() if k != "persistent_candidate"} for row in with_flag["rows"]]
    engine = screen_all(prepare(loaded.records))[rule_id]
    by_name = {r.school_name: r for r in engine.results}
    for row in stripped:
        expected = by_name[row["school"]["source_school_name"]]
        assert row["point_rank"]["rank"] == expected.rank_point
        assert row["scores"]["point"] == expected.score_point
