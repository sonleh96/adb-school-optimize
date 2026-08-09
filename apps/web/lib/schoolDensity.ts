import type { SchoolRecord } from "@/lib/types";

export const NATIONAL_DENSITY_ZOOM_THRESHOLD = 8;

const DENSITY_GRID_SIZE_DEGREES = 1.5;

export type SchoolDensityCell = {
  count: number;
  latitude: number;
  longitude: number;
};

/**
 * Creates stable national-level bubbles without a request or a map-pixel dependency.
 * The intentionally coarse 1.5 degree grid avoids suggesting individual school locations
 * while overlapping point markers are hidden.
 */
export function aggregateSchoolDensity(schools: SchoolRecord[]): SchoolDensityCell[] {
  const cells = new Map<string, { count: number; latitude: number; longitude: number }>();

  for (const school of schools) {
    if (!Number.isFinite(school.latitude) || !Number.isFinite(school.longitude)) continue;

    const latitudeIndex = Math.floor(school.latitude / DENSITY_GRID_SIZE_DEGREES);
    const longitudeIndex = Math.floor(school.longitude / DENSITY_GRID_SIZE_DEGREES);
    const key = `${latitudeIndex}:${longitudeIndex}`;
    const current = cells.get(key);

    if (current) {
      current.count += 1;
      current.latitude += school.latitude;
      current.longitude += school.longitude;
      continue;
    }

    cells.set(key, {
      count: 1,
      latitude: school.latitude,
      longitude: school.longitude,
    });
  }

  return [...cells.values()]
    .map((cell) => ({
      count: cell.count,
      latitude: cell.latitude / cell.count,
      longitude: cell.longitude / cell.count,
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.latitude - right.latitude || left.longitude - right.longitude
    );
}

export function densityBubbleRadius(count: number): number {
  return Math.min(24, 7 + Math.sqrt(count) * 5);
}

export function densityCellSignature(cells: SchoolDensityCell[]): string {
  let hash = 2166136261;

  for (const cell of cells) {
    const values = [cell.count, Math.round(cell.latitude * 10_000), Math.round(cell.longitude * 10_000)];
    for (const value of values) {
      hash ^= value;
      hash = Math.imul(hash, 16777619);
    }
  }

  return (hash >>> 0).toString(36);
}
