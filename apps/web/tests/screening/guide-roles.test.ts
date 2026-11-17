/**
 * Failure modes of teaching schools and the guides on offer (R13):
 *  1. The example depends on the order the API sent the schools, not on their places, so it changes between loads.
 *  2. The incomplete-record example is a school with only blanks when one with a recorded 0 exists (the guide's
 *     point is that a recorded 0 needs checking).
 *  3. A guide whose subject the data lacks is still offered, so it runs on nothing; or one the data can teach is not.
 *  4. Roles are read before the paper's main rule's list has loaded and settle on the wrong schools.
 *  5. A help card's example is the school already open in the card beside it.
 */
import { describe, expect, it } from "vitest";

import { copyFor } from "@/lib/screening/copy";
import { besides, catalogOf, planOf, rolesOf } from "@/lib/screening/guide/roles";

import { school } from "./copy/helpers";

const copy = copyFor({});
const FEATURES = { export: false, grouping: true, urgencyRule: true };

const third = school({ id: "c3", place: 3 });
const first = school({ id: "c1", place: 1 });
const second = school({ id: "c2", place: 2 });
const wideRange = school({ id: "r2", cohort: "interval", bounds: [9, 30], blank: ["aqi"] });
const earlyRange = school({ id: "r1", cohort: "interval", bounds: [4, 12], blank: ["aqi"] });
const blankOnly = school({
  id: "q1",
  cohort: "queue",
  province: "Alpha",
  gate: ["permanent_classroom_deficit"],
  condition: { classrooms_total: null, classrooms_permanent: null },
});
const recordedZero = school({
  id: "q2",
  cohort: "queue",
  province: "Beta",
  gate: ["permanent_classroom_deficit"],
  condition: { classrooms_total: 0, classrooms_permanent: 0 },
});

describe("teaching schools", () => {
  it("chooses by place and range, whatever order the schools arrive in", () => {
    for (const order of [
      [third, wideRange, first, recordedZero, second, earlyRange, blankOnly],
      [blankOnly, earlyRange, second, recordedZero, first, wideRange, third],
    ]) {
      const roles = rolesOf(order, copy)!;
      expect(roles.complete.map((s) => s.id)).toEqual(["c1", "c2", "c3"]);
      expect(roles.ranges.map((s) => s.id)).toEqual(["r1", "r2"]);
      expect(roles.incomplete.map((s) => s.id)).toEqual(["q1", "q2"]);
    }
  });

  it("prefers an incomplete record with a recorded 0 over one with only blanks", () => {
    expect(rolesOf([first, blankOnly, recordedZero], copy)!.missing?.id).toBe("q2");
    expect(rolesOf([first, blankOnly], copy)!.missing?.id).toBe("q1");
  });

  it("waits for the paper's main rule's list", () => {
    const elsewhere = { ...first, results: { benchmark: first.results!.benchmark } };
    expect(rolesOf([elsewhere], copy)).toBeNull();
  });

  it("gives a help card the next school of the role when the first is open in the card", () => {
    expect(besides([first, second], "c1")?.id).toBe("c2");
    expect(besides([first, second], "c9")?.id).toBe("c1");
    expect(besides([first], "c1")?.id).toBe("c1");
  });
});

describe("the guides on offer", () => {
  it("offers all five when the data has every kind of school", () => {
    const roles = rolesOf([first, second, earlyRange, recordedZero], copy)!;
    expect(catalogOf(planOf(roles, FEATURES))).toEqual([
      { id: "q1", steps: 3 },
      { id: "q2", steps: 3 },
      { id: "q3", steps: 3 },
      { id: "q4", steps: 3 },
      { id: "q5", steps: 4 },
    ]);
  });

  it("hides the range and incomplete-record guides on data with one complete school", () => {
    const plan = planOf(rolesOf([first], copy)!, FEATURES);
    expect(catalogOf(plan).map((g) => g.id)).toEqual(["q1", "q2", "q5"]);
    expect(plan.q5).toEqual(["agree", "why", "use"]);
  });

  it("drops the grouping step until the screen can group incomplete records", () => {
    const roles = rolesOf([first, recordedZero], copy)!;
    expect(planOf(roles, { ...FEATURES, grouping: false }).q4).toEqual(["list", "school"]);
  });

  it("adds the download step once the export is on screen, and drops guide 5 without the rule with urgency", () => {
    const roles = rolesOf([first], copy)!;
    expect(planOf(roles, { export: true, grouping: true, urgencyRule: false })).toEqual({
      q1: ["first", "rule", "map", "download"],
      q2: ["why", "need", "adds"],
    });
  });
});
