from __future__ import annotations

from typing import Any

import pandas as pd

from .config import ScoringConfig, WeightConfig, get_default_config, get_default_weights
from .explainability import build_score_breakdown, summarize_imputation, summarize_missingness
from .ranking import compute_stage1_screening, rank_scores
from .schemas import ScoringResult
from .utils import (
    clean_text,
    clip01,
    fill_with_median_or_default,
    inv_minmax,
    minmax,
    row_mean,
    safe_div,
    score_power,
    score_water,
    wkt_area_m2,
)
from .validators import merge_weight_overrides, validate_input_data, validate_weight_config


def _weight_dict(weights: WeightConfig | dict[str, Any]) -> dict[str, Any]:
    return weights.to_dict() if isinstance(weights, WeightConfig) else weights


def compute_school_need_subscore(
    df: pd.DataFrame,
    config: ScoringConfig,
    weights: WeightConfig | dict[str, Any],
) -> pd.DataFrame:
    weight_dict = _weight_dict(weights)
    result = df.copy()

    locality_map = {
        "highly accessible": 0.00,
        "accessible": 0.20,
        "moderately accessible": 0.45,
        "remote": 0.70,
        "very remote": 0.90,
        "extremely remote": 1.00,
    }

    result["Locality_clean"] = result[config.columns.locality].map(clean_text)
    result["Locality_score"] = result["Locality_clean"].map(locality_map)
    result["Locality_score"] = result["Locality_score"].fillna(inv_minmax(result["pop_with_access_walking"]))

    result["walk_access_deficit"] = inv_minmax(result["pop_with_access_walking"])
    result["cycle_access_deficit"] = inv_minmax(result["pop_with_access_cycling"])
    result["drive_access_deficit"] = inv_minmax(result["pop_with_access_driving"])
    result["school_access_barrier"] = clip01(
        weight_dict["school_access"]["walking"] * result["walk_access_deficit"]
        + weight_dict["school_access"]["cycling"] * result["cycle_access_deficit"]
        + weight_dict["school_access"]["driving"] * result["drive_access_deficit"]
    )

    result["teacher_scarcity"] = inv_minmax(result["Number of Available Teachers"])
    result["perm_class_share"] = clip01(
        safe_div(result["Number of Permanent Classrooms"], result["Total Number of Classrooms"])
    )
    result["semi_class_share"] = clip01(
        safe_div(result["Number of Semi-Permanent Classrooms"], result["Total Number of Classrooms"])
    )
    result["bush_class_share"] = clip01(
        safe_div(result["Number of Bush Material Classrooms"], result["Total Number of Classrooms"])
    )
    result["classroom_stock_deficit"] = inv_minmax(result["Total Number of Classrooms"])

    facility_columns = [
        "Number of Libraries",
        "Number of Workshops",
        "Number of Practical Skills Buildings",
        "Number of Home Economics Buildings",
        "Number of Computer Labs",
        "Number of Specialized Classrooms",
    ]
    result["facility_count_total"] = result[facility_columns].apply(pd.to_numeric, errors="coerce").fillna(0).sum(axis=1)
    result["facility_deficit"] = inv_minmax(result["facility_count_total"])

    result["teacher_housing_deficit"] = inv_minmax(result["Number of Houses for Teachers"])
    result["power_deficit"] = result["Power Source"].map(score_power).fillna(0.5)
    result["water_deficit"] = result["Water Source"].map(score_water).fillna(0.5)
    result["service_deficit"] = (
        0.40 * result["power_deficit"] +
        0.30 * result["water_deficit"]
    )

    result["S"] = clip01(
        weight_dict["school_need"]["locality"] * result["Locality_score"]
        + weight_dict["school_need"]["access_barrier"] * result["school_access_barrier"]
        + weight_dict["school_need"]["teacher_scarcity"] * result["teacher_scarcity"]
        + weight_dict["school_need"]["classroom_stock_deficit"] * result["classroom_stock_deficit"]
        + weight_dict["school_need"]["service_deficit"] * result["service_deficit"]
        + weight_dict["school_need"]["infrastructure_balance"]
        * row_mean(result, ["facility_deficit", "teacher_housing_deficit"])
    )

    return result


def compute_admin_context_subscore(
    df: pd.DataFrame,
    config: ScoringConfig,
    weights: WeightConfig | dict[str, Any],
) -> pd.DataFrame:
    weight_dict = _weight_dict(weights)
    result = df.copy()

    result["adm_walk_deficit"] = inv_minmax(result["Access Walking (%)"])
    result["adm_drive_deficit"] = inv_minmax(result["Access Driving (%)"])
    result["adm_cycle_deficit"] = inv_minmax(result["Access Cycling (%)"])
    result["AccAdm"] = (
        weight_dict["admin_access"]["walking"] * result["adm_walk_deficit"]
        + weight_dict["admin_access"]["cycling"] * result["adm_cycle_deficit"]
        + weight_dict["admin_access"]["driving"] * result["adm_drive_deficit"]
    )

    result["fixed_down_deficit"] = inv_minmax(result["Fixed Broadband Download Speed (MB/s)"])
    result["mobile_down_deficit"] = inv_minmax(result["Mobile Internet Download Speed (MB/s)"])
    result["ServAdm"] = (
        weight_dict["admin_service"]["fixed_download"] * result["fixed_down_deficit"]
        + weight_dict["admin_service"]["mobile_download"] * result["mobile_down_deficit"]
    )

    result["prog10_deficit"] = inv_minmax(result["Rate of Grade 7 who progressed to Grade 10 (%)"])
    result["sec_participation_deficit"] = inv_minmax(result["Grade 7-10 Students per 1000 Population"])
    result["female_share_7_12"] = safe_div(
        result["Female students grade 7-12"],
        result["Total enrollment Grade 7-12"],
    )
    result["female_disadvantage"] = clip01((0.5 - result["female_share_7_12"]) / 0.5).fillna(0)

    result["ntl_deficit"] = inv_minmax(result["Total Nighttime Luminosity"])
    result["secondary_students_per_1000_deficit"] = inv_minmax(result["Secondary students per 1000 people"])
    result["SocioAdm"] = (
        weight_dict["admin_socio"]["ntl_deficit"] * result["ntl_deficit"]
        + weight_dict["admin_socio"]["sec_participation_deficit"] * result["sec_participation_deficit"]
        + weight_dict["admin_socio"]["secondary_students_per_1000_deficit"] * result["secondary_students_per_1000_deficit"]
    )

    result["conflict_events_n"] = minmax(result["Conflict Events"])
    result["conflict_fatalities_n"] = minmax(result["Conflict Fatalities"])
    result["conflict_exposure_n"] = minmax(result["Conflict Population Exposure"])
    result["ConflictAdm"] = (
        weight_dict["admin_conflict"]["events"] * result["conflict_events_n"]
        + weight_dict["admin_conflict"]["fatalities"] * result["conflict_fatalities_n"]
        + weight_dict["admin_conflict"]["exposure"] * result["conflict_exposure_n"]
    )

    result["A"] = clip01(
        weight_dict["admin_context"]["access"] * result["AccAdm"]
        + weight_dict["admin_context"]["service"] * result["ServAdm"]
        + weight_dict["admin_context"]["progression"] * result["prog10_deficit"]
        + weight_dict["admin_context"]["socio"] * result["SocioAdm"]
        + weight_dict["admin_context"]["conflict"] * result["ConflictAdm"]
    )

    return result


def compute_physical_risk_subscore(
    df: pd.DataFrame,
    config: ScoringConfig,
    weights: WeightConfig | dict[str, Any],
) -> pd.DataFrame:
    weight_dict = _weight_dict(weights)
    result = df.copy()

    r_filled = fill_with_median_or_default(result["R"]) if "R" in result.columns else pd.Series(0.5, index=result.index)
    lc_filled = (
        fill_with_median_or_default(result["lc_landterr_score"])
        if "lc_landterr_score" in result.columns
        else pd.Series(0.5, index=result.index)
    )
    result["R_phys"] = clip01(
        weight_dict["physical"]["flood_risk"] * r_filled +
        weight_dict["physical"]["land_terrain"] * lc_filled
    )
    return result


def compute_girls_bonus(
    df: pd.DataFrame,
    config: ScoringConfig,
    weights: WeightConfig | dict[str, Any],
) -> pd.DataFrame:
    weight_dict = _weight_dict(weights)
    result = df.copy()
    result["G"] = (
        weight_dict["girls_bonus"]["female_disadvantage"] * result["female_disadvantage"] +
        weight_dict["girls_bonus"]["locality"] * result["Locality_score"]
    ).clip(upper=weight_dict["girls_bonus"]["cap"])
    return result


def compute_need_score(
    df: pd.DataFrame,
    config: ScoringConfig,
    weights: WeightConfig | dict[str, Any],
) -> pd.DataFrame:
    weight_dict = _weight_dict(weights)
    result = df.copy()
    result["Need"] = clip01(
        weight_dict["need"]["S"] * result["S"] +
        weight_dict["need"]["A"] * result["A"] +
        weight_dict["need"]["R_phys"] * result["R_phys"] +
        result["G"]
    )
    return result


def compute_impact_score(
    df: pd.DataFrame,
    config: ScoringConfig,
    weights: WeightConfig | dict[str, Any],
) -> pd.DataFrame:
    weight_dict = _weight_dict(weights)
    result = df.copy()

    result["accessible_pop"] = row_mean(
        result,
        ["pop_with_access_walking", "pop_with_access_cycling", "pop_with_access_driving"],
    )

    source_crs = config.imputation.source_crs
    metric_crs = config.imputation.metric_crs
    for column in config.columns.catchment_wkt_columns:
        if column in result.columns:
            result[f"{column}_m2"] = wkt_area_m2(result[column], source_crs=source_crs, area_crs=metric_crs)
        else:
            result[f"{column}_m2"] = pd.Series(pd.NA, index=result.index)

    result["catchment_area"] = row_mean(
        result,
        [f"{column}_m2" for column in config.columns.catchment_wkt_columns],
    )
    result["accessible_pop_n"] = minmax(result["accessible_pop"])
    result["catchment_area_n"] = minmax(result["catchment_area"])
    result["school_gap"] = (
        0.45 * result["service_deficit"] +
        0.30 * result["classroom_stock_deficit"] +
        0.25 * result["teacher_scarcity"]
    )
    result["I"] = clip01(
        weight_dict["impact"]["accessible_pop"] * result["accessible_pop_n"] +
        weight_dict["impact"]["catchment_area"] * result["catchment_area_n"] +
        weight_dict["impact"]["school_gap"] * result["school_gap"]
    )
    return result


def compute_practicality_score(
    df: pd.DataFrame,
    config: ScoringConfig,
    weights: WeightConfig | dict[str, Any],
) -> pd.DataFrame:
    weight_dict = _weight_dict(weights)
    result = df.copy()
    land = fill_with_median_or_default(result["lc_landterr_score"]) if "lc_landterr_score" in result.columns else pd.Series(0.5, index=result.index)
    flood = fill_with_median_or_default(result["R"]) if "R" in result.columns else pd.Series(0.5, index=result.index)
    result["P"] = clip01(
        weight_dict["practicality"]["land_terrain_inverse"] * (1 - land) +
        weight_dict["practicality"]["flood_inverse"] * (1 - flood)
    )
    return result


def compute_priority_score(
    df: pd.DataFrame,
    config: ScoringConfig,
    weights: WeightConfig | dict[str, Any],
) -> pd.DataFrame:
    weight_dict = _weight_dict(weights)
    result = df.copy()
    result["Priority"] = clip01(
        weight_dict["priority"]["Need"] * result["Need"] +
        weight_dict["priority"]["I"] * result["I"] +
        weight_dict["priority"]["P"] * result["P"]
    )
    return result


def compute_data_confidence(df: pd.DataFrame, config: ScoringConfig) -> pd.DataFrame:
    result = df.copy()
    missing_flags = [column for column in result.columns if column.endswith("_orig_missing")]
    if missing_flags:
        result["data_confidence"] = 1 - result[missing_flags].mean(axis=1)
    else:
        result["data_confidence"] = 1.0
    return result


def run_scoring(
    df: pd.DataFrame,
    config: ScoringConfig | None = None,
    weight_overrides: dict[str, Any] | None = None,
) -> ScoringResult:
    from .preprocessing import preprocess_input_data

    config = config or get_default_config()
    validate_input_data(df, config)

    applied_weights = merge_weight_overrides(get_default_weights().to_dict(), weight_overrides)
    validate_weight_config(applied_weights)

    processed, warnings = preprocess_input_data(df, config)
    scored = compute_school_need_subscore(processed, config, applied_weights)
    scored = compute_admin_context_subscore(scored, config, applied_weights)
    scored = compute_physical_risk_subscore(scored, config, applied_weights)
    scored = compute_girls_bonus(scored, config, applied_weights)
    scored = compute_need_score(scored, config, applied_weights)
    scored = compute_impact_score(scored, config, applied_weights)
    scored = compute_practicality_score(scored, config, applied_weights)
    scored = compute_priority_score(scored, config, applied_weights)
    scored = compute_data_confidence(scored, config)
    scored = compute_stage1_screening(scored, config)
    ranked = rank_scores(scored, config)

    if config.output.include_breakdown_column:
        ranked["score_breakdown"] = ranked.apply(
            lambda row: build_score_breakdown(row, applied_weights),
            axis=1,
        )

    summary = {
        "rows": int(len(ranked)),
        "selected_stage1": int(ranked["stage1_selected"].sum()),
        "top_school": ranked.iloc[0][config.columns.school_name] if not ranked.empty else None,
        "missingness": summarize_missingness(df),
        "imputation": summarize_imputation(ranked),
    }

    return ScoringResult(
        scored_data=ranked,
        summary=summary,
        applied_config=config.to_dict(),
        applied_weights=applied_weights,
        warnings=warnings,
    )

