/**
 * Failure modes of the method details' list logic:
 *  1. A filter hides a school it should keep, or keeps one it should hide; a blank province becomes an option.
 *  2. The export preview shows a range school among the single places, drops a row, or reads an empty score as 0.
 *  3. A preview of a file with a cell that is not a number shows NaN instead of refusing the file.
 *  4. A share is shown rounded: 12/19 as 0.63.
 *  5. The filter by what is missing shows an incomplete record under a part of school need its record has, or
 *     hides one under a part it lacks, so the chips disagree with the record's own missing-detail chips.
 *  6. The filter by what is missing hides a school that can be put in order.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { schoolsFromLists } from "@/lib/screening/copy";
import { admits, filterOptions, lacks } from "@/lib/screening/method/filters";
import { parseWith } from "@/lib/screening/schema";
import { inputsResponse } from "@/lib/screening/types";
import { MISSING_DETAILS } from "@/lib/screening/workspace/state";
import { shareText } from "@/lib/screening/method/shares";
import { TopCsvError, parseTopCsv } from "@/lib/screening/method/top-csv";
import { fileNameOf, topListOf } from "@/lib/screening/method/top-list";

import { readFixture, results } from "./fixtures";

const ROOT = path.resolve(__dirname, "../../e2e/fixtures/screening");

describe("the filter by what is missing", () => {
  const rows = results("additive_u").rows;
  const inputs = parseWith(inputsResponse, readFixture("inputs.json"), "inputs");
  const records = new Map(
    schoolsFromLists(inputs, [results("additive_u")], "additive_u").map((s) => [s.id, s])
  );

  it("keeps an incomplete record exactly when its record lacks that part of school need (5)", () => {
    const queued = rows.filter((r) => r.cohort === "verification_queue");
    let lacking = 0;
    for (const row of queued)
      for (const detail of MISSING_DETAILS) {
        const gates = records.get(row.school.school_key)!.gate_failures as readonly string[];
        expect(lacks(row, detail), `${row.school.school_key} ${detail}`).toBe(gates.includes(detail));
        expect(admits(row, { prov: null, loc: null, miss: detail })).toBe(gates.includes(detail));
        if (gates.includes(detail)) lacking += 1;
      }
    expect(lacking).toBeGreaterThan(0);
  });

  it("keeps every school that can be put in order (6)", () => {
    const ordered = rows.filter((r) => r.cohort !== "verification_queue");
    for (const detail of MISSING_DETAILS)
      expect(ordered.filter((r) => admits(r, { prov: null, loc: null, miss: detail }))).toHaveLength(
        ordered.length
      );
  });
});

describe("filters (1)", () => {
  const rows = results("additive_u").rows;

  it("keeps exactly the rows of the province and remoteness asked for", () => {
    const { provinces, localities } = filterOptions(rows);
    expect(provinces).toContain(rows[0].school.province);
    const prov = rows[0].school.province!;
    const loc = rows[0].school.locality!;
    expect(localities).toContain(loc);
    const kept = rows.filter((r) => admits(r, { prov, loc }));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((r) => r.school.province === prov && r.school.locality === loc)).toBe(true);
    expect(rows.filter((r) => admits(r, { prov: null, loc: null }))).toHaveLength(rows.length);
  });

  it("offers each value once, in order, and no blank", () => {
    const fake = (province: string | null) =>
      ({ school: { province, locality: null } }) as unknown as (typeof rows)[number];
    expect(filterOptions([fake("B"), fake(null), fake(" "), fake("A"), fake("B")]).provinces).toEqual([
      "A",
      "B",
    ]);
  });
});

describe("the top list preview (2, 3)", () => {
  const read = (file: string) => parseTopCsv(readFileSync(path.join(ROOT, file), "utf8"));

  it("splits the file's rows into single places and ranges, in the file's order", () => {
    const list = topListOf(read("exports/top_additive_u_30.csv"));
    expect(list.rule).toBe("additive_u");
    expect(list.k).toBe(30);
    expect(list.point.map((r) => r.place)).toEqual(list.point.map((_, i) => i + 1));
    expect(list.point.every((r) => r.score !== null)).toBe(true);
    expect(list.range.length).toBeGreaterThan(0);
    expect(list.range.every((r) => r.place === null && r.score === null && r.scoreLower !== null)).toBe(true);
    expect(list.fingerprints).toBe(2);
  });

  it("refuses a file whose place is not a number", () => {
    const file = parseTopCsv(
      '"# rule_id: additive_u"\n"# k: 10"\nrow_kind,school_key,source_school_name,rank_point\npoint,k1,A,first\n'
    );
    expect(() => topListOf(file)).toThrow(TopCsvError);
  });

  it("reads the file name the API gave", () => {
    expect(fileNameOf('attachment; filename="rise_png_screening_top20_additive_u.csv"')).toBe(
      "rise_png_screening_top20_additive_u.csv"
    );
    expect(fileNameOf(null)).toBeNull();
  });
});

describe("shareText (4)", () => {
  it("writes a share as two decimals only when they are exact", () => {
    expect(shareText({ component: "N", fraction: "3/5", value: 0.6 })).toBe("0.60");
    expect(shareText({ component: "N", fraction: "12/19", value: 12 / 19 })).toBe("12/19");
    expect(shareText({ component: "U", fraction: "1/20", value: 0.05 })).toBe("0.05");
  });
});
