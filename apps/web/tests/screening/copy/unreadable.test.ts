/**
 * One stored input that cannot be read spoils that school's record only.
 *
 * Failure modes, each with the test that catches it:
 *  1. One school's malformed input throws, and building the copy for the list fails for every school.
 *  2. The unreadable input becomes a blank, so the record says a value is missing that is there but cannot be read.
 * Sample School 08 is given a text where its total of classrooms and its air-quality reading should be numbers.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { bindCopy, schoolFromDetail } from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { inputsResponse, schoolDetailResponse } from "@/lib/screening/types";

import { copy as clone, readFixture } from "../fixtures";
import { KEYS, RULES, fixtureResults } from "./helpers";

const lists = RULES.map((r) => fixtureResults(r));
const good = parseWith(inputsResponse, readFixture("inputs.json"), "inputs");
const spoilt = (() => {
  const body = clone(readFixture("inputs.json")) as {
    schools: { source_school_name: string; inputs: Record<string, unknown> }[];
  };
  const s08 = body.schools.find((s) => s.source_school_name === "Sample School 08");
  if (!s08) throw new Error("no Sample School 08");
  s08.inputs.total_classrooms = "many";
  s08.inputs.aqi_p95_selected = "n/a";
  return parseWith(inputsResponse, body, "inputs");
})();

describe("a list with one malformed stored input", () => {
  const base = bindCopy({ view: "additive_u", inputs: good, lists });
  const bound = bindCopy({ view: "additive_u", inputs: spoilt, lists });
  const s08 = bound.schools.find((s) => s.name === "Sample School 08") as copy.CopySchool;

  it("still gives every other school the record it had", () => {
    expect(bound.schools).toHaveLength(25);
    for (const s of bound.schools.filter((x) => x.name !== "Sample School 08")) {
      const before = base.schools.find((x) => x.id === s.id);
      expect(s, s.name ?? "").toEqual(before);
    }
  });

  it("says that school's inputs cannot be read, and not that they are blank", () => {
    expect(s08.unreadable).toEqual(["classrooms_total", "aqi"]);
    expect(bound.copy.missingSentences(s08)[0]).toBe(
      "The total number of classrooms and the air-quality reading in the record cannot be read, so they are not used."
    );
    expect(bound.copy.missingSentence(s08)).not.toMatch(/blank/);
    expect(bound.copy.missingValueNote(s08, "air")).toBe(
      "The air-quality reading in the record cannot be read, so it is not counted as 0."
    );
  });

  it("leaves the school's place alone, which the engine worked out from the data it holds", () => {
    expect(s08.cohort).toBe("complete");
    expect(bound.copy.rankSentence(s08, "additive_u")).toBe(base.copy.rankSentence(s08, "additive_u"));
  });
});

describe("a school's detail with a malformed stored input", () => {
  it("is read the same way", () => {
    const body = clone(readFixture(`schools/${KEYS.complete}.json`)) as { inputs: Record<string, unknown> };
    body.inputs.power_source = 7;
    const s = schoolFromDetail(parseWith(schoolDetailResponse, body, "school"), "additive_u");
    expect(s.unreadable).toEqual(["power_source"]);
    expect(copy.missingSentences(s)[0]).toBe(
      "The power source in the record cannot be read, so it is not used."
    );
  });
});
