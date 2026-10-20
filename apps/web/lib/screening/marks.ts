/**
 * What the map draws for each school. The three marks and the place ramp are the design's:
 * a filled dot for a place in the list (its colour steps with the place), a ring with a centre dot for a range
 * of places, and an empty ring for a school whose record is incomplete.
 */
import type { ListedRow, SchoolKey } from "./types";
import { type Band, bandOf, placeBands } from "./workspace/bands";
/** The basemap's colours under the marks. Every mark keeps at least 3:1 against both (see marks.test.ts). */
export const LAND_COLOUR = "#ece9e2";
export const WATER_COLOUR = "#dde3e8";
/**
 * Dark to light, one colour and one dot radius (in pixels) per place band (see workspace/bands.ts: at most five).
 * The lightest step is still 3:1 on land.
 */
export const RAMP_HEX = ["#0a2e73", "#24519f", "#3063b4", "#3d74ca", "#447dd5"] as const;
/** The rings of the range mark and of the incomplete record, and the fill inside them. */
export const RANGE_RING_HEX = "#4a4f57";
export const INCOMPLETE_RING_HEX = "#6e6b63";
export const MARK_PAPER_HEX = "#fbfaf7";
export const RAMP_RADIUS = [8, 6.5, 5.5, 4.5, 4] as const;
/** The dots up to this place carry their number on the map. */
export const LABELLED_PLACES = 10;

export type Mark = { kind: "dot"; rank: number; step: number } | { kind: "range" } | { kind: "incomplete" };

/** The place bands of a list: cut from the number of its schools with a single place. */
export const bandsOf = (rows: readonly ListedRow[]): Band[] =>
  placeBands(rows.filter((row) => row.cohort === "complete").length);

export function markOf(row: ListedRow, bands: readonly Band[]): Mark {
  switch (row.cohort) {
    case "complete":
      return { kind: "dot", rank: row.point_rank.rank, step: bandOf(row.point_rank.rank, bands) };
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

/** A school as the map draws it. What the tooltip says comes from the copy, at the workspace's data boundary. */
export interface MapSchool {
  key: SchoolKey;
  lon: number;
  lat: number;
  mark: Mark;
}

/** Schools that can be drawn: those with both coordinates. The rest stay in the list only. */
export function toMapSchools(
  rows: readonly ListedRow[],
  bands: readonly Band[] = bandsOf(rows)
): MapSchool[] {
  const schools: MapSchool[] = [];
  for (const row of rows) {
    const { latitude, longitude } = row.school;
    if (latitude === null || longitude === null) continue;
    schools.push({ key: row.school.school_key, lon: longitude, lat: latitude, mark: markOf(row, bands) });
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
