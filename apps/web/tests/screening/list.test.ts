/**
 * Failure modes of the list helpers, run on the rows the API really sent:
 *  1. The wrong order for range or queue schools: a range school must stay where the API put it, between
 *     the complete schools, and the incomplete records must keep their order, whatever the cohort mix.
 *  2. An interval school shown with a single position, or a place number shown where there is none.
 *     A range whose ends are equal is still a range: it must not read as a plain place.
 *  3. A place without the scope it was counted in.
 *  4. Ordinals wrong in the teens (11th, 12th, 13th) or after a hundred.
 *  5. A selection that outlives its school after a rule change, or arrow keys that run off the list.
 *  6. Arrow keys that follow the order the API sent instead of the order on screen, when the incomplete records
 *     are grouped by province and the provinces interleave.
 *  7. The list and the card disagree about which tab holds a school.
 */
import { describe, expect, it } from "vitest";

import {
  groupByProvince,
  incompleteInDisplayOrder,
  neighbour,
  ordinal,
  placeLabel,
  placeOf,
  reconcileSelection,
  splitRows,
  tabOf,
} from "@/lib/screening/list";
import type { QueuedRow, SchoolKey } from "@/lib/screening/types";

import { copy, results } from "./fixtures";

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
      "Sample School 14",
      "Sample School 19",
      "Café Sample 20",
      "Sample School 25",
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
    const byName = (name: string) => rows.find((row) => row.school.source_school_name === name)!;
    const mixed = [
      "Sample School 22",
      "Sample School 17",
      "Sample School 08",
      "Sample School 23",
      "Sample School 18",
    ];
    const { ordered, incomplete } = splitRows(mixed.map(byName));
    expect(names(ordered)).toEqual(["Sample School 17", "Sample School 08", "Sample School 18"]);
    expect(names(incomplete)).toEqual(["Sample School 22", "Sample School 23"]);
  });
});

describe("placeOf and placeLabel", () => {
  const rows = results("additive_u").rows;
  const byName = (name: string) => rows.find((row) => row.school.source_school_name === name)!;

  it("gives a complete school one exact place, with the scope it is counted in", () => {
    const place = placeOf(byName("Sample School 08"));
    expect(place).toEqual({ kind: "point", rank: 1, of: 16, scope: "complete under this rule (16)" });
    expect(placeLabel(place)).toBe("1st");
  });

  it("gives an interval school a range, never a single position", () => {
    const place = placeOf(byName("Sample School 17"));
    expect(place).toEqual({
      kind: "range",
      best: 11,
      worst: 18,
      of: 21,
      scope: "eligible (21)",
      exact: false,
    });
    expect(placeLabel(place)).toBe("11th to 18th");
  });

  it("keeps the range treatment when both ends are the same position, and says it is exact", () => {
    const place = placeOf(byName("Sample School 25"));
    expect(place).toEqual({
      kind: "range",
      best: 21,
      worst: 21,
      of: 21,
      scope: "eligible (21)",
      exact: true,
    });
    // The text is the one position; a caller shows it as a range, with the exact note, because kind stays "range".
    expect(placeLabel(place)).toBe("21st");
    expect(place.kind).not.toBe("point");
  });

  it("gives an incomplete record no place", () => {
    const place = placeOf(byName("Sample School 21"));
    expect(place).toEqual({ kind: "none" });
    expect(placeLabel(place)).toBe("");
  });

  it("keeps a range school's bounds under the upper placement", () => {
    const upper = results("additive_u", true).rows.find(
      (r) => r.school.source_school_name === "Sample School 17"
    )!;
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

describe("incomplete records by province", () => {
  const incomplete = splitRows(results("additive_u").rows).incomplete;

  /** The API sorts the queue by province, so real input is contiguous; swap provinces to interleave it. */
  function interleaved(): QueuedRow[] {
    const rows = copy(incomplete);
    rows.forEach((row, index) => {
      row.school.province = index % 2 === 0 ? "North Province" : "South Province";
    });
    return rows;
  }

  it("groups in order of first appearance", () => {
    expect(groupByProvince(incomplete).map((g) => [g.province, names(g.rows)])).toEqual([
      ["North Province", ["Sample School 21", "Sample School 22"]],
      ["South Province", ["Sample School 23", "Sample School 24"]],
    ]);
  });

  it("lists the rows in the order the groups show them when the provinces interleave", () => {
    const rows = interleaved();
    expect(names(rows)).toEqual([
      "Sample School 21",
      "Sample School 22",
      "Sample School 23",
      "Sample School 24",
    ]);
    expect(names(incompleteInDisplayOrder(rows))).toEqual([
      "Sample School 21",
      "Sample School 23",
      "Sample School 22",
      "Sample School 24",
    ]);
  });

  it("moves the arrow keys through that on-screen order, not the order the rows arrived in", () => {
    const order = incompleteInDisplayOrder(interleaved());
    const first = order[0].school.school_key;
    expect(names([order.find((r) => r.school.school_key === neighbour(order, first, 1))!])).toEqual([
      "Sample School 23",
    ]);
    // Walking the whole list visits every row once, in the shown order.
    const walked: string[] = [];
    let at: string | null = first;
    for (let step = 0; step < order.length; step += 1) {
      walked.push(order.find((r) => r.school.school_key === at)!.school.source_school_name);
      at = neighbour(order, at, 1);
    }
    expect(walked).toEqual(["Sample School 21", "Sample School 23", "Sample School 22", "Sample School 24"]);
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
