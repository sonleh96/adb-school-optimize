/**
 * The plain download's file. Failure modes:
 *  1. A school name or a Why line with a comma, a quote or a line break spills into the next column or line.
 *  2. A spreadsheet garbles an accented name, because the file does not say it is UTF-8.
 *  3. A cell a spreadsheet would run as a formula (a name that starts with "=") reaches it as one, including after a
 *     leading tab, carriage return or spaces, which the API's guard catches and a spreadsheet looks past.
 *  4. The lines that say what the list is spread across columns, so the method's name is cut at its comma.
 */
import { describe, expect, it } from "vitest";

import { csvRows } from "@/lib/screening/method/top-csv";
import type { SchoolKey } from "@/lib/screening/types";
import { type PlainRow, plainCsv } from "@/lib/screening/workspace/plain-list";

const COLUMNS = ["Rank", "School", "Province", "District", "Why"] as const;
const row = (over: Partial<PlainRow>): PlainRow => ({
  key: "k" as SchoolKey,
  rank: "1st",
  school: "Alder High",
  province: "North Province",
  district: "North One",
  why: "None of its 6 classrooms is built of permanent materials.",
  ...over,
});

describe("the plain download's file", () => {
  it("keeps each cell whole, whatever it holds (1)", () => {
    const tricky = row({
      school: 'St Mary\'s "Hill", Upper',
      district: "Line one\nLine two",
      why: "It has 1 teacher house for its 10 teachers, so housing counts.",
    });
    const rows = csvRows(plainCsv(["Made on 3 November 2026."], COLUMNS, [tricky]));
    expect(rows[1]).toEqual([...COLUMNS]);
    expect(rows[2]).toEqual([
      "1st",
      'St Mary\'s "Hill", Upper',
      "North Province",
      "Line one\nLine two",
      "It has 1 teacher house for its 10 teachers, so housing counts.",
    ]);
    expect(rows).toHaveLength(3);
  });

  it("starts with a byte order mark, so an accented name reads as it is (2)", () => {
    const text = plainCsv([], COLUMNS, [row({ school: "École Sainte-Zoé" })]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(csvRows(text)[1][1]).toBe("École Sainte-Zoé");
  });

  it("keeps a cell that looks like a formula as text (3)", () => {
    const rows = csvRows(plainCsv([], COLUMNS, [row({ school: "=HYPERLINK(1)" }), row({ school: "+1" })]));
    expect(rows[1][1]).toBe("'=HYPERLINK(1)");
    expect(rows[2][1]).toBe("'+1");
  });

  it("keeps a cell as text after a leading tab, carriage return or spaces, as the API's file does (3)", () => {
    // services/api/app/screening_export.py: a tab or a carriage return first, or =, +, - or @ after any whitespace.
    const formulas = ["\tplain", "\r@SUM(A1)", "  =HYPERLINK(1)", "\u00a0-2", "\t=1+1"];
    const rows = csvRows(
      plainCsv(
        [],
        COLUMNS,
        formulas.map((school) => row({ school }))
      )
    );
    expect(rows.slice(1).map((cells) => cells[1])).toEqual(formulas.map((text) => `'${text}`));
    // Spaces before an ordinary first letter are not a formula, so the name stays as written.
    expect(csvRows(plainCsv([], COLUMNS, [row({ school: "  Alder High" })]))[1][1]).toBe("  Alder High");
  });

  it("writes each line about the list as one cell (4)", () => {
    const head = ["Under the main method (Combined factors, without urgency), made on 3 November 2026."];
    expect(csvRows(plainCsv(head, COLUMNS, []))[0]).toEqual(head);
  });
});
