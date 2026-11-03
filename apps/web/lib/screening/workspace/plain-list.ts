/**
 * The list on screen as a director reads it away from the screen: the plain download and the printout. One row per
 * school, in the list's order, with the rank, the school, its province and district, and the same Why line the
 * screen shows. Built here from what the page already holds, so the file and the printout say what the screen says,
 * filter and all; the research team's full file stays the API's (`method/export.ts`).
 */
import type { BoundCopy, CopyRuleId, CopySchool } from "../copy";
import type { OrderedRow } from "../list";
import type { SchoolKey } from "../types";

export interface PlainRow {
  readonly key: SchoolKey;
  /** As the list shows it: "1st", or "12th to 18th" for a school that shows a range. */
  readonly rank: string;
  readonly school: string;
  /** Empty when the record leaves it blank. */
  readonly province: string;
  readonly district: string;
  readonly why: string;
}

/**
 * Why a school sits where it does, in one line: the input that adds most for a school with one rank; for a range
 * school, why it shows a range, naming every reading it lacks when it lacks more than one.
 */
export function whyLine(copy: BoundCopy, school: CopySchool, rule: CopyRuleId): string {
  const unread = school.cohort === "interval" ? copy.rangeRowWhy(school) : null;
  if (unread) return unread;
  return copy.topDrivers(school, rule)[0]?.sentence ?? copy.reasonSentence(school, rule);
}

const place = (copy: BoundCopy, value: string | null) => (value?.trim() ? copy.cleanName(value) : "");

/** The rows on screen, in their order, as the download and the printout write them. */
export function plainRows(
  rows: readonly OrderedRow[],
  schools: ReadonlyMap<string, CopySchool>,
  copy: BoundCopy,
  rule: CopyRuleId
): PlainRow[] {
  return rows.flatMap((row) => {
    const school = schools.get(row.school.school_key);
    if (!school) return [];
    return [
      {
        key: row.school.school_key,
        rank: copy.rowPlace(school, rule),
        school: copy.distinctName(school),
        province: place(copy, school.province),
        district: place(copy, school.district),
        why: whyLine(copy, school, rule),
      },
    ];
  });
}

/**
 * One CSV cell (RFC 4180): quoted when it holds a comma, a quote or a line break. A cell a spreadsheet would read as a
 * formula (it starts with =, +, - or @) is kept as text by a leading apostrophe.
 */
function cell(text: string): string {
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The plain download: the lines that say what the list is (each one cell, so a spreadsheet shows each across its
 * first column), then the column heads and one line per school. It starts with a byte order mark, so a spreadsheet
 * reads accented names as they are.
 */
export function plainCsv(
  head: readonly string[],
  columns: readonly [string, string, string, string, string],
  rows: readonly PlainRow[]
): string {
  const lines = [
    ...head.map(cell),
    columns.map(cell).join(","),
    ...rows.map((r) => [r.rank, r.school, r.province, r.district, r.why].map(cell).join(",")),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** The day as a file name gives it, in the reader's own time zone: 2026-11-03. */
export function isoDay(now: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** The list on screen, as the export sheet and the printout take it from the workspace. */
export interface PlainList {
  readonly rows: readonly PlainRow[];
  /** The data version of the run behind the rows. */
  readonly version: string;
  /** What the find control holds and how many schools it leaves, or null when it holds nothing. */
  readonly status: string | null;
  /** The district or province the screen shows, for the file's name; null when it shows every school. */
  readonly where: string | null;
}

/**
 * The lines every copy of the list starts with: the method, the day it was made and the data version; what the find
 * control holds, when it holds something; and the caveat.
 */
export function listHead(
  copy: BoundCopy,
  rule: CopyRuleId,
  list: Pick<PlainList, "version" | "status">,
  day: Date
): string[] {
  return [
    copy.LAYOUT.listMade(copy.rulePlainName(rule), copy.ruleLabel(rule), copy.formatDay(day), list.version),
    ...(list.status ? [list.status] : []),
    copy.STRINGS.caveatPlain,
  ];
}
