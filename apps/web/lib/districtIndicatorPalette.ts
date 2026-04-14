import type { DistrictRecord } from "@/lib/types";

export type IndicatorDirection = "higher_is_better" | "higher_is_worse";

type IndicatorMeta = {
  field: string;
  direction: IndicatorDirection;
};

const DISTRICT_INDICATOR_META: Record<string, IndicatorMeta> = {
  "Average AQI": { field: "average_aqi", direction: "higher_is_worse" },
  "Maximum AQI": { field: "maximum_aqi", direction: "higher_is_worse" },
  "Fixed Broadband Download Speed (MB/s)": {
    field: "fixed_broadband_download_speed_mbps",
    direction: "higher_is_better",
  },
  "Fixed Broadband Upload Speed (MB/s)": {
    field: "fixed_broadband_upload_speed_mbps",
    direction: "higher_is_better",
  },
  "Mobile Internet Download Speed (MB/s)": {
    field: "mobile_internet_download_speed_mbps",
    direction: "higher_is_better",
  },
  "Mobile Internet Upload Speed (MB/s)": {
    field: "mobile_internet_upload_speed_mbps",
    direction: "higher_is_better",
  },
  "Access Walking (%)": { field: "access_walking_pct", direction: "higher_is_better" },
  "Access Driving (%)": { field: "access_driving_pct", direction: "higher_is_better" },
  "Access Cycling (%)": { field: "access_cycling_pct", direction: "higher_is_better" },
  "Total Nighttime Luminosity": { field: "total_nighttime_luminosity", direction: "higher_is_better" },
  "CO2e-20yr Total Emissions (tonnes)": {
    field: "co2e_20yr_total_emissions_tonnes",
    direction: "higher_is_worse",
  },
  "CO2e-100yr Total Emissions (tonnes)": {
    field: "co2e_100yr_total_emissions_tonnes",
    direction: "higher_is_worse",
  },
  "Rate of Grade 7 who progressed to Grade 12 (%)": {
    field: "rate_grade_7_progressed_to_grade_12_pct",
    direction: "higher_is_better",
  },
  "School-Aged Population": { field: "school_aged_population", direction: "higher_is_better" },
  "Female students grade 7-12": { field: "female_students_grade_7_12", direction: "higher_is_better" },
  "Total enrollment Grade 7-10": { field: "total_enrollment_grade_7_10", direction: "higher_is_better" },
  "Secondary students per 1000 people": { field: "secondary_students_per_1000_people", direction: "higher_is_better" },
  "Rate of Grade 7 who progressed to Grade 10 (%)": {
    field: "rate_grade_7_progressed_to_grade_10_pct",
    direction: "higher_is_better",
  },
  "Conflict Events": { field: "conflict_events", direction: "higher_is_worse" },
  "Conflict Fatalities": { field: "conflict_fatalities", direction: "higher_is_worse" },
  "Conflict Population Exposure": { field: "conflict_population_exposure", direction: "higher_is_worse" },
};

const DEFAULT_META: IndicatorMeta = { field: "average_aqi", direction: "higher_is_worse" };

export function districtIndicatorMeta(indicator: string): IndicatorMeta {
  return DISTRICT_INDICATOR_META[indicator] ?? DEFAULT_META;
}

export function districtIndicatorField(indicator: string): keyof DistrictRecord | string {
  return districtIndicatorMeta(indicator).field;
}

export function districtIndicatorDirection(indicator: string): IndicatorDirection {
  return districtIndicatorMeta(indicator).direction;
}

export function districtIndicatorColor(indicator: string, normalized: number): string {
  const clamped = Math.max(0, Math.min(1, normalized));
  const direction = districtIndicatorDirection(indicator);
  const badness = direction === "higher_is_better" ? 1 - clamped : clamped;
  return interpolateBadnessColor(badness);
}

function interpolateBadnessColor(t: number): string {
  const stops = [
    [0.0, [49, 130, 206]],   // good: blue
    [0.26, [92, 170, 214]],
    [0.5, [166, 201, 183]],
    [0.72, [239, 186, 132]],
    [1.0, [199, 83, 70]],    // bad: red
  ] as const;

  if (t <= stops[0][0]) return rgb(stops[0][1]);
  if (t >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1]);

  for (let index = 0; index < stops.length - 1; index += 1) {
    const [leftT, leftColor] = stops[index];
    const [rightT, rightColor] = stops[index + 1];
    if (t >= leftT && t <= rightT) {
      const p = (t - leftT) / (rightT - leftT);
      return rgb([
        Math.round(leftColor[0] + (rightColor[0] - leftColor[0]) * p),
        Math.round(leftColor[1] + (rightColor[1] - leftColor[1]) * p),
        Math.round(leftColor[2] + (rightColor[2] - leftColor[2]) * p),
      ]);
    }
  }
  return rgb(stops[0][1]);
}

function rgb(values: readonly number[]): string {
  return `rgb(${values[0]}, ${values[1]}, ${values[2]})`;
}
