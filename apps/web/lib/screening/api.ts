/**
 * Fetchers for the screening API. They go through the app's one API client, so the same-origin proxy and the
 * bearer token work as they do for every other page, and each response is parsed before anything else sees it.
 */
import { apiFetch } from "@/lib/api";

import { parseWith } from "./schema";
import {
  type CompareResponse,
  type Placement,
  type ResultsResponse,
  type RuleId,
  type RulesResponse,
  type SchoolDetailResponse,
  type SchoolKey,
  compareResponse,
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

export async function fetchScreeningRules(signal?: AbortSignal): Promise<RulesResponse> {
  const body = await apiFetch<unknown>(screeningUrl("/rules", {}), { signal });
  return parseWith(rulesResponse, body, "Screening rules");
}

export async function fetchScreeningResults(
  query: ResultsQuery,
  signal?: AbortSignal
): Promise<ResultsResponse> {
  const url = screeningUrl("/results", {
    rule: query.rule,
    placement: query.placement,
    province: query.province,
    district: query.district,
    ...pinParams(query),
  });
  return parseWith(resultsResponse, await apiFetch<unknown>(url, { signal }), "Screening results");
}

export async function fetchScreeningSchool(
  key: SchoolKey,
  pin: Pin = {},
  signal?: AbortSignal
): Promise<SchoolDetailResponse> {
  const url = screeningUrl(`/schools/by-key/${encodeURIComponent(key)}`, pinParams(pin));
  return parseWith(schoolDetailResponse, await apiFetch<unknown>(url, { signal }), "Screening school");
}

export async function fetchScreeningCompare(
  a: RuleId,
  b: RuleId,
  pin: Pin = {},
  signal?: AbortSignal
): Promise<CompareResponse> {
  const url = screeningUrl("/compare", { a, b, ...pinParams(pin) });
  return parseWith(compareResponse, await apiFetch<unknown>(url, { signal }), "Screening comparison");
}
