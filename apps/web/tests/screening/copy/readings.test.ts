/**
 * A reading the engine cannot use is a missing reading, whether the source left it blank or recorded a value that
 * is out of range (a negative air-quality index or emissions figure, a land fraction outside 0 to 1).
 *
 * Failure modes, each with the test that catches it:
 *  1. The detail route marks a reading missing only when the raw value is blank, so an unusable one reads "Recorded
 *     in the source" while the school is a range school.
 *  2. The list route and the detail route disagree about which readings are missing for the same school.
 *  3. A sentence quotes an unusable raw value as if it were a reading.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { placedFromResults, schoolFromDetail } from "@/lib/screening/copy";

import { copy as clone, readFixture } from "../fixtures";
import { KEYS } from "./helpers";
import { resultsResponse, schoolDetailResponse } from "@/lib/screening/types";

type Body = {
  inputs: Record<string, number | null>;
  rules: { result: { cohort: string; components: Record<string, number | null> } }[];
};

/** Sample School 08 with one raw reading changed to an unusable value and the engine's result for it. */
function unusable(input: string, component: "Q" | "E" | "L", value: number) {
  const b = clone(readFixture(`schools/${KEYS.complete}.json`)) as Body;
  b.inputs[input] = value;
  for (const r of b.rules) {
    r.result.cohort = "interval";
    r.result.components[component] = null;
  }
  return b;
}
const load = (b: Body, view: copy.CopyRuleId = "additive_u") =>
  schoolFromDetail(parseWith(schoolDetailResponse, b, "school"), view);

describe.each([
  ["aqi_p95_selected", "Q", -4, "aqi", "air", "air-quality reading"],
  ["emissions_co2e_100yr_10km_tonnes", "E", -10, "emissions", "emissions", "nearby emissions figure"],
  ["water_flooded_vegetation_fraction_500m", "L", 1.4, "land", "land", "land-cover figure"],
] as const)("a recorded %s the engine cannot use", (input, component, value, flag, key, noun) => {
  const s = load(unusable(input, component, value));

  it("is a missing reading", () => {
    expect(s.cohort).toBe("interval");
    expect(s.missing_env[flag]).toBe(true);
    expect(s.raw[`${component}_raw` as "Q_raw"]).toBe(value);
  });

  it("is not read as recorded", () => {
    expect(copy.missingValueKind(s, key)).toBe("unresolved");
    expect(copy.missingValueNote(s, key)).toBe(
      `The ${noun} recorded for this school cannot be used, so it is not counted as 0. The school shows a range of positions instead of one position.`
    );
    expect(copy.inputSentence(s, key)).toMatch(/cannot use it, so it is not counted as 0\.$/);
    expect(copy.inputSentence(s, key)).not.toContain(String(value));
  });

  it("makes the range sentence name the reading", () => {
    expect(copy.missingSentences(s, "additive_u")[0]).toMatch(
      /is (missing|not recorded)\.$|are not recorded\.$/
    );
  });
});

describe("the list route and the detail route", () => {
  it("agree on which readings are missing", () => {
    const list = clone(readFixture("results/additive_u.json")) as {
      rows: { school: { source_school_name: string }; components: Record<string, number | null> }[];
    };
    const row = list.rows.find((r) => r.school.source_school_name === "Sample School 08");
    if (!row) throw new Error("no row");
    row.components.Q = null;
    const listed = placedFromResults(parseWith(resultsResponse, list, "list")).find(
      (s) => s.name === "Sample School 08"
    );
    const detail = load(unusable("aqi_p95_selected", "Q", -4));
    expect(listed?.missing_env).toEqual(detail.missing_env);
  });

  it("still reads a blank raw value as missing", () => {
    const b = clone(readFixture(`schools/${KEYS.complete}.json`)) as Body;
    b.inputs.aqi_p95_selected = null;
    for (const r of b.rules) r.result.components.Q = null;
    const s = load(b);
    expect(s.missing_env.aqi).toBe(true);
    expect(copy.missingValueNote(s, "air")).toMatch(/^No air-quality reading is recorded for this school/);
  });
});

describe("the counts", () => {
  it("count a school with an unusable reading among those without air quality", () => {
    const s = load(unusable("aqi_p95_selected", "Q", -4));
    expect(copy.countsFrom([s]).airMissing).toBe(1);
    expect(
      copy.countsFrom([{ ...s, raw: { ...s.raw, Q_raw: 83 }, missing_env: { ...s.missing_env } }]).airMissing
    ).toBe(1);
  });
});
