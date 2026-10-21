"use client";

import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  type Pin,
  type ResultsQuery,
  fetchScreeningCompare,
  fetchScreeningInputs,
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
  inputs: (pin: Pin) => ["screening", "inputs", pin] as const,
  results: (query: ResultsQuery | null) => ["screening", "results", query] as const,
  school: (key: SchoolKey | null, pin: Pin) => ["screening", "school", key, pin] as const,
  compare: (pair: RulePair | null, pin: Pin) => ["screening", "compare", pair, pin] as const,
};

/**
 * False until `when` has held and the browser has painted what it showed. Gate heavy work on it so that work
 * starts after the first paint of what the user came for, not alongside it.
 */
export function useAfterPaint(when: boolean): boolean {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (!when || painted) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The frame callback runs just before the paint; the timeout that follows runs after it.
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => setPainted(true), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [when, painted]);
  return painted;
}

export function useScreeningRules() {
  return useQuery({
    queryKey: screeningKeys.rules(),
    queryFn: ({ signal }) => fetchScreeningRules(signal),
    ...transient,
  });
}

/**
 * The ordered list of one rule, or nothing while `query` is null.
 * While another rule's list loads, the previous rows stay and `isPlaceholderData` is true, so callers can mark them stale.
 */
export function useScreeningResults(query: ResultsQuery | null) {
  return useQuery({
    queryKey: screeningKeys.results(query),
    queryFn: query ? ({ signal }) => fetchScreeningResults(query, signal) : skipToken,
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

/** Every school's stored inputs, in one read. Nothing is asked for until `enabled`. */
export function useScreeningInputs(enabled: boolean, pin: Pin = {}) {
  return useQuery({
    queryKey: screeningKeys.inputs(pin),
    queryFn: enabled ? ({ signal }) => fetchScreeningInputs(pin, signal) : skipToken,
    ...transient,
  });
}
