/**
 * The top list's CSV as the API writes it (`/api/v1/screening/exports/top.csv`), read back for the export sheet's
 * preview. The sheet shows what the file holds; it never rebuilds the list in the browser.
 *
 * The file is a byte order mark, then the method record as one quoted cell per line (`"# key: value"`), then one
 * header row and the data rows, quoted only where a cell needs it. A missing value is an empty cell, never zero.
 */

export class TopCsvError extends Error {
  constructor(message: string) {
    super(`The top list file could not be read: ${message}`);
    this.name = "TopCsvError";
  }
}

/** RFC 4180 cells: quoted cells may hold commas, doubled quotes and line breaks; lines end in LF or CRLF. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") endCell();
    else if (c === "\n") endRow();
    else if (c === "\r") {
      if (text[i + 1] !== "\n") cell += c;
    } else cell += c;
  }
  if (quoted) throw new TopCsvError("a quoted cell never ends.");
  // The file ends with a line break, so the last row is already closed; anything after it is a row of its own.
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

/** One line of the method record, in the file's order. */
export interface RecordLine {
  readonly key: string;
  readonly value: string;
}

export interface TopCsv {
  readonly record: readonly RecordLine[];
  readonly columns: readonly string[];
  /** Each data row by column name. An empty cell is null: the value is unknown, not zero. */
  readonly rows: readonly Readonly<Record<string, string | null>>[];
}

const RECORD = /^# ([^:]+): ?([\s\S]*)$/;

/**
 * The record lines, the header and the rows. Only the one-cell lines before the header are the record, so a data
 * cell that happens to start with "# " (a school's name) stays data.
 */
export function parseTopCsv(text: string): TopCsv {
  const lines = csvRows(text);
  const record: RecordLine[] = [];
  let at = 0;
  for (; at < lines.length; at += 1) {
    const line = lines[at];
    const match = line.length === 1 ? RECORD.exec(line[0]) : null;
    if (!match) break;
    record.push({ key: match[1], value: match[2] });
  }
  const columns = lines[at];
  if (!columns || columns.length < 2) throw new TopCsvError("it has no header row.");
  const rows = lines.slice(at + 1).map((cells, index) => {
    if (cells.length !== columns.length)
      throw new TopCsvError(`row ${index + 1} has ${cells.length} cells, not ${columns.length}.`);
    return Object.fromEntries(columns.map((name, c) => [name, cells[c] === "" ? null : cells[c]]));
  });
  return { record, columns, rows };
}

/** The value of one record line, or null when the file has no such line. */
export const recordValue = (file: TopCsv, key: string): string | null =>
  file.record.find((line) => line.key === key)?.value ?? null;
