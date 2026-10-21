import { readFileSync } from "node:fs";
import path from "node:path";

import { parseWith } from "@/lib/screening/schema";
import { resultsResponse } from "@/lib/screening/types";

/** The API's own responses for invented schools, saved by services/api/scripts/generate_screening_fixtures.py. */
const ROOT = path.resolve(__dirname, "../../e2e/fixtures/screening");

/** The datasets the generator saves: the default one in the folder itself, the others in a folder of their own. */
export const DATASETS = ["", "worst-names", "ties-and-ranges", "one", "empty"] as const;
export type Dataset = (typeof DATASETS)[number];

export function readFixture(file: string, dataset: Dataset = ""): unknown {
  return JSON.parse(readFileSync(path.join(ROOT, dataset, file), "utf8"));
}

export interface FixtureRequest {
  path: string;
  query: Record<string, string>;
  file: string;
  /** Set when the API did not answer 200; the file then holds its error envelope. */
  status?: number;
}

export function fixtureIndex(dataset: Dataset = ""): { requests: FixtureRequest[] } {
  return readFixture("index.json", dataset) as { requests: FixtureRequest[] };
}

export const results = (rule: string, upper = false) =>
  parseWith(resultsResponse, readFixture(`results/${rule}${upper ? ".upper" : ""}.json`), `results/${rule}`);

/** A deep copy that a test can break without touching the shared fixture. */
export const copy = <T>(value: T): T => structuredClone(value);
