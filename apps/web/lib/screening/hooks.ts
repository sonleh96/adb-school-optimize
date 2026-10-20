"use client";

import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";

import {
  type Pin,
  type ResultsQuery,
  fetchScreeningCompare,
  fetchScreeningResults,
  fetchScreeningRules,
  fetchScreeningSchool,
} from "./api";
import { classifyFailure } from "./errors";
import type { RuleId, SchoolKey } from "./types";

/** Retry what may pass (a failing server, a dropped connection) once; a 401, a 404 or a bad body will not improve. */
const transient = {
  retry: (failures: number, error: unknown) =>
    failures < 1 && ["server", "network"].includes(classifyFailure(error)),
  retryDelay: 400,
};

export interface RulePair {
  a: RuleId;
  b: RuleId;
}

export const screeningKeys = {
  all: ["screening"] as const,
  rules: () => ["screening", "rules"] as const,
  results: (query: ResultsQuery) => ["screening", "results", query] as const,
  school: (key: SchoolKey | null, pin: Pin) => ["screening", "school", key, pin] as const,
  compare: (pair: RulePair | null, pin: Pin) => ["screening", "compare", pair, pin] as const,
};

export function useScreeningRules() {
  return useQuery({
    queryKey: screeningKeys.rules(),
    queryFn: ({ signal }) => fetchScreeningRules(signal),
    ...transient,
  });
}

/**
 * The ordered list of one rule.
 * While another rule's list loads, the previous rows stay and `isPlaceholderData` is true, so callers can mark them stale.
 */
export function useScreeningResults(query: ResultsQuery) {
  return useQuery({
    queryKey: screeningKeys.results(query),
    queryFn: ({ signal }) => fetchScreeningResults(query, signal),
    ...transient,
    placeholderData: keepPreviousData,
  });
}

export function useScreeningSchool(key: SchoolKey | null, pin: Pin = {}) {
  return useQuery({
    queryKey: screeningKeys.school(key, pin),
    queryFn: key ? ({ signal }) => fetchScreeningSchool(key, pin, signal) : skipToken,
    ...transient,
  });
}

export function useScreeningCompare(pair: RulePair | null, pin: Pin = {}) {
  return useQuery({
    queryKey: screeningKeys.compare(pair, pin),
    queryFn: pair ? ({ signal }) => fetchScreeningCompare(pair.a, pair.b, pin, signal) : skipToken,
    ...transient,
  });
}
