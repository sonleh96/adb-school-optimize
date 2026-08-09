"""Utilities for AQI enrichment and aggregation with Dask-backed processing."""

import numpy as np
import pandas as pd
import dask.dataframe as dd


# EPA AQI categories
AQI_CATEGORIES = [
    (0, 50, "Good"),
    (51, 100, "Moderate"),
    (101, 150, "Unhealthy for Sensitive Groups"),
    (151, 200, "Unhealthy"),
    (201, 300, "Very Unhealthy"),
    (301, np.inf, "Hazardous"),
]

# Molecular weights for ug/m3 -> ppm/ppb conversion at 25C, 1 atm.
MOLECULAR_WEIGHTS = {
    "o3": 48.0,
    "co": 28.01,
    "so2": 64.066,
    "no2": 46.0055,
}


def _truncate(series: pd.Series, decimals: int) -> pd.Series:
    factor = 10**decimals
    return np.floor(series.astype("float64") * factor) / factor


def _round_aqi(series: pd.Series) -> pd.Series:
    # EPA: round AQI to nearest integer.
    return np.floor(series + 0.5)


def _to_ppm_from_ugm3(series: pd.Series, molecular_weight: float) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce")
    return (s * 24.45) / (molecular_weight * 1000.0)


def _to_ppb_from_ugm3(series: pd.Series, molecular_weight: float) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce")
    return (s * 24.45) / molecular_weight


def _aqi_from_breakpoints(
    concentration: pd.Series,
    breakpoints: list[tuple[float, float, int, int]],
    truncate_decimals: int,
    extrapolate_above_top: bool = True,
) -> pd.Series:
    c = _truncate(pd.to_numeric(concentration, errors="coerce"), truncate_decimals)
    out = pd.Series(np.nan, index=c.index, dtype="float64")

    for c_low, c_high, i_low, i_high in breakpoints:
        mask = c.ge(c_low) & c.le(c_high)
        out.loc[mask] = ((i_high - i_low) / (c_high - c_low)) * (c.loc[mask] - c_low) + i_low

    if extrapolate_above_top:
        c_low, c_high, i_low, i_high = breakpoints[-1]
        high_mask = c.gt(c_high)
        out.loc[high_mask] = ((i_high - i_low) / (c_high - c_low)) * (
            c.loc[high_mask] - c_low
        ) + i_low

    return _round_aqi(out)


def _aqi_category_from_series(aqi: pd.Series) -> pd.Series:
    out = pd.Series(pd.NA, index=aqi.index, dtype="object")
    for low, high, label in AQI_CATEGORIES:
        out.loc[aqi.ge(low) & aqi.lt(high if np.isinf(high) else high + 1)] = label
    return out


def _daily_avg_with_min_count(series: pd.Series, min_hours: int = 18) -> pd.Series:
    grouped = series.groupby(series.index.floor("D"))
    mean = grouped.mean()
    count = grouped.count()
    mean.loc[count < min_hours] = np.nan
    return mean


def _daily_max(series: pd.Series) -> pd.Series:
    return series.groupby(series.index.floor("D")).max()


def _daily_o3_8h_max_epa(o3_ppm: pd.Series) -> pd.Series:
    """
    EPA daily max 8-hour ozone:
    use 8-hour averages that start between 07:00 and 23:00 local day (17 periods).
    """
    roll8 = o3_ppm.rolling(8, min_periods=8).mean()
    start_time = roll8.index - pd.Timedelta(hours=7)
    valid = (start_time.hour >= 7) & (start_time.hour <= 23)
    start_day = pd.Series(start_time.floor("D"), index=roll8.index)
    valid_roll = roll8[valid].dropna()
    valid_days = start_day.loc[valid_roll.index]
    out = valid_roll.groupby(valid_days).max()
    out.index.name = "date"
    return out


def _compute_daily_us_aqi_per_location(pdf: pd.DataFrame, min_hours_daily_avg: int = 18) -> pd.DataFrame:
    pdf = pdf.copy()
    pdf["timestamp"] = pd.to_datetime(pdf["timestamp"], errors="coerce", utc=True)
    pdf = pdf.dropna(subset=["timestamp"]).sort_values("timestamp")
    if pdf.empty:
        return pd.DataFrame(
            columns=[
                "location",
                "date",
                "aqi_o3",
                "aqi_pm25",
                "aqi_pm10",
                "aqi_co",
                "aqi_so2",
                "aqi_no2",
                "aqi_us",
                "aqi_dominant",
                "aqi_category",
            ]
        )

    for col in ["o3", "pm25", "pm10", "co", "so2", "no2"]:
        if col in pdf.columns:
            pdf[col] = pd.to_numeric(pdf[col], errors="coerce")
        else:
            pdf[col] = np.nan

    ts = pdf.set_index("timestamp").sort_index()

    # Input values are all ug/m3.
    o3_ppm_1h = _to_ppm_from_ugm3(ts["o3"], MOLECULAR_WEIGHTS["o3"])
    co_ppm_1h = _to_ppm_from_ugm3(ts["co"], MOLECULAR_WEIGHTS["co"])
    so2_ppb_1h = _to_ppb_from_ugm3(ts["so2"], MOLECULAR_WEIGHTS["so2"])
    no2_ppb_1h = _to_ppb_from_ugm3(ts["no2"], MOLECULAR_WEIGHTS["no2"])

    pm25_ug_1h = ts["pm25"]
    pm10_ug_1h = ts["pm10"]

    # Daily concentration inputs per EPA AQI guidance.
    o3_8h_daily_max = _daily_o3_8h_max_epa(o3_ppm_1h)
    o3_1h_daily_max = _daily_max(o3_ppm_1h)
    pm25_daily_avg = _daily_avg_with_min_count(pm25_ug_1h, min_hours_daily_avg)
    pm10_daily_avg = _daily_avg_with_min_count(pm10_ug_1h, min_hours_daily_avg)
    co_8h_daily_max = _daily_max(co_ppm_1h.rolling(8, min_periods=8).mean())
    so2_1h_daily_max = _daily_max(so2_ppb_1h)
    so2_24h_daily_avg = _daily_avg_with_min_count(so2_ppb_1h, min_hours_daily_avg)
    no2_1h_daily_max = _daily_max(no2_ppb_1h)

    # Build a complete daily frame using all observed days.
    all_days = pd.Index(
        sorted(
            set(o3_8h_daily_max.index)
            | set(o3_1h_daily_max.index)
            | set(pm25_daily_avg.index)
            | set(pm10_daily_avg.index)
            | set(co_8h_daily_max.index)
            | set(so2_1h_daily_max.index)
            | set(so2_24h_daily_avg.index)
            | set(no2_1h_daily_max.index)
        ),
        name="date",
    )
    daily = pd.DataFrame(index=all_days)

    # O3: take max of 8-hour and (when applicable) 1-hour.
    aqi_o3_8h = _aqi_from_breakpoints(
        o3_8h_daily_max.reindex(all_days),
        breakpoints=[
            (0.000, 0.054, 0, 50),
            (0.055, 0.070, 51, 100),
            (0.071, 0.085, 101, 150),
            (0.086, 0.105, 151, 200),
            (0.106, 0.200, 201, 300),
        ],
        truncate_decimals=3,
        extrapolate_above_top=False,
    )
    aqi_o3_1h = _aqi_from_breakpoints(
        o3_1h_daily_max.reindex(all_days),
        breakpoints=[
            (0.125, 0.164, 101, 150),
            (0.165, 0.204, 151, 200),
            (0.205, 0.404, 201, 300),
            (0.405, 0.604, 301, 500),
        ],
        truncate_decimals=3,
        extrapolate_above_top=True,
    )
    o3_1h_trunc = _truncate(o3_1h_daily_max.reindex(all_days), 3)
    aqi_o3_1h.loc[o3_1h_trunc.lt(0.125)] = np.nan
    daily["aqi_o3"] = pd.concat([aqi_o3_8h, aqi_o3_1h], axis=1).max(axis=1, skipna=True)

    # PM2.5 (24-hour average)
    daily["aqi_pm25"] = _aqi_from_breakpoints(
        pm25_daily_avg.reindex(all_days),
        breakpoints=[
            (0.0, 9.0, 0, 50),
            (9.1, 35.4, 51, 100),
            (35.5, 55.4, 101, 150),
            (55.5, 125.4, 151, 200),
            (125.5, 225.4, 201, 300),
            (225.5, 325.4, 301, 500),
        ],
        truncate_decimals=1,
        extrapolate_above_top=True,
    )

    # PM10 (24-hour average)
    daily["aqi_pm10"] = _aqi_from_breakpoints(
        pm10_daily_avg.reindex(all_days),
        breakpoints=[
            (0, 54, 0, 50),
            (55, 154, 51, 100),
            (155, 254, 101, 150),
            (255, 354, 151, 200),
            (355, 424, 201, 300),
            (425, 604, 301, 500),
        ],
        truncate_decimals=0,
        extrapolate_above_top=True,
    )

    # CO (8-hour daily max)
    daily["aqi_co"] = _aqi_from_breakpoints(
        co_8h_daily_max.reindex(all_days),
        breakpoints=[
            (0.0, 4.4, 0, 50),
            (4.5, 9.4, 51, 100),
            (9.5, 12.4, 101, 150),
            (12.5, 15.4, 151, 200),
            (15.5, 30.4, 201, 300),
            (30.5, 50.4, 301, 500),
        ],
        truncate_decimals=1,
        extrapolate_above_top=True,
    )

    # SO2 special rule: 1-hour for <=200, 24-hour for >=201, plus EPA edge case fix at 200.
    aqi_so2_1h = _aqi_from_breakpoints(
        so2_1h_daily_max.reindex(all_days),
        breakpoints=[
            (0, 35, 0, 50),
            (36, 75, 51, 100),
            (76, 185, 101, 150),
            (186, 304, 151, 200),
        ],
        truncate_decimals=0,
        extrapolate_above_top=False,
    )
    aqi_so2_24h = _aqi_from_breakpoints(
        so2_24h_daily_avg.reindex(all_days),
        breakpoints=[
            (305, 604, 201, 300),
            (605, 804, 301, 400),
            (805, 1004, 401, 500),
        ],
        truncate_decimals=0,
        extrapolate_above_top=True,
    )
    so2_1h_trunc = _truncate(so2_1h_daily_max.reindex(all_days), 0)
    so2_24h_trunc = _truncate(so2_24h_daily_avg.reindex(all_days), 0)
    daily["aqi_so2"] = aqi_so2_1h
    daily.loc[so2_24h_trunc.ge(305), "aqi_so2"] = aqi_so2_24h.loc[so2_24h_trunc.ge(305)]
    daily.loc[so2_1h_trunc.ge(305) & so2_24h_trunc.lt(305), "aqi_so2"] = 200.0

    # NO2 (1-hour daily max)
    daily["aqi_no2"] = _aqi_from_breakpoints(
        no2_1h_daily_max.reindex(all_days),
        breakpoints=[
            (0, 53, 0, 50),
            (54, 100, 51, 100),
            (101, 360, 101, 150),
            (361, 649, 151, 200),
            (650, 1249, 201, 300),
            (1250, 2049, 301, 500),
        ],
        truncate_decimals=0,
        extrapolate_above_top=True,
    )

    component_cols = ["aqi_o3", "aqi_pm25", "aqi_pm10", "aqi_co", "aqi_so2", "aqi_no2"]
    daily["aqi_us"] = daily[component_cols].max(axis=1, skipna=True)
    no_valid = daily[component_cols].isna().all(axis=1)
    dominant = daily[component_cols].fillna(-np.inf).idxmax(axis=1).str.replace(
        "aqi_", "", regex=False
    )
    dominant.loc[no_valid] = pd.NA
    daily["aqi_dominant"] = dominant
    daily["aqi_category"] = _aqi_category_from_series(daily["aqi_us"])

    daily = daily.reset_index().rename(columns={"index": "date"})
    daily["location"] = pdf["location"].iloc[0]
    return daily[
        [
            "location",
            "date",
            "aqi_o3",
            "aqi_pm25",
            "aqi_pm10",
            "aqi_co",
            "aqi_so2",
            "aqi_no2",
            "aqi_us",
            "aqi_dominant",
            "aqi_category",
        ]
    ]


def load_and_compute_aqi(
    input_paths=None,
    blocksize: str = "128MB",
    min_hours_daily_avg: int = 18,
) -> dd.DataFrame:
    """
    Load hourly monitor data with Dask and compute daily U.S. AQI per location.
    Assumes input pollutant columns are in ug/m3.
    """
    if input_paths is None:
        input_paths = ["data/air_pollution_p1.csv", "data/air_pollution_p2.csv"]

    ddf = dd.read_csv(
        input_paths,
        blocksize=blocksize,
        assume_missing=True,
        dtype={"location": "object"},
    )

    required_cols = {"location", "timestamp"}
    missing = required_cols - set(ddf.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    meta = pd.DataFrame(
        {
            "location": pd.Series(dtype="object"),
            "date": pd.Series(dtype="datetime64[ns, UTC]"),
            "aqi_o3": pd.Series(dtype="float64"),
            "aqi_pm25": pd.Series(dtype="float64"),
            "aqi_pm10": pd.Series(dtype="float64"),
            "aqi_co": pd.Series(dtype="float64"),
            "aqi_so2": pd.Series(dtype="float64"),
            "aqi_no2": pd.Series(dtype="float64"),
            "aqi_us": pd.Series(dtype="float64"),
            "aqi_dominant": pd.Series(dtype="object"),
            "aqi_category": pd.Series(dtype="object"),
        }
    )

    return ddf.groupby("location").apply(
        _compute_daily_us_aqi_per_location,
        min_hours_daily_avg=min_hours_daily_avg,
        meta=meta,
    )


if __name__ == "__main__":
    ddf = load_and_compute_aqi(
        input_paths=["data/air_pollution_p1.csv", "data/air_pollution_p2.csv"],
        min_hours_daily_avg=18,
    )
    ddf.to_parquet("data/air_pollution_daily_us_aqi.parquet", write_index=False)
