/**
 * Failure modes of reading the top list's CSV back for the export sheet's preview:
 *  1. A name holding a comma, a quote or a line break splits into extra cells or rows.
 *  2. The byte order mark sticks to the first record key, so the record's first line cannot be found by name.
 *  3. A record value that itself holds ": " (a formula, a caveat) is cut at the wrong colon.
 *  4. An empty cell (an unknown value) reads as "0" or as an empty string a number parser turns into 0.
 *  5. A data cell that starts with "# " is taken for a record line, and the list loses a school.
 *  6. A file cut short or misaligned is shown as if whole.
 *  7. Line ends written as CRLF (a file saved again on Windows) leave a carriage return in the last cell.
 *  8. The files the API really wrote do not read back: every saved top list parses, its record comes first and
 *     says which rule and length it holds, and its row count is what the record says it listed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TopCsvError, csvRows, parseTopCsv, recordValue } from "@/lib/screening/method/top-csv";

import { DATASETS, fixtureIndex } from "./fixtures";

const ROOT = path.resolve(__dirname, "../../e2e/fixtures/screening");

const FILE = [
  '﻿"# export: top schools"',
  '"# formula: S = 0.60N + 0.15A: shares"',
  '"# caveat: A ""quoted"" word"',
  "row_kind,source_school_name,score_point,rank_point",
  'point,"Name, with comma",0.5,1',
  'point,"Two ""quoted"" words",,2',
  'point,"Line\nbreak",0.25,3',
  "point,# Hash School,0.125,4",
  "",
].join("\n");

describe("parseTopCsv", () => {
  const parsed = parseTopCsv(FILE);

  it("keeps a comma, a doubled quote and a line break inside one cell (1)", () => {
    expect(parsed.rows.map((r) => r.source_school_name)).toEqual([
      "Name, with comma",
      'Two "quoted" words',
      "Line\nbreak",
      "# Hash School",
    ]);
  });

  it("drops the byte order mark, so the first record key is found by name (2)", () => {
    expect(parsed.record[0]).toEqual({ key: "export", value: "top schools" });
    expect(recordValue(parsed, "export")).toBe("top schools");
  });

  it("cuts a record line at its first colon only, and undoubles its quotes (3)", () => {
    expect(recordValue(parsed, "formula")).toBe("S = 0.60N + 0.15A: shares");
    expect(recordValue(parsed, "caveat")).toBe('A "quoted" word');
  });

  it("reads an empty cell as unknown, never as zero (4)", () => {
    expect(parsed.rows[1].score_point).toBeNull();
    expect(parsed.rows[0].score_point).toBe("0.5");
  });

  it("keeps a data row that starts with a hash as data (5)", () => {
    expect(parsed.record).toHaveLength(3);
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[3].rank_point).toBe("4");
  });

  it("refuses a misaligned row and an unterminated quote (6)", () => {
    expect(() => parseTopCsv("a,b\n1,2,3\n")).toThrow(TopCsvError);
    expect(() => parseTopCsv('a,b\n"1,2\n')).toThrow(TopCsvError);
    expect(() => parseTopCsv('"# only: a record"\n')).toThrow(TopCsvError);
  });

  it("reads CRLF line ends as LF (7)", () => {
    expect(csvRows("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

// The empty dataset has no list to export; its saved answer is the API's refusal, which parse.test.ts checks.
const WITH_DATA = DATASETS.filter((d) => d !== "empty");
describe.each(WITH_DATA)("the top lists the API wrote, dataset %j (8)", (dataset) => {
  const files = fixtureIndex(dataset).requests.filter((r) => r.headers);
  it.each(files.map((r) => [r.file, r] as const))("%s reads back whole", (_file, request) => {
    const text = readFileSync(path.join(ROOT, dataset, request.file), "utf8");
    expect(request.headers!["content-type"]).toBe("text/csv; charset=utf-8");
    const file = parseTopCsv(text);
    expect(file.record[0]).toEqual({ key: "export", value: "top schools" });
    expect(recordValue(file, "rule_id")).toBe(request.query.rule);
    expect(recordValue(file, "k")).toBe(request.query.k);
    const listed = /^point=(\d+), range=(\d+)$/.exec(recordValue(file, "rows_listed") ?? "");
    expect(listed).not.toBeNull();
    expect(file.rows).toHaveLength(Number(listed![1]) + Number(listed![2]));
    expect(file.rows.filter((r) => r.row_kind === "point")).toHaveLength(Number(listed![1]));
  });
});
