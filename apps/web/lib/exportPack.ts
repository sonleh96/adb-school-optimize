import { CONFIDENCE_BAND_LABELS, type SchoolFilters } from "@/lib/schoolFilters";
import type { SchoolRecord } from "@/lib/types";

type CsvColumn = {
  label: string;
  value: (school: SchoolRecord) => string;
  protectFormula?: boolean;
};

const CSV_COLUMNS: CsvColumn[] = [
  { label: "rank_priority", value: (school) => asInteger(school.rank_priority) },
  { label: "rank_need", value: (school) => asInteger(school.rank_need) },
  { label: "school_id", value: (school) => school.school_id ?? "", protectFormula: true },
  { label: "school_name", value: (school) => school.school_name, protectFormula: true },
  { label: "locality", value: (school) => school.locality ?? "", protectFormula: true },
  { label: "district", value: (school) => school.district, protectFormula: true },
  { label: "province", value: (school) => school.province, protectFormula: true },
  { label: "priority", value: (school) => asDecimal(school.priority) },
  { label: "need", value: (school) => asDecimal(school.need) },
  { label: "data_confidence", value: (school) => asDecimal(school.data_confidence) },
  {
    label: "stage1_selected",
    value: (school) => (school.stage1_selected == null ? "" : school.stage1_selected ? "true" : "false"),
  },
  { label: "latitude", value: (school) => asDecimal(school.latitude) },
  { label: "longitude", value: (school) => asDecimal(school.longitude) },
];

type ZipInput = Blob | Uint8Array | string;

export type BriefingFootnoteOptions = {
  generatedAt: Date;
  scenarioId: string | null;
  scenarioName: string | null;
  scoreField: "priority" | "need";
  filters: SchoolFilters;
  selectedSchool: SchoolRecord | null;
  activeBookmarkName: string | null;
  methodologyUrl: string;
};

export type ZipFile = {
  name: string;
  data: ZipInput;
};

function asInteger(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? String(Math.round(value)) : "";
}

function asDecimal(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? value.toFixed(6) : "";
}

function protectSpreadsheetFormula(value: string): string {
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: string, protectFormula = false): string {
  const safeValue = protectFormula ? protectSpreadsheetFormula(value) : value;
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replaceAll('"', '""')}"` : safeValue;
}

/** RFC 4180 compatible, UTF-8-friendly CSV for the exact displayed school subset. */
export function buildSchoolsCsv(schools: readonly SchoolRecord[]): string {
  const header = CSV_COLUMNS.map((column) => escapeCsvCell(column.label)).join(",");
  const rows = schools.map((school) =>
    CSV_COLUMNS.map((column) => escapeCsvCell(column.value(school), column.protectFormula)).join(",")
  );
  return `${[header, ...rows].join("\r\n")}\r\n`;
}

export function describeSchoolFilters(filters: SchoolFilters): string {
  const parts: string[] = [];
  if (filters.minPriority != null) parts.push(`Priority ≥ ${Math.round(filters.minPriority * 100)}%`);
  if (filters.minNeed != null) parts.push(`Need ≥ ${Math.round(filters.minNeed * 100)}%`);
  if (filters.provinces.length) parts.push(`Provinces: ${filters.provinces.join(", ")}`);
  if (filters.stage1Only) parts.push("Stage 1 screening only");
  if (filters.confidence) parts.push(`Data confidence: ${CONFIDENCE_BAND_LABELS[filters.confidence]}`);
  return parts.length ? parts.join("; ") : "No active filters";
}

export function buildBriefingFootnote(options: BriefingFootnoteOptions): string {
  const selectedSchool = options.selectedSchool
    ? `${options.selectedSchool.school_name}${options.selectedSchool.school_id ? ` (${options.selectedSchool.school_id})` : ""}`
    : "None";
  const scenario = options.scenarioId
    ? options.scenarioName
      ? `${options.scenarioName} (${options.scenarioId})`
      : options.scenarioId
    : "Default scoring run";
  return [
    "RISE-PNG briefing pack",
    `Generated (UTC): ${options.generatedAt.toISOString()}`,
    `Scenario: ${scenario}`,
    `Marker and ranking score: ${options.scoreField === "priority" ? "Priority" : "Need"}`,
    `Active filters: ${describeSchoolFilters(options.filters)}`,
    `Current selection: ${selectedSchool}`,
    `Active briefing stop: ${options.activeBookmarkName ?? "None"}`,
    "Methodology: school scores combine documented need, impact potential, and practicality inputs.",
    `Methodology URL: ${options.methodologyUrl}`,
  ].join("\n");
}

function crc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

const CRC32_TABLE = crc32Table();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function uint16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function uint32(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

async function toBytes(value: ZipInput): Promise<Uint8Array> {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(await value.arrayBuffer());
}

function dosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

/** Creates a small standards-compliant, uncompressed ZIP with CRC32 records and no dependency. */
export async function createStoreZip(files: readonly ZipFile[], date = new Date()): Promise<Blob> {
  if (files.length > 0xffff) throw new Error("Briefing pack has too many files for browser ZIP export.");
  const encoder = new TextEncoder();
  const { date: dosDate, time: dosTime } = dosDateTime(date);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const content = await toBytes(file.data);
    if (name.length > 0xffff || content.length > 0xffffffff || offset > 0xffffffff) {
      throw new Error("Briefing pack is too large for browser ZIP export.");
    }
    const checksum = crc32(content);
    const local = concatBytes([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(content.length),
      uint32(content.length),
      uint16(name.length),
      uint16(0),
      name,
      content,
    ]);
    localParts.push(local);
    centralParts.push(
      concatBytes([
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0x0800),
        uint16(0),
        uint16(dosTime),
        uint16(dosDate),
        uint32(checksum),
        uint32(content.length),
        uint32(content.length),
        uint16(name.length),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(offset),
        name,
      ])
    );
    offset += local.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = concatBytes([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0),
  ]);
  const archive = concatBytes([...localParts, centralDirectory, end]);
  return new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" });
}

export function exportFilename(prefix: string, date: Date, extension: string): string {
  return `${prefix}-${date.toISOString().replace(/[:.]/g, "-")}.${extension}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
