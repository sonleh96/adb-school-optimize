/**
 * Failure modes of the list helpers, run on the rows the API really sent:
 *  1. The wrong order for range or queue schools: a range school must stay where the API put it, between
 *     the complete schools, and the incomplete records must keep their order, whatever the cohort mix.
 *  2. An interval school shown with a single place, or a place number shown where there is none.
 *  3. Ordinals wrong in the teens (11th, 12th, 13th) or after a hundred.
 *  4. A selection that outlives its school after a rule change, or arrow keys that run off the list.
 *  5. The list and the card disagree about which tab holds a school.
 */
import { describe, expect, it } from "vitest";

import {
  groupByProvince,
  neighbour,
  ordinal,
  placeLabel,
  placeOf,
  reconcileSelection,
  splitRows,
  tabOf,
} from "@/lib/screening/list";
import type { SchoolKey } from "@/lib/screening/types";

import { results } from "./fixtures";

const names = (rows: ReadonlyArray<{ school: { source_school_name: string } }>) =>
  rows.map((row) => row.school.source_school_name);
const key = (value: string) => value as SchoolKey;

describe("splitRows", () => {
  it("keeps the API's order and leaves range schools between complete ones", () => {
    const { ordered, incomplete } = splitRows(results("additive_u").rows);
    expect(names(ordered)).toEqual([
      "Sample School 08",
      "Sample School 15",
      "Sample School 13",
      "Sample School 16",
      "Sample School 12",
      "Sample School 03",
      "Sample School 07",
      "Sample School 11",
      "Sample School 10",
      "Sample School 09",
      "Sample School 02",
      "Sample School 05",
      "Sample School 06",
      "Sample School 01",
      "Sample School 17",
      "Sample School 04",
      "Sample School 18",
      "Sample School 19",
      "Sample School 14",
      "Café Sample 20",
    ]);
    expect(names(incomplete)).toEqual([
      "Sample School 21",
      "Sample School 22",
      "Sample School 23",
      "Sample School 24",
    ]);
  });

  it("follows the rule: a school whose only gap is urgency moves from incomplete to the list", () => {
    const { ordered, incomplete } = splitRows(results("additive_no_u").rows);
    expect(names(incomplete)).toEqual(["Sample School 21", "Sample School 22", "Sample School 24"]);
    expect(names(ordered)).toContain("Sample School 23");
  });

  it("does not reorder rows that arrive with the cohorts mixed", () => {
    const rows = results("additive_u").rows;
    const mixed = [rows[21], rows[14], rows[0], rows[22], rows[16]];
    const { ordered, incomplete } = splitRows(mixed);
    expect(names(ordered)).toEqual(["Sample School 17", "Sample School 08", "Sample School 18"]);
    expect(names(incomplete)).toEqual(["Sample School 22", "Sample School 23"]);
  });
});

describe("placeOf and placeLabel", () => {
  const rows = results("additive_u").rows;
  const byName = (name: string) => rows.find((row) => row.school.source_school_name === name)!;

  it("gives a complete school one exact place among the complete schools", () => {
    const place = placeOf(byName("Sample School 08"));
    expect(place).toEqual({ kind: "point", rank: 1, of: 16 });
    expect(placeLabel(place)).toBe("1st");
  });

  it("gives an interval school a range, never a single place", () => {
    const place = placeOf(byName("Sample School 17"));
    expect(place).toEqual({ kind: "range", best: 11, worst: 18, of: 20 });
    expect(placeLabel(place)).toBe("11th to 18th");
  });

  it("gives an incomplete record no place", () => {
    const place = placeOf(byName("Sample School 21"));
    expect(place).toEqual({ kind: "none" });
    expect(placeLabel(place)).toBe("");
  });

  it("reads equal bounds as one place", () => {
    expect(placeLabel({ kind: "range", best: 5, worst: 5, of: 20 })).toBe("5th");
  });

  it("reflects the other end of the range when the list places range schools by their upper score", () => {
    const upper = results("additive_u", true).rows.find(
      (r) => r.school.source_school_name === "Sample School 17"
    )!;
    expect(upper.placement).toBe("upper");
    expect(placeLabel(placeOf(upper))).toBe("11th to 18th");
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [101, "101st"],
    [111, "111th"],
    [112, "112th"],
    [120, "120th"],
  ])("%i is %s", (n, expected) => {
    expect(ordinal(n)).toBe(expected);
  });
});

describe("groupByProvince", () => {
  it("groups the incomplete records by province in order of first appearance", () => {
    const groups = groupByProvince(splitRows(results("additive_u").rows).incomplete);
    expect(groups.map((g) => [g.province, names(g.rows)])).toEqual([
      ["North Province", ["Sample School 21", "Sample School 22"]],
      ["South Province", ["Sample School 23", "Sample School 24"]],
    ]);
  });
});

describe("selection", () => {
  const rows = results("additive_u").rows;
  const first = rows[0].school.school_key;
  const last = rows[rows.length - 1].school.school_key;

  it("keeps a school the rows hold and drops one they do not", () => {
    expect(reconcileSelection(first, rows)).toBe(first);
    expect(reconcileSelection(key("gone"), rows)).toBeNull();
    expect(reconcileSelection(null, rows)).toBeNull();
  });

  it("moves one row at a time and stops at both ends", () => {
    expect(neighbour(rows, first, 1)).toBe(rows[1].school.school_key);
    expect(neighbour(rows, first, -1)).toBe(first);
    expect(neighbour(rows, last, 1)).toBe(last);
  });

  it("starts at the top going down and at the bottom going up when nothing is selected", () => {
    expect(neighbour(rows, null, 1)).toBe(first);
    expect(neighbour(rows, null, -1)).toBe(last);
    expect(neighbour([], null, 1)).toBeNull();
  });

  it("names the tab that holds a school", () => {
    expect(tabOf(rows[0])).toBe("ordered");
    expect(tabOf(rows[rows.length - 1])).toBe("incomplete");
  });
});
