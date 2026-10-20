"""CSV and XLSX exports of the screening lists: method record, round trip, rule identity, range rows and the queue."""

from __future__ import annotations

import datetime as dt
import io
import re
import zipfile

import openpyxl
import pytest
from app.screening_export import GATE_FAILURE_DETAILS
from school_scoring.screening import PACKAGE_VERSION, RULES, GateFailure
from school_scoring.screening.rules import TIE_RULE
from screening_api_helpers import load_synthetic, parse_csv_export
from screening_db_factories import AWKWARD_NAMES as AWK
from screening_db_factories import record

RULE_IDS = list(RULES)
CSV = "/api/v1/screening/exports/top.csv"
XLSX = "/api/v1/screening/exports/top.xlsx"
INCOMPLETE = "/api/v1/screening/exports/incomplete.csv"

TOP_RECORD_KEYS = [
    "export",
    "rule_id",
    "rule_label",
    "rule_provenance",
    "rule_provenance_note",
    "policy_role",
    "score_kind",
    "formula",
    "weights",
    "uses_urgency",
    "input_version",
    "input_sha256",
    "anchors_sha256",
    "normalization_anchors",
    "run_id",
    "package_version",
    "tie_rule",
    "sort_columns",
    "sort_keys",
    "point_rank_scope",
    "rank_bounds_scope",
    "cohort_counts",
    "filters",
    "filters_effect",
    "display_name",
    "k",
    "k_meaning",
    "include_ranges",
    "range_schools_reaching_k",
    "range_schools_included",
    "range_school_convention",
    "rows_listed",
    "how_to_rebuild",
    "generated_at",
    "caveat",
]


@pytest.fixture
def loaded(api, connection):
    return load_synthetic(connection)


def export(api, path: str, **params) -> bytes:
    response = api.get(path, params=params)
    assert response.status_code == 200, response.text
    return response.content


def top(api, **params):
    return parse_csv_export(export(api, CSV, **params))


def point_rows(rows):
    return [r for r in rows if r["row_kind"] == "point"]


# ---------------------------------------------------------------------------------------------
# Rebuilding the list.
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize("rule_id", RULE_IDS)
def test_the_csv_rebuilds_the_list_from_its_declared_keys(api, loaded, rule_id):  # API7, API12
    method, rows = top(api, rule=rule_id, k=50)

    listed = point_rows(rows)
    sort_columns = method["sort_columns"].split(",")
    assert sort_columns == (
        ["sort_key_primary", "score_point"] if rule_id.startswith("need_first") else ["score_point"]
    )
    # Sort the declared keys descending, then the name ascending, ignoring the order of the file.
    rebuilt = sorted(listed, key=lambda r: (*[-float(r[c]) for c in sort_columns], r["source_school_name"]))
    assert [int(r["rank_point"]) for r in rebuilt] == list(range(1, len(listed) + 1))
    assert rebuilt == listed

    engine = loaded.runs[rule_id]
    assert len(listed) == engine.manifest.point_rank_count
    by_name = {r.school_name: r for r in engine.results}
    assert [(r["source_school_name"], int(r["rank_point"])) for r in listed] == [
        (r.school_name, r.rank_point)
        for r in sorted((r for r in engine.results if r.rank_point), key=lambda r: r.rank_point)
    ]
    for row in listed:
        assert float(row["score_point"]) == by_name[row["source_school_name"]].score_point  # full precision


def test_k_cuts_the_list_at_a_point_rank_and_a_name_tie_is_broken_by_code_point(api, connection):  # API7
    # Three schools with identical components tie on score and are ordered by name in code point order.
    tied = tuple(record(name) for name in ("beta", "Zulu", "alpha"))
    load_synthetic(connection, tied)

    method, rows = top(api, rule="additive_u", k=2)

    assert [(r["source_school_name"], r["rank_point"]) for r in rows] == [("Zulu", "1"), ("alpha", "2")]
    assert method["k"] == "2" and method["rows_listed"] == "point=2, range=0"


def test_names_are_exported_byte_for_byte(api, loaded):  # API12
    _, rows = top(api, rule="additive_u", k=50)

    assert {r["source_school_name"] for r in rows if r["row_kind"] == "point"} == set(AWK)
    assert (
        len({r["source_school_name"] for r in rows if r["row_kind"] == "point"}) == 9
    )  # both accent forms survive


def test_values_are_written_in_full_precision(api, loaded):  # API12
    for rule_id in ("additive_u", "bottleneck_u", "need_first_no_u"):
        _, rows = top(api, rule=rule_id, k=50)
        engine = {r.school_name: r for r in loaded.runs[rule_id].results}
        for row in point_rows(rows):
            result = engine[row["source_school_name"]]
            for component in "NARQEL":
                assert float(row[component]) == getattr(result.components, component)
            for c in result.contributions:
                assert float(row[f"contribution_{c.component.value}_lower"]) == c.lower
                assert float(row[f"contribution_{c.component.value}_upper"]) == c.upper
            if result.maximum:
                assert float(row["maximum_term"]) == result.maximum.contribution
                assert row["maximum_attained_by"] == ";".join(c.value for c in result.maximum.attained_by)
            assert (
                float(row["score_lower"]) == result.score_lower
                and float(row["score_upper"]) == result.score_upper
            )


def test_unknown_values_are_empty_cells_never_zero(api, loaded):  # API12
    _, rows = top(api, rule="additive_u", k=50, include_ranges=True)

    air = next(r for r in rows if r["source_school_name"] == "Interval No Air")
    assert air["Q"] == "" and air["contribution_Q_lower"] != air["contribution_Q_upper"]
    assert air["missing_environmental"] == "Q"
    assert (
        float(air["contribution_Q_lower"]) == 0.0 and float(air["contribution_Q_upper"]) == 0.05
    )  # bounds, not a guess


# ---------------------------------------------------------------------------------------------
# The method record.
# ---------------------------------------------------------------------------------------------


def test_the_method_record_names_everything_needed_to_read_the_file(api, connection, loaded):  # API17
    before = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    method, _ = top(api, rule="additive_no_u")
    after = dt.datetime.now(dt.timezone.utc)

    assert list(method) == TOP_RECORD_KEYS
    rule = RULES["additive_no_u"]
    manifest = loaded.runs["additive_no_u"].manifest
    stored = connection.execute(
        "select run_id, input_sha256, anchors_sha256, package_version from screening_runs where rule_id = 'additive_no_u'"
    ).fetchone()
    assert method["export"] == "top schools"
    assert (method["rule_id"], method["rule_label"]) == ("additive_no_u", "Additive, urgency omitted")
    assert method["rule_provenance"] == "proposed_follow_up_pending_author_review"
    assert (
        "pending author review" in method["rule_provenance_note"]
        and "not a result of the circulated paper" in method["rule_provenance_note"]
    )
    assert (method["policy_role"], method["score_kind"]) == ("primary", "additive score")
    assert method["formula"] == rule.formula == "S0 = (S - 0.05U) / 0.95 = (12N + 3A + R + Q + E + L) / 19"
    assert method["weights"].startswith("N 12/19 (0.631578947368421") and "U " not in method["weights"]
    assert method["uses_urgency"] == "no"
    assert method["input_version"] == loaded.input_version
    assert (
        method["run_id"],
        method["input_sha256"],
        method["anchors_sha256"],
        method["package_version"],
    ) == (
        str(stored[0]),
        stored[1],
        stored[2],
        stored[3],
    )
    assert (
        method["anchors_sha256"] == manifest.anchors_sha256 and method["package_version"] == PACKAGE_VERSION
    )
    assert re.fullmatch(r"[0-9a-f]{64}", method["input_sha256"])
    assert (
        "aqi (Q)" in method["normalization_anchors"]
        and "land (L): natural 0..1 fraction" in method["normalization_anchors"]
    )
    assert "urgency" not in method["normalization_anchors"]
    assert method["tie_rule"] == TIE_RULE
    assert method["point_rank_scope"] == "complete under this rule (10)"
    assert method["rank_bounds_scope"] == "eligible (12)"
    assert method["cohort_counts"] == "records=15, complete=10, interval=2, verification_queue=3"
    assert (method["filters"], method["k"], method["include_ranges"]) == ("none", "20", "yes")
    assert (method["range_schools_reaching_k"], method["range_schools_included"]) == ("2", "yes")
    assert "Range schools are interval schools" in method["range_school_convention"]
    assert "lower-score position by default" in method["range_school_convention"]
    generated = dt.datetime.strptime(method["generated_at"], "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=dt.timezone.utc
    )
    assert before <= generated <= after
    assert "does not establish condition accuracy, site safety, intervention benefit" in method["caveat"]
    assert "A zero weight does not mean that no hazard was observed." in method["caveat"]


def test_the_caveat_for_an_urgency_rule_says_urgency_is_unresolved_not_omitted(api, loaded):  # API17
    method, _ = top(api, rule="additive_u")

    assert (
        method["rule_provenance"] == "circulated_paper"
        and method["rule_provenance_note"] == "A rule of the circulated paper."
    )
    assert method["uses_urgency"] == "yes"
    assert "Urgency enters this rule" in method["caveat"] and "inadmissible" not in method["caveat"]
    assert (
        method["point_rank_scope"] == "complete under this rule (9)"
        and method["rank_bounds_scope"] == "eligible (11)"
    )


@pytest.mark.parametrize("rule_id", RULE_IDS)
def test_every_export_names_the_rule_it_was_asked_for(api, loaded, rule_id):  # API8, API3
    rule = RULES[rule_id]
    response = api.get(CSV, params={"rule": rule_id, "k": 5})
    method, rows = parse_csv_export(response.content)

    assert method["rule_id"] == rule_id and method["rule_label"] == rule.label
    assert method["formula"] == rule.formula and method["policy_role"] == rule.policy_role.value
    assert (
        response.headers["content-disposition"]
        == f'attachment; filename="rise_png_screening_top5_{rule_id}.csv"'
    )
    assert response.headers["x-rise-png-decision-use"] == "research-prototype-only"
    assert {
        (r["rule_id"], r["rule_label"], r["provenance"], r["policy_role"], r["score_kind"]) for r in rows
    } == {(rule_id, rule.label, rule.provenance.value, rule.policy_role.value, rule.score_kind.value)}
    columns = rows[0].keys()
    assert ("contribution_U_lower" in columns) == rule.uses_urgency
    if not rule.uses_urgency:
        assert {r["U"] for r in rows} == {""}
        assert "urgency" not in method["weights"].lower() and "U " not in method["weights"]

    workbook = openpyxl.load_workbook(io.BytesIO(api.get(XLSX, params={"rule": rule_id, "k": 5}).content))
    assert dict(workbook["Method record"].iter_rows(min_row=2, values_only=True))["rule_id"] == rule_id


# ---------------------------------------------------------------------------------------------
# Range schools.
# ---------------------------------------------------------------------------------------------


def test_range_schools_have_their_own_flagged_rows_with_bounds_and_no_point_rank(api, loaded):  # API2, API15
    method, rows = top(api, rule="additive_u", k=20, include_ranges=True)

    assert [r["row_kind"] for r in rows] == ["point"] * 9 + ["range"] * 2
    air, land = rows[9], rows[10]
    assert [r["source_school_name"] for r in (air, land)] == ["Interval No Air", "Interval No Land"]
    for r in (air, land):
        assert r["rank_point"] == "" and r["score_point"] == ""
        assert (r["rank_best"], r["rank_worst"]) == ("5", "11")
        assert (
            r["rank_bounds_scope"] == "eligible (11)"
            and r["rank_point_scope"] == "complete under this rule (9)"
        )
        assert float(r["score_lower"]) < float(r["score_upper"])
    assert (air["missing_environmental"], land["missing_environmental"]) == ("Q", "L")
    assert method["include_ranges"] == "yes" and method["rows_listed"] == "point=9, range=2"
    assert all(r["rank_point"] != "" for r in point_rows(rows))


def test_range_rows_are_left_out_unless_asked_for_and_unless_they_could_reach_the_cut(api, loaded):  # API15
    method, without = top(api, rule="additive_u", k=20, include_ranges=False)
    assert [r["row_kind"] for r in without] == ["point"] * 9
    # The record still says that two range schools reach the cut and that they are left out.
    assert (method["range_schools_reaching_k"], method["range_schools_included"]) == ("2", "no")
    assert method["rows_listed"] == "point=9, range=0"

    # Both interval schools have 5 as their best possible rank.
    _, below_cut = top(api, rule="additive_u", k=4, include_ranges=True)
    assert [r["row_kind"] for r in below_cut] == ["point"] * 4
    method, at_cut = top(api, rule="additive_u", k=5, include_ranges=True)
    assert [r["row_kind"] for r in at_cut] == ["point"] * 5 + ["range"] * 2
    assert method["rows_listed"] == "point=5, range=2"


def test_range_schools_are_included_by_default_and_the_record_counts_those_reaching_k_after_filters(
    api, loaded
):  # API20
    method, rows = top(api, rule="additive_u", k=20)
    assert [r["row_kind"] for r in rows].count("range") == 2
    assert (
        method["include_ranges"],
        method["range_schools_reaching_k"],
        method["range_schools_included"],
    ) == (
        "yes",
        "2",
        "yes",
    )

    # A filter shrinks the count of range schools that reach k, whether or not they are listed.
    for flag, listed in ((True, 1), (False, 0)):
        method, rows = top(api, rule="additive_u", k=20, province="North", include_ranges=flag)
        assert method["range_schools_reaching_k"] == "1"
        assert method["rows_listed"] == f"point=5, range={listed}"
        assert method["range_schools_included"] == ("yes" if flag else "no")

    method, rows = top(api, rule="additive_u", k=4)
    assert (method["range_schools_reaching_k"], method["rows_listed"]) == ("0", "point=4, range=0")


def test_a_complete_school_is_never_listed_as_a_range_row_and_a_rule_without_environment_has_none(
    api, loaded
):  # API2
    _, rows = top(api, rule="benchmark", k=50, include_ranges=True)

    assert {r["row_kind"] for r in rows} == {"point"}
    assert (
        len(rows) == 11
    )  # the benchmark reads no environmental component: the interval schools are complete


# ---------------------------------------------------------------------------------------------
# Filters.
# ---------------------------------------------------------------------------------------------


def test_filters_in_an_export_hide_rows_without_renumbering_ranks(api, loaded):  # API4
    method, rows = top(api, rule="additive_u", k=50, province="North", include_ranges=True)

    assert [(r["source_school_name"], r["rank_point"]) for r in point_rows(rows)] == [
        (AWK[2], "5"),
        (AWK[3], "6"),
        (AWK[1], "7"),
        (AWK[4], "8"),
        (AWK[0], "9"),
    ]
    assert {r["rank_point_scope"] for r in rows} == {
        "complete under this rule (9)"
    }  # the scope is the full run's
    assert [r["source_school_name"] for r in rows if r["row_kind"] == "range"] == ["Interval No Air"]
    assert method["filters"] == "province=North"
    assert "Filters only hide rows" in method["filters_effect"]

    only_district = top(api, rule="additive_u", k=50, province="North", district="North Two")[1]
    assert [(r["source_school_name"], r["rank_point"]) for r in only_district] == [
        (AWK[3], "6"),
        (AWK[4], "8"),
    ]


# ---------------------------------------------------------------------------------------------
# The spreadsheet.
# ---------------------------------------------------------------------------------------------


def test_the_xlsx_holds_a_method_record_sheet_and_the_same_table_as_the_csv(
    api, loaded
):  # API7, API12, API17
    params = {"rule": "bottleneck_no_u", "k": 50, "include_ranges": True}
    csv_method, csv_rows = top(api, **params)
    workbook = openpyxl.load_workbook(io.BytesIO(export(api, XLSX, **params)))

    assert workbook.sheetnames == ["Method record", "Top schools"]
    sheet_method = dict(list(workbook["Method record"].iter_rows(min_row=2, values_only=True)))
    assert next(workbook["Method record"].iter_rows(max_row=1, values_only=True)) == ("key", "value")
    assert list(sheet_method) == list(csv_method)
    assert {k: v for k, v in sheet_method.items() if k != "generated_at"} == {
        k: v for k, v in csv_method.items() if k != "generated_at"
    }

    table = list(workbook["Top schools"].iter_rows(values_only=True))
    header, body = table[0], table[1:]
    assert list(header) == list(csv_rows[0])
    assert len(body) == len(csv_rows) == 12  # 10 complete under the rule and 2 interval schools
    for csv_row, cells in zip(csv_rows, body, strict=True):
        for column, cell in zip(header, cells, strict=True):
            text = csv_row[column]
            if text == "":
                assert cell is None, column
            elif isinstance(cell, (int, float)):
                assert float(text) == cell, column  # numbers keep their full precision
            else:
                assert cell == text, column


def test_a_school_name_that_looks_like_a_formula_stays_text_in_the_xlsx(api, connection):  # API19
    risky = ("=1+1 School", "+Plus School", "@At School", "-Minus School")
    load_synthetic(connection, tuple(record(name) for name in risky))

    content = export(api, XLSX, rule="additive_u", k=10)

    sheet = openpyxl.load_workbook(io.BytesIO(content))["Top schools"]
    header = [c.value for c in sheet[1]]
    column = header.index("source_school_name")
    cells = [row[column] for row in sheet.iter_rows(min_row=2)]
    assert sorted(c.value for c in cells) == sorted(risky)
    assert {c.data_type for c in cells} == {"s"}
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        data_sheets = [archive.read(n).decode() for n in archive.namelist() if n.startswith("xl/worksheets/")]
    assert all("<f>" not in xml for xml in data_sheets)


# ---------------------------------------------------------------------------------------------
# The queue.
# ---------------------------------------------------------------------------------------------


def test_the_incomplete_export_lists_exactly_the_queue_with_missing_details(api, loaded):  # API16
    method, rows = parse_csv_export(export(api, INCOMPLETE, rule="additive_u"))

    assert [r["source_school_name"] for r in rows] == [
        "Éclair queue",
        "Zed queue",
        "alpha queue",
        "Beta queue",
    ]
    assert {r["row_kind"] for r in rows} == {"queue"} and {r["cohort"] for r in rows} == {
        "verification_queue"
    }
    by_name = {r["source_school_name"]: r for r in rows}
    assert by_name["Zed queue"]["gate_failures"] == "missing_stock_field"
    assert by_name["Zed queue"]["missing_input_fields"] == "teachers"
    assert by_name["Zed queue"]["gate_failure_details"] == (
        "A stock count, facility count, power source or water source is missing."
    )
    assert by_name["Éclair queue"]["gate_failures"] == "urgency_unknown"
    assert by_name["Éclair queue"]["missing_input_fields"] == "urgency_source_scalar"
    assert (
        by_name["Éclair queue"]["N"] != "" and by_name["Éclair queue"]["U"] == ""
    )  # what is known stays visible
    # An unrecognized value is a gate failure, but the input is not missing.
    assert by_name["alpha queue"]["gate_failures"] == "unrecognized_locality"
    assert by_name["alpha queue"]["missing_input_fields"] == ""
    assert {"teachers", "urgency_source_scalar", "aqi_p95_selected"} <= set(
        by_name["Beta queue"]["missing_input_fields"].split(";")
    )
    assert method["export"] == "schools held for verification" and method["rows_listed"] == "queue=4"
    assert method["rule_id"] == "additive_u" and method["input_sha256"]
    assert all(r["gate_failure_details"] for r in rows)


def test_the_queue_depends_on_the_rule_and_on_the_filters(api, loaded):  # API16, API4
    _, no_urgency = parse_csv_export(export(api, INCOMPLETE, rule="additive_no_u"))
    assert [r["source_school_name"] for r in no_urgency] == ["Zed queue", "alpha queue", "Beta queue"]

    method, north = parse_csv_export(export(api, INCOMPLETE, rule="additive_u", province="North"))
    assert [r["source_school_name"] for r in north] == ["Éclair queue", "Zed queue", "alpha queue"]
    assert method["filters"] == "province=North" and method["rows_listed"] == "queue=3"


def test_every_gate_failure_has_a_plain_description():  # API16
    assert set(GATE_FAILURE_DETAILS) == set(GateFailure)


def test_control_characters_in_stored_text_do_not_break_the_xlsx(api, connection):  # API23
    names = ("Bell\x07 School", "Esc\x1b School", "Vertical\x0bTab School")
    records = tuple(record(name, province="Prov\x01ince") for name in names)
    load_synthetic(connection, records)

    workbook = export(api, XLSX, rule="additive_u", k=10)
    _, csv_rows = top(api, rule="additive_u", k=10)

    sheet = openpyxl.load_workbook(io.BytesIO(workbook))["Top schools"]
    header = [c.value for c in sheet[1]]
    stored = {row[header.index("source_school_name")] for row in sheet.iter_rows(min_row=2, values_only=True)}
    # XML cannot hold these characters, so the workbook carries Excel's escape for each.
    assert stored == {"Bell_x0007_ School", "Esc_x001B_ School", "Vertical_x000B_Tab School"}
    provinces = {row[header.index("province")] for row in sheet.iter_rows(min_row=2, values_only=True)}
    assert provinces == {"Prov_x0001_ince"}
    # The CSV keeps the characters as they are stored.
    assert {r["source_school_name"] for r in csv_rows} == set(names)


def test_display_name_guards_formula_like_names_while_the_source_name_stays_exact(api, connection):  # API24
    risky = ("=1+1 School", "+Plus School", "-Minus School", "@At School", "\tTab School", "\rReturn School")
    safe = ("Plain School", "'Quoted School", "Mid=dle School")
    load_synthetic(connection, tuple(record(name) for name in (*risky, *safe)))

    method, rows = top(api, rule="additive_u", k=50)
    incomplete_method, incomplete = parse_csv_export(export(api, INCOMPLETE, rule="additive_u"))

    shown = {r["source_school_name"]: r["display_name"] for r in rows}
    assert set(shown) == {*risky, *safe}  # the exact name is never changed
    assert {name: shown[name] for name in risky} == {name: "'" + name for name in risky}
    assert {name: shown[name] for name in safe} == {name: name for name in safe}
    assert list(rows[0]).index("display_name") == list(rows[0]).index("source_school_name") + 1
    assert "display_name" in incomplete_method and "apostrophe" in method["display_name"]
    assert "display_name" in (incomplete[0] if incomplete else rows[0])

    sheet = openpyxl.load_workbook(io.BytesIO(export(api, XLSX, rule="additive_u", k=50)))["Top schools"]
    header = [c.value for c in sheet[1]]
    in_xlsx = {
        row[header.index("source_school_name")]: row[header.index("display_name")]
        for row in sheet.iter_rows(min_row=2, values_only=True)
    }
    assert {k.replace("_x000D_", "\r"): v.replace("_x000D_", "\r") for k, v in in_xlsx.items()} == shown
