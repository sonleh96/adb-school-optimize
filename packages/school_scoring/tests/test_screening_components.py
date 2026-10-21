"""Component preparation: evidence gate, parts, coding, and normalization anchors."""

from __future__ import annotations

import pytest
from school_scoring.screening import Component, GateFailure, prepare
from school_scoring.screening.components import POWER_DEFICIT, WATER_DEFICIT
from screening_factories import expm1_ladder, ladder, record


def prepare_with_target(**overrides):
    """A 21-record ladder so every anchor resolves, with the last record carrying the overrides."""
    others = ladder("secondary_students_per_1000", count=20)
    return prepare((*others, record("Target", **overrides))).records[-1]


N, A, R, Q, E, L = Component.N, Component.A, Component.R, Component.Q, Component.E, Component.L


# FM1: each gate reason, and which components stay unknown.
@pytest.mark.parametrize(
    ("overrides", "failures", "missing"),
    [
        ({}, (), ()),
        ({"teachers": None}, (GateFailure.MISSING_STOCK_FIELD,), (N,)),
        ({"water_source": None}, (GateFailure.MISSING_STOCK_FIELD,), (N,)),
        ({"libraries": -1.0}, (GateFailure.NEGATIVE_STOCK_VALUE,), ()),
        ({"total_classrooms": 0.0}, (GateFailure.NONPOSITIVE_DENOMINATOR,), (N,)),
        ({"teachers": 0.0}, (GateFailure.NONPOSITIVE_DENOMINATOR,), (N,)),
        ({"power_source": "Candle"}, (GateFailure.UNRECOGNIZED_SERVICE_CODING,), (N,)),
        ({"locality": "Sea"}, (GateFailure.UNRECOGNIZED_LOCALITY,), (N,)),
        ({"locality": None}, (GateFailure.UNRECOGNIZED_LOCALITY,), (N,)),
        ({"progression_g12_corrected_pct": None}, (GateFailure.UNRESOLVED_AREA_CONTEXT,), (A,)),
        ({"walking_catchment_population": -5.0}, (GateFailure.UNRESOLVED_REACH,), (R,)),
        ({"aqi_p95_selected": None}, (), (Q,)),
        ({"emissions_co2e_100yr_10km_tonnes": None}, (), (E,)),
        ({"water_flooded_vegetation_fraction_500m": 1.5}, (), (L,)),
    ],
)
def test_gate_failures_and_missing_components(overrides, failures, missing):
    target = prepare_with_target(**overrides)
    assert (target.gate_failures, target.missing_components) == (failures, missing)


def test_a_school_failing_two_conditions_reports_both_reasons():  # FM1
    target = prepare_with_target(libraries=-1.0, teachers=0.0)
    assert target.gate_failures == (GateFailure.NEGATIVE_STOCK_VALUE, GateFailure.NONPOSITIVE_DENOMINATOR)


def test_need_parts_and_equal_mean_of_five():
    parts = prepare_with_target().need_parts
    assert (
        parts.permanent_classroom_deficit,
        parts.teacher_housing_deficit,
        parts.facility_presence_deficit,
    ) == (
        0.25,
        0.5,
        0.5,
    )
    assert (parts.service_deficit, parts.locality_disadvantage) == (0.6, 0.7)
    assert pytest.approx((0.25 + 0.5 + 0.5 + 0.6 + 0.7) / 5, abs=1e-15) == prepare_with_target().components.N


def test_share_deficits_are_bounded_to_zero_when_stock_exceeds_the_denominator():
    parts = prepare_with_target(permanent_classrooms=9.0, teacher_houses=15.0).need_parts
    assert (parts.permanent_classroom_deficit, parts.teacher_housing_deficit) == (0.0, 0.0)


def test_unknown_stock_stays_unknown_and_makes_n_unknown():  # FM3
    target = prepare_with_target(teacher_houses=None, libraries=None)
    assert target.need_parts.teacher_housing_deficit is None
    assert target.need_parts.facility_presence_deficit is None
    assert target.components.N is None


@pytest.mark.parametrize(
    ("text", "deficit"),
    [
        ("Generator ", 0.7),
        ("solar panel", 0.4),
        ("Hydro", 0.3),
        ("PNG Power", 0.2),
        ("Grid", 0.2),
        ("Mains", 0.2),
        ("Solar and generator", 0.7),
        ("Diesel", None),
        (None, None),
    ],
)
def test_power_coding(text, deficit):  # FM11
    assert POWER_DEFICIT.code(text) == deficit


@pytest.mark.parametrize(
    ("text", "deficit"),
    [
        ("River", 1.0),
        ("Bringing water", 1.0),
        ("Tank Water", 0.5),
        ("Rain tank", 0.5),
        ("Borehole", 0.5),
        ("Piped", 0.2),
        ("Town supply", 0.2),
        ("Spring", None),
        (None, None),
    ],
)
def test_water_coding(text, deficit):  # FM11
    assert WATER_DEFICIT.code(text) == deficit


@pytest.mark.parametrize(
    ("text", "disadvantage"),
    [
        ("Highly Accessible", 0.0),
        ("accessible", 0.2),
        ("Moderately accessible", 0.45),
        ("Remote", 0.7),
        (" Very Remote ", 0.9),
        ("Extremely remote", 1.0),
    ],
)
def test_locality_coding_ignores_case_and_padding(text, disadvantage):  # FM11
    assert prepare_with_target(locality=text).need_parts.locality_disadvantage == disadvantage


def values_at(prepared, getter, indices=(0, 10, 20)):
    return [getter(prepared.records[i]) for i in indices]


def test_urgency_scales_upward_between_the_fifth_and_ninety_fifth_percentile():  # FM5
    prepared_set = prepare(ladder("urgency_source_scalar"))
    assert values_at(prepared_set, lambda p: p.components.U) == [0.0, 0.5, 1.0]
    assert values_at(prepared_set, lambda p: p.components.U, (1, 19)) == [0.0, 1.0]


def test_aqi_and_emissions_and_reach_scale_upward_and_the_log_fields_scale_on_log1p():  # FM5
    aqi = prepare(ladder("aqi_p95_selected"))
    emissions = prepare(expm1_ladder("emissions_co2e_100yr_10km_tonnes"))
    reach = prepare(expm1_ladder("walking_catchment_population"))
    assert values_at(aqi, lambda p: p.components.Q) == [0.0, 0.5, 1.0]
    assert values_at(emissions, lambda p: p.components.E) == pytest.approx([0.0, 0.5, 1.0], abs=1e-12)
    assert values_at(reach, lambda p: p.components.R) == pytest.approx([0.0, 0.5, 1.0], abs=1e-12)


def test_secondary_participation_and_activity_deficits_fall_as_the_measure_rises():  # FM5
    secondary = prepare(ladder("secondary_students_per_1000"))
    activity = prepare(expm1_ladder("district_luminosity_area_integral"))
    assert values_at(secondary, lambda p: p.area_parts.secondary_participation_deficit) == [1.0, 0.5, 0.0]
    assert values_at(activity, lambda p: p.area_parts.activity_scale_deficit) == pytest.approx(
        [1.0, 0.5, 0.0], abs=1e-12
    )


def test_conflict_exposure_scales_upward():  # FM5
    exposure = prepare(expm1_ladder("conflict_population_exposure"))
    assert values_at(exposure, lambda p: p.area_parts.conflict_exposure) == pytest.approx(
        [0.0, 0.5, 1.0], abs=1e-12
    )


def test_progression_and_female_deficits():  # FM5
    parts = prepare_with_target(
        progression_g10_corrected_pct=79.3,
        progression_g12_corrected_pct=7.5,
        female_students_g7_12=200.0,
        total_enrollment_g7_12=500.0,
    ).area_parts
    assert parts.progression_g10_deficit == pytest.approx(0.207, abs=1e-12)
    assert parts.progression_g12_deficit == pytest.approx(0.925, abs=1e-12)
    assert parts.female_disadvantage == pytest.approx(0.2, abs=1e-12)


def test_area_context_is_the_declared_weighted_mean_of_six_parts():
    target = prepare_with_target(
        progression_g10_corrected_pct=80.0,
        progression_g12_corrected_pct=20.0,
        conflict_population_exposure=0.0,
    )
    p = target.area_parts
    expected = (
        0.25 * 0.2
        + 0.15 * 0.8
        + 0.25 * p.secondary_participation_deficit
        + 0.15 * p.activity_scale_deficit
        + 0.10 * p.conflict_exposure
        + 0.10 * p.female_disadvantage
    )
    assert pytest.approx(expected, abs=1e-15) == target.components.A


def test_land_cover_is_a_natural_fraction_and_is_not_rescaled():
    assert prepare_with_target(water_flooded_vegetation_fraction_500m=0.37).components.L == 0.37


def test_anchors_are_fit_on_every_record_including_the_verification_queue():  # FM4
    members = tuple(
        record(f"S{i:02d}", aqi_p95_selected=float(i), teachers=None if i < 10 else 10.0) for i in range(21)
    )
    prepared_set = prepare(members)
    aqi_anchor = next(a for a in prepared_set.anchors if a.name == "aqi")
    assert (aqi_anchor.p05, aqi_anchor.p95, aqi_anchor.n_valid, aqi_anchor.n_records) == (1.0, 19.0, 21, 21)
    assert prepared_set.records[15].gate_failures == ()
    assert pytest.approx((15 - 1) / 18, abs=1e-15) == prepared_set.records[15].components.Q


def test_a_missing_value_is_excluded_from_the_anchor_and_stays_missing():  # FM3, FM4
    members = (*ladder("aqi_p95_selected"), record("No AQI", aqi_p95_selected=None))
    prepared_set = prepare(members)
    aqi_anchor = next(a for a in prepared_set.anchors if a.name == "aqi")
    assert (aqi_anchor.n_valid, aqi_anchor.n_records) == (21, 22)
    assert prepared_set.records[-1].components.Q is None


def test_a_constant_column_scales_to_one_half_not_to_nan_or_zero():  # FM4
    prepared_set = prepare(ladder("aqi_p95_selected", lambda i: 40.0))
    assert {p.components.Q for p in prepared_set.records} == {0.5}


def test_negative_luminosity_is_floored_at_zero_before_log1p():
    members = (
        *expm1_ladder("district_luminosity_area_integral"),
        record("Dark", district_luminosity_area_integral=-3.0),
    )
    prepared_set = prepare(members)
    assert (
        prepared_set.records[-1].area_parts.activity_scale_deficit
        == prepared_set.records[0].area_parts.activity_scale_deficit
        == 1.0
    )


def test_preparing_no_records_returns_no_records():
    assert prepare(()).records == ()


def test_negative_environmental_inputs_are_unknown_and_stay_out_of_the_anchors():  # FM3, FM4
    members = (
        *ladder("aqi_p95_selected"),
        record("Negative AQI", aqi_p95_selected=-1.0),
        record("Negative emissions", emissions_co2e_100yr_10km_tonnes=-1.0),
        record("Negative land", water_flooded_vegetation_fraction_500m=-0.2),
    )
    prepared_set = prepare(members)
    aqi, emissions, land = prepared_set.records[-3:]
    assert (aqi.components.Q, emissions.components.E, land.components.L) == (None, None, None)
    assert (aqi.missing_components, emissions.missing_components, land.missing_components) == (
        (Q,),
        (E,),
        (L,),
    )
    anchors = {a.name: a for a in prepared_set.anchors}
    assert (anchors["aqi"].n_valid, anchors["emissions"].n_valid, anchors["land"].n_valid) == (23, 23, 23)


def test_share_parts_are_unknown_when_their_denominator_is_zero():  # FM3
    parts = prepare_with_target(
        total_classrooms=0.0, teachers=0.0, permanent_classrooms=3.0, teacher_houses=3.0
    ).need_parts
    assert (parts.permanent_classroom_deficit, parts.teacher_housing_deficit) == (None, None)


def test_anchors_flag_a_scale_that_cannot_discriminate():  # FM4
    def aqi_anchor(values):
        members = tuple(record(f"S{i:02d}", aqi_p95_selected=values(i)) for i in range(21))
        return next(a for a in prepare(members).anchors if a.name == "aqi")

    assert aqi_anchor(lambda i: float(i)).degenerate is False
    constant = aqi_anchor(lambda i: 40.0)
    assert (constant.degenerate, constant.p05, constant.p95) == (True, 40.0, 40.0)
    empty = aqi_anchor(lambda i: None)
    assert (empty.degenerate, empty.n_valid, empty.p05, empty.p95) == (True, 0, None, None)
