/**
 * What the map draws for each school. The three marks and the place ramp are the design's:
 * a filled dot for a place in the list (its colour steps with the place), a ring with a centre dot for a range
 * of places, and an empty ring for a school whose record is incomplete.
 */
import { placeLabel, placeOf } from "./list";
import type { ListedRow, SchoolKey } from "./types";

/** Last place of each step of the ramp: 1st to 10th, 11th to 20th, 21st to 40th, 41st to 80th, 81st on. */
export const RAMP_UPPER_BOUNDS = [10, 20, 40, 80] as const;
/** The basemap's colours under the marks. Every mark keeps at least 3:1 against both (see marks.test.ts). */
export const LAND_COLOUR = "#ece9e2";
export const WATER_COLOUR = "#dde3e8";
/** Dark to light, one colour and one dot radius (in pixels) per step. The lightest step is still 3:1 on land. */
export const RAMP_HEX = ["#0a2e73", "#24519f", "#3063b4", "#3d74ca", "#447dd5"] as const;
/** The rings of the range mark and of the incomplete record, and the fill inside them. */
export const RANGE_RING_HEX = "#4a4f57";
export const INCOMPLETE_RING_HEX = "#6e6b63";
export const MARK_PAPER_HEX = "#fbfaf7";
export const RAMP_RADIUS = [8, 6.5, 5.5, 4.5, 4] as const;
/** The dots up to this place carry their number on the map. */
export const LABELLED_PLACES = 10;

export type Mark = { kind: "dot"; rank: number; step: number } | { kind: "range" } | { kind: "incomplete" };

export function rampStep(rank: number): number {
  const step = RAMP_UPPER_BOUNDS.findIndex((upper) => rank <= upper);
  return step < 0 ? RAMP_UPPER_BOUNDS.length : step;
}

export function markOf(row: ListedRow): Mark {
  switch (row.cohort) {
    case "complete":
      return { kind: "dot", rank: row.point_rank.rank, step: rampStep(row.point_rank.rank) };
    case "interval":
      return { kind: "range" };
    case "verification_queue":
      return { kind: "incomplete" };
  }
}

/** The number a school carries on the map: its place, for a dot among the first ten. Other marks carry none. */
export function numberOnMark(mark: Mark): number | null {
  return mark.kind === "dot" && mark.rank <= LABELLED_PLACES ? mark.rank : null;
}

export interface MapSchool {
  key: SchoolKey;
  lon: number;
  lat: number;
  mark: Mark;
  name: string;
  province: string | null;
  /** "3rd", "12th to 27th", or empty for an incomplete record. */
  place: string;
  /** What the place is counted among, in the API's words, for example "complete under this rule (16)". */
  scope: string | null;
  /** A range school whose two ends are the same place. */
  exact: boolean;
}

/** Schools that can be drawn: those with both coordinates. The rest stay in the list only. */
export function toMapSchools(rows: readonly ListedRow[]): MapSchool[] {
  const schools: MapSchool[] = [];
  for (const row of rows) {
    const { latitude, longitude } = row.school;
    if (latitude === null || longitude === null) continue;
    const place = placeOf(row);
    schools.push({
      key: row.school.school_key,
      lon: longitude,
      lat: latitude,
      mark: markOf(row),
      name: row.school.source_school_name,
      province: row.school.province,
      place: placeLabel(place),
      scope: place.kind === "none" ? null : place.scope,
      exact: place.kind === "range" && place.exact,
    });
  }
  return schools;
}

export type Bounds = [[west: number, south: number], [east: number, north: number]];

export function boundsOf(schools: readonly Pick<MapSchool, "lon" | "lat">[]): Bounds | null {
  if (schools.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const { lon, lat } of schools) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}
