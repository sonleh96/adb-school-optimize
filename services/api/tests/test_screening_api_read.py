"""Rules, input versions, ranked results, school detail and comparison, against a real database and the real app."""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import asdict, replace

import pytest
from app import screening_store as store
from school_scoring.screening import RULES, pairwise_metrics
from screening_api_helpers import api_records, load_synthetic
from screening_db_factories import AWKWARD_NAMES as AWK
from screening_db_factories import record
from screening_db_helpers import load

RULE_IDS = list(RULES)
URGENCY_OMITTED = [r for r in RULES if not RULES[r].uses_urgency]

# Positions by construction, under the urgency-included additive rule (see api_records and the engine output):
# point ranks 1 to 9 are AWK[7], AWK[8], AWK[5], AWK[6], AWK[2], AWK[3], AWK[1], AWK[4], AWK[0].
# "Interval No Air" has scores 0.5236 to 0.5736 and "Interval No Land" 0.5073 to 0.5573.
COMPLETE_ORDER_ADDITIVE_U = [AWK[7], AWK[8], AWK[5], AWK[6], AWK[2], AWK[3], AWK[1], AWK[4], AWK[0]]
QUEUE_ORDER = ["Éclair queue", "Zed queue", "alpha queue", "Beta queue"]


def names(response_json: dict) -> list[str]:
    return [row["school"]["source_school_name"] for row in response_json["rows"]]


def fetch(api, path: str, **params):
    response = api.get(path, params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def loaded(api, connection):
    return load_synthetic(connection)


# ---------------------------------------------------------------------------------------------
# Rules and input versions.
# ---------------------------------------------------------------------------------------------


def test_rules_list_the_registry_with_weights_as_fractions_and_floats(api, loaded):  # API3, API8, API14
    body = fetch(api, "/api/v1/screening/rules")

    rules = {r["rule_id"]: r for r in body["rules"]}
    assert list(rules) == RULE_IDS
    assert body["default_rule_id"] == "additive_u"
    assert [r["rule_id"] for r in body["rules"] if r["is_default"]] == ["additive_u"]

    circulated = rules["additive_u"]
    assert circulated["provenance"] == "circulated_paper"
    assert circulated["policy_role"] == "urgency_sensitivity"
    assert circulated["score_kind"] == "additive score" and circulated["uses_urgency"] is True
    assert [(w["component"], w["fraction"], w["value"]) for w in circulated["weights"]] == [
        ("N", "3/5", 0.6),
        ("A", "3/20", 0.15),
        ("U", "1/20", 0.05),
        ("R", "1/20", 0.05),
        ("Q", "1/20", 0.05),
        ("E", "1/20", 0.05),
        ("L", "1/20", 0.05),
    ]

    omitted = rules["additive_no_u"]
    assert (omitted["provenance"], omitted["policy_role"]) == ("revised_paper", "primary")
    assert omitted["uses_urgency"] is False
    assert [(w["component"], w["fraction"]) for w in omitted["weights"]] == [
        ("N", "12/19"),
        ("A", "3/19"),
        ("R", "1/19"),
        ("Q", "1/19"),
        ("E", "1/19"),
        ("L", "1/19"),
    ]
    assert omitted["weights"][0]["value"] == pytest.approx(12 / 19, abs=1e-15)

    assert {rid: (r["provenance"], r["policy_role"]) for rid, r in rules.items()} == {
        "additive_no_u": ("revised_paper", "primary"),
        "need_first_no_u": ("revised_paper", "strict_alternative"),
        "bottleneck_no_u": ("revised_paper", "policy_sensitivity"),
        "additive_u": ("circulated_paper", "urgency_sensitivity"),
        "need_first_u": ("circulated_paper", "urgency_sensitivity"),
        "bottleneck_u": ("circulated_paper", "urgency_sensitivity"),
        "benchmark": ("circulated_paper", "conventional_reference"),
    }

    need_first = rules["need_first_no_u"]
    assert need_first["primary_sort_key"] == "N" and "N" not in [
        w["component"] for w in need_first["weights"]
    ]
    assert rules["bottleneck_no_u"]["maximum_components"] == ["N", "A"]
    assert rules["bottleneck_u"]["maximum_components"] == ["N", "A", "U"]
    assert {rid: r["uses_urgency"] for rid, r in rules.items()} == {
        "additive_u": True,
        "additive_no_u": False,
        "need_first_u": True,
        "need_first_no_u": False,
        "bottleneck_u": True,
        "bottleneck_no_u": False,
        "benchmark": True,
    }
    assert all(r["available_input_versions"] == [loaded.input_version] for r in rules.values())


def test_the_default_input_version_is_the_latest_and_is_marked(api, connection):  # API14
    first = load_synthetic(connection, version="paper-v1")
    changed = tuple(
        replace(r, aqi_p95_selected=55.0) if r.school_name == AWK[0] else r for r in first.records
    )
    load(connection, changed, "paper-v2")

    listing = fetch(api, "/api/v1/screening/input-versions")
    assert listing["default_input_version"] == "paper-v2"
    assert [(v["input_version"], v["is_default"]) for v in listing["input_versions"]] == [
        ("paper-v2", True),
        ("paper-v1", False),
    ]
    assert listing["input_versions"][0]["record_count"] == 15
    assert listing["input_versions"][0]["rules_available"] == sorted(RULES)
    assert listing["input_versions"][0]["input_sha256"] != listing["input_versions"][1]["input_sha256"]

    default_run = fetch(api, "/api/v1/screening/results")["run"]
    pinned_run = fetch(api, "/api/v1/screening/results", input_version="paper-v1")["run"]
    assert (default_run["input_version"], pinned_run["input_version"]) == ("paper-v2", "paper-v1")
    assert default_run["rule_id"] == "additive_u"


# ---------------------------------------------------------------------------------------------
# The list in the paper's order.
# ---------------------------------------------------------------------------------------------


def test_results_list_complete_schools_by_point_rank_then_interval_at_lower_bound_then_the_queue(
    api, loaded
):  # API1, API2, API5
    body = fetch(api, "/api/v1/screening/results", rule="additive_u")

    assert names(body) == [*COMPLETE_ORDER_ADDITIVE_U, "Interval No Air", "Interval No Land", *QUEUE_ORDER]
    assert [r["display_order"] for r in body["rows"]] == list(range(1, 16))
    assert [r["placement"] for r in body["rows"]] == ["point"] * 9 + ["lower"] * 2 + ["queue"] * 4
    assert body["placement"] == "lower"
    assert [r["point_rank"]["rank"] for r in body["rows"]] == [*range(1, 10), *[None] * 6]
    assert [r["scores"]["point"] is None for r in body["rows"]] == [False] * 9 + [True] * 6

    # Every row states the scope and count of both ranks, taken from the run.
    for row in body["rows"]:
        assert (
            row["point_rank"]["scope"] == "complete under this rule (9)" and row["point_rank"]["count"] == 9
        )
        assert row["rank_bounds"]["scope"] == "eligible (11)" and row["rank_bounds"]["count"] == 11
    assert body["manifest"]["point_rank_scope"] == "complete under this rule (9)"
    assert body["manifest"]["cohort_counts"] == {
        "records": 15,
        "complete": 9,
        "interval": 2,
        "verification_queue": 4,
    }

    interval = {r["school"]["source_school_name"]: r for r in body["rows"] if r["cohort"] == "interval"}
    assert interval["Interval No Air"]["rank_bounds"]["best"] == 5
    assert interval["Interval No Air"]["rank_bounds"]["worst"] == 11
    assert interval["Interval No Air"]["scores"]["lower"] == pytest.approx(0.5235556831228474, abs=1e-12)
    assert interval["Interval No Air"]["scores"]["upper"] == pytest.approx(0.5735556831228474, abs=1e-12)


def test_upper_placement_moves_interval_schools_to_their_upper_bound_and_says_so(api, loaded):  # API5, API28
    body = fetch(api, "/api/v1/screening/results", rule="additive_u", placement="upper")

    assert body["placement"] == "upper"
    assert (
        names(body)
        == [
            *COMPLETE_ORDER_ADDITIVE_U[:4],
            "Interval No Air",  # upper bound 0.5736, between 0.5904 and 0.5518
            "Interval No Land",  # upper bound 0.5573
            *COMPLETE_ORDER_ADDITIVE_U[4:],
            *QUEUE_ORDER,
        ]
    )
    assert [r["placement"] for r in body["rows"]].count("upper") == 2
    assert "lower" not in {r["placement"] for r in body["rows"]}
    # The display order counts the two interval schools placed among them; the ranks do not.
    complete = [r for r in body["rows"] if r["placement"] == "point"]
    assert [r["display_order"] - r["point_rank"]["rank"] for r in complete] == [0, 0, 0, 0, 2, 2, 2, 2, 2]
    assert "list_position" not in body["rows"][0]
    # Ranks do not follow the placement: complete schools keep their point ranks.
    assert [r["point_rank"]["rank"] for r in body["rows"] if r["placement"] == "point"] == list(range(1, 10))


def test_a_need_first_rule_places_interval_schools_by_need_first_then_by_score(api, loaded):  # API5
    body = fetch(api, "/api/v1/screening/results", rule="need_first_u")

    # N descending: 0.76, 0.72, 0.715, 0.675, 0.67, then 0.635 twice (a complete school with the larger secondary
    # score first, the interval school after it), 0.625, 0.61 (interval), 0.59, 0.58.
    assert names(body)[:11] == [
        AWK[0],
        AWK[7],
        AWK[1],
        AWK[8],
        AWK[2],
        AWK[5],
        "Interval No Air",
        AWK[3],
        "Interval No Land",
        AWK[6],
        AWK[4],
    ]
    assert body["manifest"]["sort_columns"] == ["sort_key_primary", "score_point"]
    placed = {r["school"]["source_school_name"]: r["placement"] for r in body["rows"]}
    assert (placed["Interval No Air"], placed["Interval No Land"]) == ("lower", "lower")


def test_the_queue_is_ordered_by_province_then_district_then_name_in_code_point_order(api, loaded):  # API5
    body = fetch(api, "/api/v1/screening/results", rule="additive_u")

    queue = [r for r in body["rows"] if r["placement"] == "queue"]
    assert [
        (r["school"]["province"], r["school"]["district"], r["school"]["source_school_name"]) for r in queue
    ] == [
        ("North", "North One", "Éclair queue"),
        ("North", "North Two", "Zed queue"),  # "Z" sorts before "a" in code point order
        ("North", "North Two", "alpha queue"),
        ("South", "South One", "Beta queue"),
    ]
    assert all(r["gate_failures"] for r in queue)
    assert next(r for r in queue if r["school"]["source_school_name"] == "Éclair queue")["gate_failures"] == [
        "urgency_unknown"
    ]


def test_urgency_omitted_rules_hold_back_only_the_schools_that_fail_the_gate(api, loaded):  # API3, API5
    body = fetch(api, "/api/v1/screening/results", rule="additive_no_u")

    queue = [r["school"]["source_school_name"] for r in body["rows"] if r["placement"] == "queue"]
    assert queue == ["Zed queue", "alpha queue", "Beta queue"]
    eclair = next(r for r in body["rows"] if r["school"]["source_school_name"] == "Éclair queue")
    assert eclair["placement"] == "point" and eclair["point_rank"]["rank"] == 10
    assert body["manifest"]["point_rank_scope"] == "complete under this rule (10)"


def test_filters_hide_rows_and_never_renumber_ranks(api, loaded):  # API4
    everything = fetch(api, "/api/v1/screening/results", rule="additive_u")
    north = fetch(api, "/api/v1/screening/results", rule="additive_u", province="North")

    assert names(north) == [
        AWK[2],
        AWK[3],
        AWK[1],
        AWK[4],
        AWK[0],
        "Interval No Air",
        "Éclair queue",
        "Zed queue",
        "alpha queue",
    ]
    # Complete North schools hold ranks 5 to 9 of the full list, not 1 to 5.
    assert [r["point_rank"]["rank"] for r in north["rows"][:5]] == [5, 6, 7, 8, 9]
    assert [r["display_order"] for r in north["rows"]] == [5, 6, 7, 8, 9, 10, 12, 13, 14]
    by_name = {r["school"]["source_school_name"]: r for r in everything["rows"]}
    assert all(r == by_name[r["school"]["source_school_name"]] for r in north["rows"])
    assert north["manifest"] == everything["manifest"] and north["run"] == everything["run"]
    assert (north["total_schools"], north["returned_schools"]) == (15, 9)
    assert north["filters"] == {"province": "North", "district": None}
    assert "only hide rows" in north["filters_note"] and "anchors" in north["filters_note"]

    district = fetch(
        api, "/api/v1/screening/results", rule="additive_u", province="North", district="North Two"
    )
    assert names(district) == [AWK[3], AWK[4], "Zed queue", "alpha queue"]
    assert [r["point_rank"]["rank"] for r in district["rows"][:2]] == [6, 8]


def test_every_rule_returns_exactly_what_the_engine_produced(api, loaded):  # API1, API12
    for rule_id in RULE_IDS:
        body = fetch(api, "/api/v1/screening/results", rule=rule_id)
        engine = {r.school_name: r for r in loaded.runs[rule_id].results}
        manifest = loaded.runs[rule_id].manifest

        # The engine's manifest, plus the two scope codes the API adds beside the engine's labels.
        codes = {"point_rank_scope_code": "complete_under_rule", "rank_bounds_scope_code": "eligible"}
        assert body["manifest"] == json.loads(
            json.dumps(manifest.to_dict() | {"cohort_counts": dict(manifest.cohort_counts)} | codes)
        )
        assert body["run"]["anchors_sha256"] == manifest.anchors_sha256
        assert body["run"]["input_sha256"] == manifest.input_sha256
        assert len(body["rows"]) == len(engine) == 15
        for row in body["rows"]:
            expected = engine[row["school"]["source_school_name"]]
            assert row["cohort"] == expected.cohort.value, rule_id
            assert row["gate_failures"] == [f.value for f in expected.gate_failures]
            wanted = asdict(expected.components)
            if not RULES[rule_id].uses_urgency:
                wanted.pop("U")  # an urgency-omitted rule has no U key at all
            assert row["components"] == wanted
            assert row["need_parts"] == asdict(expected.need_parts)
            assert row["area_parts"] == asdict(expected.area_parts)
            assert row["scores"] == {
                "lower": expected.score_lower,
                "upper": expected.score_upper,
                "point": expected.score_point,
                "sort_key_primary": None
                if manifest.primary_sort_key is None
                else getattr(expected.components, manifest.primary_sort_key),
            }
            assert row["point_rank"] == {
                "rank": expected.rank_point,
                "scope": manifest.point_rank_scope,
                "scope_code": "complete_under_rule",
                "count": manifest.point_rank_count,
            }
            assert row["rank_bounds"] == {
                "best": expected.rank_best,
                "worst": expected.rank_worst,
                "scope": manifest.rank_bounds_scope,
                "scope_code": "eligible",
                "count": manifest.rank_bounds_count,
            }
            assert row["contributions"] == [
                {"component": c.component.value, "weight": c.weight, "lower": c.lower, "upper": c.upper}
                for c in expected.contributions
            ]
            assert row["need_part_contributions"] == (
                None if expected.need_part_contributions is None else asdict(expected.need_part_contributions)
            )
            assert row["maximum_term"] == (
                None
                if expected.maximum is None
                else {
                    "share": expected.maximum.share,
                    "value": expected.maximum.value,
                    "attained_by": [c.value for c in expected.maximum.attained_by],
                    "contribution": expected.maximum.contribution,
                }
            )


def test_identity_carries_the_exact_source_name_the_place_and_the_coordinates_of_the_school(
    api, loaded
):  # API12
    body = fetch(api, "/api/v1/screening/results", rule="additive_u")

    by_name = {n: r for n, r in zip(names(body), body["rows"], strict=True)}
    # Names come back byte for byte: leading and trailing spaces, a tab, quotes, a newline and both Unicode forms.
    assert set(AWK) <= set(by_name) and len(set(AWK)) == 9
    quoted = by_name[AWK[7]]["school"]
    assert quoted["school_id"] == str(loaded.school_ids[AWK[7]])
    assert (quoted["province"], quoted["district"], quoted["locality"]) == ("South", "South Two", "Remote")
    assert quoted["latitude"] == pytest.approx(-6.7) and quoted["longitude"] == pytest.approx(147.35)


def test_interval_and_queued_schools_never_carry_a_point_rank_or_point_score(api, loaded):  # API2
    for rule_id in RULE_IDS:
        for row in fetch(api, "/api/v1/screening/results", rule=rule_id)["rows"]:
            has_point = row["cohort"] == "complete"
            assert (row["point_rank"]["rank"] is not None) == has_point, (rule_id, row["school"])
            assert (row["scores"]["point"] is not None) == has_point, (rule_id, row["school"])
            assert (row["rank_bounds"]["best"] is not None) == (row["cohort"] != "verification_queue")


@pytest.mark.parametrize("rule_id", URGENCY_OMITTED)
def test_urgency_never_appears_in_an_urgency_omitted_rule(api, loaded, rule_id):  # API3
    body = fetch(api, "/api/v1/screening/results", rule=rule_id)

    assert "U" not in [w["component"] for w in body["manifest"]["weights"]]
    assert body["manifest"]["uses_urgency"] is False and "U" not in body["manifest"]["maximum_components"]
    assert "U" not in [a["component"] for a in body["manifest"]["anchors"]]
    for row in body["rows"]:
        assert "U" not in row["components"]  # the key is absent, not null
        assert "U" not in [c["component"] for c in row["contributions"]]
        if row["maximum_term"]:
            assert "U" not in row["maximum_term"]["attained_by"]
    # A counter-check that the urgency-included twin does show it.
    twin = fetch(api, "/api/v1/screening/results", rule=rule_id.replace("_no_u", "_u"))
    assert any(r["components"]["U"] is not None for r in twin["rows"])


# ---------------------------------------------------------------------------------------------
# Unknown ids.
# ---------------------------------------------------------------------------------------------


def test_unknown_ids_are_404_in_the_apis_error_envelope(api, connection, loaded):  # API11
    unknown_rule = {
        "error": {
            "code": "unknown_rule",
            "message": "Unknown rule 'nope'.",
            "details": {"rule": "nope", "known": sorted(RULES)},
        }
    }
    for path, params in (
        ("/api/v1/screening/results", {"rule": "nope"}),
        ("/api/v1/screening/compare", {"a": "nope", "b": "additive_u"}),
        ("/api/v1/screening/compare", {"a": "additive_u", "b": "nope"}),
        ("/api/v1/screening/exports/top.csv", {"rule": "nope"}),
        ("/api/v1/screening/exports/top.xlsx", {"rule": "nope"}),
        ("/api/v1/screening/exports/incomplete.csv", {"rule": "nope"}),
    ):
        response = api.get(path, params=params)
        assert (response.status_code, response.json()) == (404, unknown_rule), path

    unknown_version = api.get("/api/v1/screening/results", params={"input_version": "v-missing"})
    assert unknown_version.status_code == 404
    assert unknown_version.json() == {
        "error": {
            "code": "unknown_input_version",
            "message": "Unknown input version 'v-missing'.",
            "details": {"input_version": "v-missing", "known": [loaded.input_version]},
        }
    }
    for path in ("/api/v1/screening/compare", "/api/v1/screening/exports/top.csv"):
        params = {"input_version": "v-missing", "a": "additive_u", "b": "benchmark"}
        assert api.get(path, params=params).json()["error"]["code"] == "unknown_input_version"

    stranger = uuid.uuid4()
    missing_school = api.get(f"/api/v1/screening/schools/{stranger}")
    assert missing_school.status_code == 404
    assert missing_school.json() == {
        "error": {
            "code": "school_not_found",
            "message": "This school is not in the input version.",
            "details": {"school_id": str(stranger), "input_version": loaded.input_version},
        }
    }
    # A school that exists in `schools` but is not part of the input version is just as unknown.
    outsider = connection.execute(
        "insert into schools (school_name, province, district, latitude, longitude, geom) "
        "values ('Outsider', 'P', 'D', -1, 140, st_setsrid(st_makepoint(140, -1), 4326)) returning school_id"
    ).fetchone()[0]
    assert api.get(f"/api/v1/screening/schools/{outsider}").json()["error"]["code"] == "school_not_found"

    # A rule with no stored run for a version that exists.
    connection.execute("delete from screening_runs where rule_id = 'benchmark'")
    missing_run = api.get("/api/v1/screening/results", params={"rule": "benchmark"})
    assert missing_run.status_code == 404 and missing_run.json()["error"]["code"] == "run_not_found"


def test_nothing_loaded_is_404_not_a_server_error(api):  # API11
    for path in ("/api/v1/screening/results", "/api/v1/screening/exports/top.csv"):
        response = api.get(path)
        assert response.status_code == 404 and response.json()["error"]["code"] == "no_input_versions"
    assert api.get("/api/v1/screening/input-versions").json() == {
        "default_input_version": None,
        "input_versions": [],
    }


def test_malformed_arguments_are_validation_errors_in_the_same_envelope(api, loaded):  # API11
    for path, params in (
        ("/api/v1/screening/results", {"placement": "sideways"}),
        ("/api/v1/screening/schools/not-a-uuid", {}),
        ("/api/v1/screening/exports/top.csv", {"k": 0}),
    ):
        response = api.get(path, params=params)
        assert response.status_code == 422 and response.json()["error"]["code"] == "validation_error", path


# ---------------------------------------------------------------------------------------------
# One school under every rule.
# ---------------------------------------------------------------------------------------------


def test_school_detail_shows_the_school_under_all_seven_rules_with_its_stored_inputs(
    api, loaded
):  # API1, API18
    school = AWK[7]
    detail = fetch(api, f"/api/v1/screening/schools/{loaded.school_ids[school]}")["schools"][0]

    assert detail["school"]["source_school_name"] == school
    assert detail["school"]["school_id"] == str(loaded.school_ids[school])
    assert (
        api.get(f"/api/v1/screening/schools/{loaded.school_ids[school]}").json()["input_version"]
        == loaded.input_version
    )
    source = next(r for r in loaded.records if r.school_name == school)
    assert detail["inputs"] == asdict(source)
    assert [e["rule"]["rule_id"] for e in detail["rules"]] == RULE_IDS

    for entry in detail["rules"]:
        listing = fetch(api, "/api/v1/screening/results", rule=entry["rule"]["rule_id"])
        row = next(r for r in listing["rows"] if r["school"]["source_school_name"] == school)
        assert entry["result"] == {
            k: v
            for k, v in row.items()
            if k
            not in (
                "display_order",
                "placement",
                "school",
                "persistent_candidate",
                "lowest_top20_frequency",
                "threshold_adjacent",
            )
        }
        assert entry["run"] == listing["run"]
        assert entry["point_rank_scope"] == entry["result"]["point_rank"]["scope"]
    for entry in detail["rules"]:
        assert ("U" in entry["result"]["components"]) == entry["rule"]["uses_urgency"]
    ranks = {e["rule"]["rule_id"]: e["result"]["point_rank"]["rank"] for e in detail["rules"]}
    assert ranks["additive_u"] == 1 and ranks["additive_no_u"] == 1
    assert {e["rule"]["rule_id"]: e["rule"]["uses_urgency"] for e in detail["rules"]}[
        "need_first_no_u"
    ] is False


def test_school_detail_for_an_interval_school_has_bounds_and_no_point_rank(api, loaded):  # API2, API18
    detail = fetch(api, f"/api/v1/screening/schools/{loaded.school_ids['Interval No Air']}")["schools"][0]

    by_rule = {e["rule"]["rule_id"]: e["result"] for e in detail["rules"]}
    assert by_rule["additive_u"]["cohort"] == "interval"
    assert by_rule["additive_u"]["point_rank"]["rank"] is None
    assert (by_rule["additive_u"]["rank_bounds"]["best"], by_rule["additive_u"]["rank_bounds"]["worst"]) == (
        5,
        11,
    )
    assert by_rule["benchmark"]["cohort"] == "complete"  # the benchmark reads no environmental component
    assert detail["inputs"]["aqi_p95_selected"] is None


# ---------------------------------------------------------------------------------------------
# Comparing two rules.
# ---------------------------------------------------------------------------------------------


def test_compare_ranks_the_schools_complete_under_both_rules_and_reports_the_metrics(
    api, loaded
):  # API1, API13
    body = fetch(api, "/api/v1/screening/compare", a="additive_u", b="additive_no_u")

    assert body["common_cohort_scope"] == "common complete cohort of additive_u, additive_no_u (9)"
    assert body["common_cohort_count"] == 9
    assert [(r["school"]["source_school_name"], r["rank_a"], r["rank_b"]) for r in body["ranks"]] == [
        (AWK[7], 1, 1),
        (AWK[8], 2, 2),
        (AWK[5], 3, 3),
        (AWK[6], 4, 4),
        (AWK[2], 5, 6),
        (AWK[3], 6, 8),
        (AWK[1], 7, 5),
        (AWK[4], 8, 9),
        (AWK[0], 9, 7),
    ]
    metrics = body["metrics"]
    # Squared rank differences sum to 14: 1 - 6 * 14 / (9 * 80). Four of 36 pairs reverse.
    assert metrics["n"] == 9
    assert metrics["spearman_rank"] == pytest.approx(0.8833333333333333, abs=1e-12)
    assert metrics["pairwise_discordance"] == pytest.approx(4 / 36, abs=1e-12)
    assert metrics["kendall_tau"] == pytest.approx(0.7777777777777778, abs=1e-12)
    assert (metrics["median_absolute_rank_shift"], metrics["maximum_absolute_rank_shift"]) == (1.0, 2.0)
    assert metrics["top_k"][0] == {"k": 10, "overlap": 9, "jaccard": 1.0, "size_a": 9, "size_b": 9}
    assert (body["entrants"], body["exits"]) == ([], [])

    engine = pairwise_metrics(loaded.runs["additive_u"], loaded.runs["additive_no_u"])
    assert metrics["spearman_rank"] == engine.spearman_rank and metrics["kendall_tau"] == engine.kendall_tau
    assert [t["overlap"] for t in metrics["top_k"]] == [t.overlap for t in engine.top_k]


def test_compare_gives_the_bounds_of_interval_schools_under_both_rules(api, loaded):  # API2, API13
    body = fetch(api, "/api/v1/screening/compare", a="additive_u", b="additive_no_u")

    intervals = {i["school"]["source_school_name"]: i for i in body["interval_schools"]}
    assert list(intervals) == ["Interval No Air", "Interval No Land"]
    no_land = intervals["Interval No Land"]
    assert (
        no_land["under_a"]["cohort"],
        no_land["under_a"]["rank_best"],
        no_land["under_a"]["rank_worst"],
    ) == (
        "interval",
        5,
        11,
    )
    assert (no_land["under_b"]["rank_best"], no_land["under_b"]["rank_worst"]) == (9, 11)
    assert no_land["under_b"]["rank_bounds_scope"] == "eligible (12)"
    assert no_land["under_a"]["score_lower"] == pytest.approx(0.5073138530574879, abs=1e-12)
    assert no_land["under_b"]["score_upper"] == pytest.approx(0.5603303716394608, abs=1e-12)
    # No school appears twice, and the school that is complete under one rule only is not in either list.
    assert "Éclair queue" not in intervals and "Éclair queue" not in [
        r["school"]["source_school_name"] for r in body["ranks"]
    ]


def test_compare_of_a_rule_with_itself_agrees_completely(api, loaded):  # API13
    body = fetch(api, "/api/v1/screening/compare", a="benchmark", b="benchmark")

    assert body["common_cohort_scope"] == "common complete cohort of benchmark (11)"
    assert body["metrics"]["spearman_rank"] == pytest.approx(1.0, abs=1e-12)
    assert body["metrics"]["kendall_tau"] == 1.0
    assert all(r["rank_a"] == r["rank_b"] for r in body["ranks"])


def test_compare_lists_top_twenty_entrants_and_exits_with_both_ranks_and_scores(api, connection):  # API13
    records = tuple(
        record(
            f"School {i:02d}",
            permanent_classrooms=float(i % 9),
            teacher_houses=float((i * 3) % 11),
            urgency_source_scalar=round(0.04 * ((i * 7) % 24), 2),
            walking_catchment_population=100.0 * (1 + (i * 5) % 17),
            aqi_p95_selected=20.0 + (i * 11) % 40,
            emissions_co2e_100yr_10km_tonnes=float((i * 13) % 50),
            water_flooded_vegetation_fraction_500m=round(0.02 * ((i * 3) % 20), 2),
        )
        for i in range(30)
    )
    loaded = load_synthetic(connection, records)

    body = fetch(api, "/api/v1/screening/compare", a="additive_u", b="additive_no_u")

    (exit_,), (entrant,) = body["exits"], body["entrants"]
    assert (exit_["status"], exit_["school"]["source_school_name"], exit_["rank_a"], exit_["rank_b"]) == (
        "exit",
        "School 06",
        18,
        22,
    )
    assert (
        entrant["status"],
        entrant["school"]["source_school_name"],
        entrant["rank_a"],
        entrant["rank_b"],
    ) == (
        "entrant",
        "School 00",
        21,
        14,
    )
    scores_a = {r.school_name: r.score_point for r in loaded.runs["additive_u"].results}
    scores_b = {r.school_name: r.score_point for r in loaded.runs["additive_no_u"].results}
    assert (exit_["score_a"], exit_["score_b"]) == (scores_a["School 06"], scores_b["School 06"])
    assert (entrant["score_a"], entrant["score_b"]) == (scores_a["School 00"], scores_b["School 00"])
    assert body["metrics"]["top_k"][1]["overlap"] == 19
    scope = "common complete cohort of additive_u, additive_no_u (30)"
    assert (exit_["rank_scope"], entrant["rank_scope"]) == (scope, scope)


# ---------------------------------------------------------------------------------------------
# Which run is current, and pinning one.
# ---------------------------------------------------------------------------------------------


def add_run_copy(connection, rule_id: str, package_version: str) -> str:
    """Store a second run of a rule under another engine package version, with the same results."""
    old = connection.execute("select run_id from screening_runs where rule_id = %s", (rule_id,)).fetchone()[0]
    new = connection.execute(
        "insert into screening_runs (input_version, rule_id, provenance, policy_role, score_kind, manifest, "
        "input_sha256, anchors_sha256, package_version) "
        "select input_version, rule_id, provenance, policy_role, score_kind, "
        "jsonb_set(manifest, '{package_version}', to_jsonb(%s::text)), input_sha256, anchors_sha256, %s "
        "from screening_runs where run_id = %s returning run_id",
        (package_version, package_version, old),
    ).fetchone()[0]
    columns = ", ".join(c for c in store.RESULT_COLUMNS)
    connection.execute(
        f"insert into screening_results (run_id, input_version, {columns}) "
        f"select %s, input_version, {columns} from screening_results where run_id = %s",
        (new, old),
    )
    return str(new)


def test_the_current_run_is_the_highest_package_version_and_any_run_can_be_pinned(
    api, connection, loaded
):  # API22
    # Stored in this order, the newest by time is 0.9.0, the highest as text is 0.9.0, and the highest version is 0.10.0.
    newer = add_run_copy(connection, "additive_u", "0.10.0")
    older = add_run_copy(connection, "additive_u", "0.9.0")
    path = "/api/v1/screening/results"

    current = api.get(path, params={"rule": "additive_u"}).json()
    assert current["run"]["package_version"] == "0.10.0" and current["run"]["run_id"] == newer
    assert current["manifest"]["package_version"] == "0.10.0"

    pinned = api.get(path, params={"rule": "additive_u", "package_version": "0.9.0"}).json()
    assert pinned["run"]["package_version"] == "0.9.0" and pinned["run"]["run_id"] == older
    original = api.get(path, params={"rule": "additive_u", "package_version": "0.1.0"}).json()
    assert original["run"]["package_version"] == "0.1.0" and original["run"]["run_id"] not in (newer, older)

    # Other rules have one run, which stays current; a pin to a version without a run is unknown.
    assert api.get(path, params={"rule": "benchmark"}).json()["run"]["package_version"] == "0.1.0"
    missing = api.get(path, params={"rule": "benchmark", "package_version": "0.9.0"})
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "run_not_found"
    assert missing.json()["error"]["details"]["package_version"] == "0.9.0"
    assert api.get(path, params={"package_version": "9.9.9"}).status_code == 404

    # Every read accepts the pin.
    detail = api.get(
        f"/api/v1/screening/schools/{loaded.school_ids[AWK[7]]}", params={"package_version": "0.9.0"}
    ).json()["schools"][0]
    assert [e["rule"]["rule_id"] for e in detail["rules"]] == ["additive_u"]
    assert detail["rules"][0]["run"]["run_id"] == older
    compare = api.get(
        "/api/v1/screening/compare", params={"a": "additive_u", "b": "additive_u", "package_version": "0.9.0"}
    )
    assert (
        compare.status_code == 200
        and compare.json()["run_a"]["run_id"] == older == compare.json()["run_b"]["run_id"]
    )
    assert (
        api.get(
            "/api/v1/screening/compare",
            params={"a": "additive_u", "b": "benchmark", "package_version": "0.9.0"},
        ).status_code
        == 404
    )
    for export in ("top.csv", "top.xlsx", "incomplete.csv"):
        assert (
            api.get(f"/api/v1/screening/exports/{export}", params={"package_version": "0.9.0"}).status_code
            == 200
        )
        assert (
            api.get(f"/api/v1/screening/exports/{export}", params={"package_version": "9.9.9"}).status_code
            == 404
        )

    # A request that names the input version and the package version is immutable; naming the version alone is not.
    both = api.get(path, params={"input_version": loaded.input_version, "package_version": "0.9.0"})
    assert both.headers["cache-control"] == "private, max-age=31536000, immutable"
    version_only = api.get(path, params={"input_version": loaded.input_version})
    assert version_only.headers["cache-control"] == "private, max-age=300, stale-while-revalidate=600"
    assert (
        api.get(path, params={"package_version": "0.9.0"})
        .headers["cache-control"]
        .startswith("private, max-age=60")
    )


# ---------------------------------------------------------------------------------------------
# Schools that are not linked to `schools`, and links that more than one school share.
# ---------------------------------------------------------------------------------------------


def test_every_school_has_a_key_and_a_detail_route_even_when_it_is_not_linked(api, connection):  # API21
    records = api_records()
    load(connection, records)  # no rows in `schools`: nothing is linked

    rows = fetch(api, "/api/v1/screening/results")["rows"]
    keys = [r["school"]["school_key"] for r in rows]
    assert len(set(keys)) == len(rows) == 15 and all(re.fullmatch(r"[0-9a-f]{32}", k) for k in keys)
    assert {r["school"]["school_id"] for r in rows} == {None}

    by_name = {r["school"]["source_school_name"]: r["school"]["school_key"] for r in rows}
    detail = fetch(api, f"/api/v1/screening/schools/by-key/{by_name[AWK[7]]}")
    assert detail["school"]["source_school_name"] == AWK[7] and detail["school"]["school_id"] is None
    assert detail["school"]["latitude"] is None
    assert detail["inputs"] == asdict(next(r for r in records if r.school_name == AWK[7]))
    assert [e["rule"]["rule_id"] for e in detail["rules"]] == RULE_IDS
    # The same row, listed under the same rule, is the one the detail shows.
    row = next(r for r in rows if r["school"]["school_key"] == by_name[AWK[7]])
    assert detail["rules"][0]["result"]["point_rank"] == row["point_rank"]
    # A name with surrounding spaces and a queued school are reachable too.
    leading = fetch(api, f"/api/v1/screening/schools/by-key/{by_name[AWK[0]]}")
    assert leading["school"]["source_school_name"] == AWK[0]
    queued = fetch(api, f"/api/v1/screening/schools/by-key/{by_name['Zed queue']}")
    assert queued["rules"][0]["result"]["cohort"] == "verification_queue"


def test_the_school_key_is_stable_per_version_and_differs_between_versions(api, connection):  # API21
    first = load_synthetic(connection, version="paper-v1")
    load(
        connection, tuple(reversed(first.records)), "paper-v2"
    )  # same schools in another order: another input hash

    def keys(version):
        rows = fetch(api, "/api/v1/screening/results", input_version=version)["rows"]
        return {r["school"]["source_school_name"]: r["school"]["school_key"] for r in rows}

    v1, v2 = keys("paper-v1"), keys("paper-v2")
    assert keys("paper-v1") == v1  # stable across requests
    assert v1.keys() == v2.keys() and all(v1[n] != v2[n] for n in v1)
    # A key belongs to its version.
    ok = api.get(f"/api/v1/screening/schools/by-key/{v1[AWK[7]]}", params={"input_version": "paper-v1"})
    wrong = api.get(f"/api/v1/screening/schools/by-key/{v1[AWK[7]]}", params={"input_version": "paper-v2"})
    assert ok.status_code == 200 and wrong.status_code == 404
    assert wrong.json()["error"]["code"] == "school_not_found"
    assert api.get("/api/v1/screening/schools/by-key/0123").status_code == 404


def test_the_route_on_a_school_id_returns_every_school_that_shares_the_link(api, connection):  # API21
    loaded = load_synthetic(connection)
    shared = loaded.school_ids[AWK[7]]
    for table in ("screening_inputs", "screening_results"):
        connection.execute(
            f"update {table} set school_id = %s where source_school_name = %s", (shared, AWK[8])
        )

    body = fetch(api, f"/api/v1/screening/schools/{shared}")

    assert body["school_id"] == str(shared)
    assert [d["school"]["source_school_name"] for d in body["schools"]] == [AWK[7], AWK[8]]
    assert {d["school"]["school_id"] for d in body["schools"]} == {str(shared)}
    assert len({d["school"]["school_key"] for d in body["schools"]}) == 2
    # Each of them is still reachable on its own key.
    for d in body["schools"]:
        single = fetch(api, f"/api/v1/screening/schools/by-key/{d['school']['school_key']}")
        assert single["school"] == d["school"] and single["inputs"] == d["inputs"]


def test_compare_labels_every_rank_with_its_scope_and_lists_the_schools_it_leaves_out(api, loaded):  # API26
    body = fetch(api, "/api/v1/screening/compare", a="additive_u", b="additive_no_u")

    scope = "common complete cohort of additive_u, additive_no_u (9)"
    assert body["common_cohort_scope"] == scope
    assert {r["rank_scope"] for r in body["ranks"]} == {scope}
    excluded = body["excluded_schools"]
    assert [(e["school"]["source_school_name"], e["cohort_a"], e["cohort_b"]) for e in excluded] == [
        ("Interval No Air", "interval", "interval"),
        ("Interval No Land", "interval", "interval"),
        ("Beta queue", "verification_queue", "verification_queue"),
        ("Zed queue", "verification_queue", "verification_queue"),
        ("alpha queue", "verification_queue", "verification_queue"),
        ("Éclair queue", "verification_queue", "complete"),
    ]
    assert excluded[-1]["reason"] == (
        "Held for verification under additive_u and complete under additive_no_u. "
        "Ranks compare only the schools that are complete under both rules."
    )
    assert excluded[0]["reason"].startswith(
        "Interval (an environmental input is missing) under additive_u and interval"
    )
    # Every school is either ranked or listed as left out, and none is both.
    ranked = {r["school"]["source_school_name"] for r in body["ranks"]}
    left_out = {e["school"]["source_school_name"] for e in excluded}
    assert ranked.isdisjoint(left_out) and len(ranked) + len(left_out) == 15
    assert body["common_cohort_count"] == len(ranked)


TOP_CSV = "/api/v1/screening/exports/top.csv"


def without_generation_time(path: str, body: bytes) -> bytes:
    """The top list's method record states the time of each request, so that one line may differ between two reads."""
    if path != TOP_CSV:
        return body
    generated_at = re.compile(rb'^"# generated_at: [^"\r\n]*"\r?\n', re.MULTILINE)
    assert len(generated_at.findall(body)) == 1, "the top list must state its generation time exactly once"
    return generated_at.sub(b"", body)


def test_stored_runs_with_fields_a_newer_engine_added_still_read_and_are_served_unchanged(
    api, connection, loaded
):  # API30
    school = loaded.school_ids[AWK[7]]
    urls = [
        ("/api/v1/screening/results", {"rule": "bottleneck_u"}),
        ("/api/v1/screening/results", {"rule": "need_first_no_u"}),
        (f"/api/v1/screening/schools/{school}", {}),
        ("/api/v1/screening/compare", {"a": "additive_u", "b": "bottleneck_u"}),
        (TOP_CSV, {"rule": "bottleneck_u"}),
    ]
    before = [without_generation_time(path, api.get(path, params=params).content) for path, params in urls]

    connection.execute(
        "update screening_runs set manifest = jsonb_set(jsonb_set(jsonb_set(manifest || '{\"future_field\": 1}', "
        "'{weights,0,future}', 'true'), '{anchors,0,future}', 'true'), '{anchors,0,future2}', '[1]')"
    )
    connection.execute(
        "update screening_results set components = components || '{\"X\": 0.5}', "
        "need_parts = need_parts || '{\"future_part\": 1}', area_parts = area_parts || '{\"future_part\": 1}', "
        "need_part_contributions = need_part_contributions || '{\"future_part\": 1}', "
        "maximum_term = maximum_term || '{\"future\": 1}', "
        "contributions = coalesce((select jsonb_agg(c || '{\"future\": 1}') "
        "from jsonb_array_elements(contributions) c), contributions)"
    )

    after = [api.get(path, params=params) for path, params in urls]
    assert [r.status_code for r in after] == [200] * len(urls)
    # The new fields are ignored, not passed on and not fatal: the served bytes are the same.
    # The one exception is the top list's generation time, which the helper asserts is present in both copies.
    assert [
        without_generation_time(path, r.content) for (path, _), r in zip(urls, after, strict=True)
    ] == before
