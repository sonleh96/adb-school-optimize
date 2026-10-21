/**
 * Failure modes of the list area's states:
 *  1. A session that ended reads as a generic failure, so the user retries instead of signing in; a 404, a 5xx
 *     and a body the page cannot read are all worded alike.
 *  2. A background refresh fails and the good rows already on screen are replaced by an error.
 *  3. Rows of the previous rule are shown as if they belonged to the new one, with no sign they are stale.
 *  4. Nothing loaded yet and no error: the page must say it is loading, not show an empty list.
 */
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "@/lib/api";
import { classifyFailure, listView } from "@/lib/screening/errors";
import { ParseError, parseWith, str } from "@/lib/screening/schema";

const none = { hasData: false, isPlaceholderData: false, error: null };
const loaded = { hasData: true, isPlaceholderData: false, error: null };

describe("classifyFailure", () => {
  it.each([
    [new ApiRequestError("no", 401), "session"],
    [new ApiRequestError("no", 404), "not_found"],
    [new ApiRequestError("no", 500), "server"],
    [new ApiRequestError("no", 503), "server"],
    [new ApiRequestError("no", 422), "other"],
    [new SyntaxError("Unexpected token <"), "malformed"],
    [new TypeError("Failed to fetch"), "network"],
    [new Error("something"), "other"],
  ])("%s is %s", (error, expected) => {
    expect(classifyFailure(error)).toBe(expected);
  });

  it("calls a body that fails its schema malformed", () => {
    let caught: unknown;
    try {
      parseWith(str, 5, "Screening results");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ParseError);
    expect(classifyFailure(caught)).toBe("malformed");
  });
});

describe("listView", () => {
  it("is loading before anything has arrived", () => {
    expect(listView(none, none)).toEqual({ kind: "loading" });
  });

  it("is ready with fresh rows", () => {
    expect(listView(loaded, loaded)).toEqual({ kind: "ready", stale: false, refreshFailed: null });
  });

  it("marks rows stale while the next rule's rows load", () => {
    expect(listView(loaded, { ...loaded, isPlaceholderData: true })).toEqual({
      kind: "ready",
      stale: true,
      refreshFailed: null,
    });
  });

  it("keeps the rows on screen when a refresh fails, and says so", () => {
    const view = listView(loaded, { ...loaded, error: new ApiRequestError("down", 502) });
    expect(view).toEqual({ kind: "ready", stale: false, refreshFailed: "server" });
  });

  it("shows the failure when nothing was ever loaded", () => {
    expect(listView(none, { ...none, error: new ApiRequestError("expired", 401) })).toEqual({
      kind: "failed",
      failure: "session",
    });
    expect(listView({ ...none, error: new ApiRequestError("gone", 404) }, none)).toEqual({
      kind: "failed",
      failure: "not_found",
    });
  });
});
