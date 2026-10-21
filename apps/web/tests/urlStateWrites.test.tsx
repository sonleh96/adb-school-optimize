/**
 * Failure modes of writing a page's state into the address bar:
 *  1. A page that has just been navigated away from (its timer or effect still runs) writes its own address over
 *     the new page's, so the address bar names a page that is not on screen.
 *  2. The guard against (1) also blocks the page that is on screen from writing its own state.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useShareableUrlState } from "@/lib/urlState";

let pathname = "/all-schools";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

afterEach(() => window.history.replaceState(null, "", "/"));

describe("useShareableUrlState().replaceState", () => {
  it("writes the page's state into its own address", () => {
    pathname = "/all-schools";
    window.history.replaceState(null, "", "/all-schools");
    const { result } = renderHook(() => useShareableUrlState());

    result.current.replaceState({ score: "need" });

    expect(window.location.pathname).toBe("/all-schools");
    expect(window.location.search).not.toBe("");
  });

  it("leaves the address alone once another page has taken it", () => {
    pathname = "/all-schools";
    window.history.replaceState(null, "", "/all-schools");
    const { result } = renderHook(() => useShareableUrlState());

    // The app navigated to /screening, but the old page is still mounted for a moment.
    window.history.pushState(null, "", "/screening");
    result.current.replaceState({ score: "need" });

    expect(window.location.pathname + window.location.search).toBe("/screening");
  });
});
