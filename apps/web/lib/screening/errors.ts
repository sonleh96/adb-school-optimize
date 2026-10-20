/**
 * What went wrong with a read, in the few kinds the page tells apart. The page words each kind in plain language;
 * this only decides which kind it is.
 */
import { ApiRequestError } from "@/lib/api";

import { ParseError } from "./schema";

export type Failure =
  /** 401: the session ended, so signing in again is the way out. */
  | "session"
  /** 404: the API has no such rule, version or school. */
  | "not_found"
  /** 5xx: the API failed. */
  | "server"
  /** The API answered, but not with what the page expects. */
  | "malformed"
  /** No answer at all. */
  | "network"
  | "other";

export function classifyFailure(error: unknown): Failure {
  if (error instanceof ParseError || error instanceof SyntaxError) return "malformed";
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "session";
    if (error.status === 404) return "not_found";
    if (error.status >= 500) return "server";
    return "other";
  }
  // `fetch` rejects with a TypeError when the request never got an answer.
  if (error instanceof TypeError) return "network";
  return "other";
}

/** What the list area shows, decided from what the two reads hold. Cached data is never replaced by an error. */
export type ListView =
  | { kind: "loading" }
  | { kind: "failed"; failure: Failure }
  | {
      kind: "ready";
      /** The rows on screen belong to the previous rule while the new one loads. */
      stale: boolean;
      /** A refresh failed, but the rows on screen are still good. */
      refreshFailed: Failure | null;
    };

export interface ReadState {
  hasData: boolean;
  isPlaceholderData: boolean;
  error: unknown;
}

/**
 * `speculative` marks a list asked for before the rules named the default. While the rules are still out, its
 * failure is not yet the page's: the rules may name another rule, whose list then loads.
 */
export function listView(rules: ReadState, results: ReadState, speculative = false): ListView {
  if (results.hasData && rules.hasData) {
    return {
      kind: "ready",
      stale: results.isPlaceholderData,
      refreshFailed: results.error || rules.error ? classifyFailure(results.error ?? rules.error) : null,
    };
  }
  const error = results.error ?? rules.error;
  const awaitingRules = speculative && !rules.hasData && !rules.error;
  return error && !awaitingRules ? { kind: "failed", failure: classifyFailure(error) } : { kind: "loading" };
}

/**
 * The API holds no data at all yet: it answers a list or the inputs with a 404 whose code says so. That is the
 * empty state (one sentence and Retry), not a failure.
 */
export function isEmptyStore(error: unknown): boolean {
  return (
    error instanceof ApiRequestError && error.status === 404 && error.message.includes('"no_input_versions"')
  );
}
