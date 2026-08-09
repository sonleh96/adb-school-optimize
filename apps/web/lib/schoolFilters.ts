import type { SchoolRecord } from "@/lib/types";

export const CONFIDENCE_BANDS = ["high", "moderate", "limited"] as const;

export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export type SchoolFilters = {
  minPriority: number | null;
  minNeed: number | null;
  provinces: string[];
  stage1Only: boolean;
  confidence: ConfidenceBand | null;
};

export const EMPTY_SCHOOL_FILTERS: SchoolFilters = {
  minPriority: null,
  minNeed: null,
  provinces: [],
  stage1Only: false,
  confidence: null,
};

const MAX_PROVINCES = 24;
const MAX_PROVINCE_LENGTH = 80;
const PROVINCE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '&()./-]*$/u;

export const CONFIDENCE_BAND_LABELS: Record<ConfidenceBand, string> = {
  high: "High (90%+)",
  moderate: "Moderate (70-89%)",
  limited: "Limited (<70%)",
};

function parseThreshold(value: string): number | null {
  if (!/^(?:0|[1-9]\d?|100)$/.test(value)) return null;
  return Number(value) / 100;
}

function wholePercent(value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  const percent = Math.round(value * 100);
  return Math.abs(value - percent / 100) < 0.0000001 ? percent : null;
}

function normalizeProvinces(provinces: readonly string[]): string[] | null {
  if (provinces.length > MAX_PROVINCES) return null;
  const unique = new Set<string>();
  for (const province of provinces) {
    const normalized = province.trim().replaceAll(/\s+/g, " ");
    if (
      !normalized ||
      normalized.length > MAX_PROVINCE_LENGTH ||
      !PROVINCE_PATTERN.test(normalized) ||
      unique.has(normalized)
    ) {
      return null;
    }
    unique.add(normalized);
  }
  return [...unique].sort((left, right) => left.localeCompare(right));
}

export function normalizeSchoolFilters(filters: unknown): SchoolFilters | null {
  if (!filters || typeof filters !== "object") return null;
  const candidate = filters as Partial<SchoolFilters>;
  if (
    !Array.isArray(candidate.provinces) ||
    !candidate.provinces.every((province) => typeof province === "string")
  ) {
    return null;
  }
  if (typeof candidate.stage1Only !== "boolean") return null;
  const priorityPercent = candidate.minPriority == null ? null : wholePercent(candidate.minPriority);
  const needPercent = candidate.minNeed == null ? null : wholePercent(candidate.minNeed);
  const minPriority = priorityPercent == null ? null : priorityPercent / 100;
  const minNeed = needPercent == null ? null : needPercent / 100;
  const provinces = normalizeProvinces(candidate.provinces);
  if (
    provinces == null ||
    (candidate.minPriority != null && minPriority == null) ||
    (candidate.minNeed != null && minNeed == null)
  ) {
    return null;
  }
  if (candidate.confidence != null && !CONFIDENCE_BANDS.includes(candidate.confidence)) return null;
  return {
    minPriority,
    minNeed,
    provinces,
    stage1Only: candidate.stage1Only,
    confidence: candidate.confidence ?? null,
  };
}

/**
 * Parse the compact URL grammar in a fail-closed way.
 * The only accepted fields are priority:0-100, need:0-100, provinces:name|name,
 * stage1:1, and confidence:high|moderate|limited in any order.
 */
export function parseSchoolFilters(value: string | null): SchoolFilters {
  if (!value) return EMPTY_SCHOOL_FILTERS;
  const next: SchoolFilters = { ...EMPTY_SCHOOL_FILTERS };
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const [key, rawValue, ...rest] = part.split(":");
    if (!key || rawValue == null || rest.length > 0 || seen.has(key)) return EMPTY_SCHOOL_FILTERS;
    seen.add(key);
    if (key === "priority") {
      const threshold = parseThreshold(rawValue);
      if (threshold == null) return EMPTY_SCHOOL_FILTERS;
      next.minPriority = threshold;
      continue;
    }
    if (key === "need") {
      const threshold = parseThreshold(rawValue);
      if (threshold == null) return EMPTY_SCHOOL_FILTERS;
      next.minNeed = threshold;
      continue;
    }
    if (key === "provinces") {
      const provinces = normalizeProvinces(rawValue.split("|"));
      if (provinces == null || provinces.length === 0) return EMPTY_SCHOOL_FILTERS;
      next.provinces = provinces;
      continue;
    }
    if (key === "stage1" && rawValue === "1") {
      next.stage1Only = true;
      continue;
    }
    if (key === "confidence" && CONFIDENCE_BANDS.includes(rawValue as ConfidenceBand)) {
      next.confidence = rawValue as ConfidenceBand;
      continue;
    }
    return EMPTY_SCHOOL_FILTERS;
  }
  return next;
}

export function serializeSchoolFilters(filters: SchoolFilters): string | null {
  const normalized = normalizeSchoolFilters(filters);
  if (!normalized) return null;
  const parts: string[] = [];
  if (normalized.minPriority != null) parts.push(`priority:${wholePercent(normalized.minPriority)}`);
  if (normalized.minNeed != null) parts.push(`need:${wholePercent(normalized.minNeed)}`);
  if (normalized.provinces.length) parts.push(`provinces:${normalized.provinces.join("|")}`);
  if (normalized.stage1Only) parts.push("stage1:1");
  if (normalized.confidence) parts.push(`confidence:${normalized.confidence}`);
  return parts.length ? parts.join(",") : null;
}

export function hasActiveSchoolFilters(filters: SchoolFilters): boolean {
  return Boolean(
    filters.minPriority != null ||
    filters.minNeed != null ||
    filters.provinces.length ||
    filters.stage1Only ||
    filters.confidence
  );
}

function matchesConfidenceBand(value: number | null | undefined, band: ConfidenceBand): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  if (band === "high") return value >= 0.9;
  if (band === "moderate") return value >= 0.7 && value < 0.9;
  return value < 0.7;
}

export function createSchoolFilterPredicate(filters: SchoolFilters): (school: SchoolRecord) => boolean {
  const provinces = new Set(filters.provinces);
  return (school) => {
    if (filters.minPriority != null && (school.priority == null || school.priority < filters.minPriority)) {
      return false;
    }
    if (filters.minNeed != null && (school.need == null || school.need < filters.minNeed)) return false;
    if (provinces.size > 0 && !provinces.has(school.province)) return false;
    if (filters.stage1Only && school.stage1_selected !== true) return false;
    if (filters.confidence && !matchesConfidenceBand(school.data_confidence, filters.confidence))
      return false;
    return true;
  };
}
