/**
 * Fetchers for the screening API. They go through the app's one API client, so the same-origin proxy and the
 * bearer token work as they do for every other page, and each response is parsed before anything else sees it.
 */
import { apiFetch } from "@/lib/api";

import { ParseError, type Schema, parseWith } from "./schema";
import {
  type CompareResponse,
  type InputsResponse,
  type Placement,
  type ResultsResponse,
  type RuleId,
  type RulesResponse,
  type SchoolDetailResponse,
  type SchoolKey,
  compareResponse,
  inputsResponse,
  resultsResponse,
  rulesResponse,
  schoolDetailResponse,
} from "./types";

const BASE = "/api/v1/screening";

/** Which stored data a read is about. Both are optional: without them the API answers for its newest data. */
export interface Pin {
  inputVersion?: string;
  packageVersion?: string;
}

export interface ResultsQuery extends Pin {
  rule: RuleId;
  placement?: Placement;
  province?: string;
  district?: string;
}

/** `path` plus the parameters that are set, in a fixed order so equal reads make equal URLs. */
export function screeningUrl(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(name, value);
  }
  const query = search.toString();
  return `${BASE}${path}${query ? `?${query}` : ""}`;
}

const pinParams = (pin: Pin) => ({ input_version: pin.inputVersion, package_version: pin.packageVersion });

/**
 * One read: fetch, then parse before anything else sees the body. A body that is not JSON or does not match the
 * schema is logged to the console, where a developer looks first, and thrown for the page to show in plain words.
 */
async function read<T>(schema: Schema<T>, url: string, label: string, signal?: AbortSignal): Promise<T> {
  let body: unknown;
  try {
    body = await apiFetch<unknown>(url, { signal });
  } catch (error) {
    if (error instanceof SyntaxError) console.error(`${label}: the response was not JSON.`, error);
    throw error;
  }
  try {
    return parseWith(schema, body, label);
  } catch (error) {
    if (error instanceof ParseError) console.error(error);
    throw error;
  }
}

export function fetchScreeningRules(signal?: AbortSignal): Promise<RulesResponse> {
  return read(rulesResponse, screeningUrl("/rules", {}), "Screening rules", signal);
}

export function fetchScreeningResults(query: ResultsQuery, signal?: AbortSignal): Promise<ResultsResponse> {
  const url = screeningUrl("/results", {
    rule: query.rule,
    placement: query.placement,
    province: query.province,
    district: query.district,
    ...pinParams(query),
  });
  return read(resultsResponse, url, "Screening results", signal);
}

export function fetchScreeningSchool(
  key: SchoolKey,
  pin: Pin = {},
  signal?: AbortSignal
): Promise<SchoolDetailResponse> {
  const url = screeningUrl(`/schools/by-key/${encodeURIComponent(key)}`, pinParams(pin));
  return read(schoolDetailResponse, url, "Screening school", signal);
}

export function fetchScreeningCompare(
  a: RuleId,
  b: RuleId,
  pin: Pin = {},
  signal?: AbortSignal
): Promise<CompareResponse> {
  const url = screeningUrl("/compare", { a, b, ...pinParams(pin) });
  return read(compareResponse, url, "Screening comparison", signal);
}

/** Every school's stored inputs in one read, so a list needs no request per school. */
export function fetchScreeningInputs(pin: Pin = {}, signal?: AbortSignal): Promise<InputsResponse> {
  const url = screeningUrl("/inputs", { input_version: pin.inputVersion });
  return read(inputsResponse, url, "Screening inputs", signal);
}
