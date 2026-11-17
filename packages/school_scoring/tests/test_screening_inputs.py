"""Boundary tests: the input contract, parsing, and the source-table join."""

from __future__ import annotations

import dataclasses

import numpy as np
import pandas as pd
import pytest
from school_scoring.screening import (
    INPUT_CONTRACT,
    InputContractError,
    SchoolRecord,
    Table,
    assemble_frame,
    parse_records,
    records_sha256,
)
from screening_factories import BASELINE, source_tables


def frame_of(*rows: dict) -> pd.DataFrame:
    return pd.DataFrame([{**dataclasses.asdict(BASELINE), **row} for row in rows])


def test_parse_keeps_input_order_and_identity_strings_byte_for_byte():  # FM2
    records = parse_records(frame_of({"school_name": "Zeta School "}, {"school_name": "Alpha School"}))
    assert [r.school_name for r in records] == ["Zeta School ", "Alpha School"]


def test_duplicate_school_names_are_rejected():  # FM2
    with pytest.raises(InputContractError, match="unique"):
        parse_records(frame_of({"school_name": "Same"}, {"school_name": "Same"}))


def test_missing_column_is_named_in_the_error():  # FM2
    with pytest.raises(InputContractError, match="aqi_p95_selected"):
        parse_records(frame_of({}).drop(columns=["aqi_p95_selected"]))


def test_text_in_a_numeric_column_is_rejected_not_coerced_to_missing():  # FM3
    with pytest.raises(InputContractError, match="teachers"):
        parse_records(frame_of({"teachers": "twelve"}))


def test_missing_cells_become_none_and_zero_stays_zero():  # FM3
    (record,) = parse_records(frame_of({"teachers": np.nan, "libraries": 0, "power_source": None}))
    assert (record.teachers, record.libraries, record.power_source) == (None, 0.0, None)


def test_progression_must_be_the_corrected_rate():  # FM12
    with pytest.raises(InputContractError, match="progression_g10_corrected_pct"):
        parse_records(frame_of({"progression_g10_corrected_pct": 104.0}))


def test_contract_names_equal_record_fields_and_source_columns_are_unique_per_table():  # FM12
    assert [f.name for f in INPUT_CONTRACT] == [f.name for f in dataclasses.fields(SchoolRecord)]
    sources = [(f.source_table, f.source_column) for f in INPUT_CONTRACT]
    assert len(set(sources)) == len(sources)


def test_urgency_scalar_and_reach_input_come_from_different_source_columns():  # FM8, FM12
    by_name = {f.name: f for f in INPUT_CONTRACT}
    assert by_name["urgency_source_scalar"].source_column == "R"
    assert by_name["walking_catchment_population"].source_column == "pop_with_access_walking"


def test_assemble_frame_round_trips_a_canonical_frame():  # FM2
    frame = frame_of({"school_name": "A"}, {"school_name": "B"})
    assert assemble_frame(source_tables(frame)).equals(frame)


def test_assemble_frame_rejects_a_table_with_different_row_order():  # FM2
    tables = source_tables(frame_of({"school_name": "A"}, {"school_name": "B"}))
    tables[Table.ENVIRONMENT_FEATURES] = tables[Table.ENVIRONMENT_FEATURES].iloc[::-1].reset_index(drop=True)
    with pytest.raises(InputContractError, match="different order"):
        assemble_frame(tables)


def test_records_hash_changes_with_any_input_value_and_not_with_object_identity():  # FM9
    a = parse_records(frame_of({}))
    assert records_sha256(a) == records_sha256(parse_records(frame_of({})))
    assert records_sha256(a) != records_sha256(parse_records(frame_of({"aqi_p95_selected": 31.0})))


def test_records_hash_depends_on_record_order():  # FM9
    forward = parse_records(frame_of({"school_name": "A"}, {"school_name": "B"}))
    assert records_sha256(forward) != records_sha256(tuple(reversed(forward)))


@pytest.mark.parametrize("name", ["", " ", "\t\n", None])
def test_blank_school_names_are_rejected(name):  # FM2
    with pytest.raises(InputContractError, match="school_name"):
        parse_records(frame_of({"school_name": name}))


def test_school_names_with_padding_are_kept_as_given():  # FM2
    (record,) = parse_records(frame_of({"school_name": "  Padded name "}))
    assert record.school_name == "  Padded name "
