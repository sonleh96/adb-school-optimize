"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  type Pin,
  type ResultsQuery,
  fetchScreeningCompare,
  fetchScreeningResults,
  fetchScreeningRules,
  fetchScreeningSchool,
} from "./api";
import type { RuleId, SchoolKey } from "./types";

export interface RulePair {
  a: RuleId;
  b: RuleId;
}

export const screeningKeys = {
  all: ["screening"] as const,
  rules: () => ["screening", "rules"] as const,
  results: (query: ResultsQuery | null) => ["screening", "results", query] as const,
  school: (key: SchoolKey | null, pin: Pin) => ["screening", "school", key, pin] as const,
  compare: (pair: RulePair | null, pin: Pin) => ["screening", "compare", pair, pin] as const,
};

export function useScreeningRules() {
  return useQuery({
    queryKey: screeningKeys.rules(),
    queryFn: ({ signal }) => fetchScreeningRules(signal),
  });
}

/**
 * The ordered list of one rule. Pass `null` until the rule is known.
 * While another rule's list loads, the previous rows stay and `isPlaceholderData` is true, so callers can mark them stale.
 */
export function useScreeningResults(query: ResultsQuery | null) {
  return useQuery({
    queryKey: screeningKeys.results(query),
    queryFn: ({ signal }) => fetchScreeningResults(query!, signal),
    enabled: query !== null,
    placeholderData: keepPreviousData,
  });
}

export function useScreeningSchool(key: SchoolKey | null, pin: Pin = {}) {
  return useQuery({
    queryKey: screeningKeys.school(key, pin),
    queryFn: ({ signal }) => fetchScreeningSchool(key!, pin, signal),
    enabled: key !== null,
  });
}

export function useScreeningCompare(pair: RulePair | null, pin: Pin = {}) {
  return useQuery({
    queryKey: screeningKeys.compare(pair, pin),
    queryFn: ({ signal }) => fetchScreeningCompare(pair!.a, pair!.b, pin, signal),
    enabled: pair !== null,
  });
}
