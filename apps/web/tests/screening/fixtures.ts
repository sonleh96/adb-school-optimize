import { readFileSync } from "node:fs";
import path from "node:path";

import { parseWith } from "@/lib/screening/schema";
import { resultsResponse } from "@/lib/screening/types";

/** The API's own responses for invented schools, saved by services/api/scripts/generate_screening_fixtures.py. */
const ROOT = path.resolve(__dirname, "../../e2e/fixtures/screening");

export function readFixture(file: string): unknown {
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

export function fixtureIndex(): {
  requests: Array<{ path: string; query: Record<string, string>; file: string }>;
} {
  return readFixture("index.json") as ReturnType<typeof fixtureIndex>;
}

export const results = (rule: string, upper = false) =>
  parseWith(resultsResponse, readFixture(`results/${rule}${upper ? ".upper" : ""}.json`), `results/${rule}`);

/** A deep copy that a test can break without touching the shared fixture. */
export const copy = <T>(value: T): T => structuredClone(value);
