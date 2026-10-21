/**
 * Failure mode: the script that sets the rail's width before the first paint decides differently from the store
 * that takes over after it, so the screen moves sideways once the page runs (a layout shift), or a rail opens where
 * none should. The script is generated text, so it is held to the store's own decision over every case that matters.
 */
import { describe, expect, it } from "vitest";

import { railBootScript, railWidth } from "@/lib/screening/guide/layout";
import { MEMORY_KEY, parseMemory, stateFromSearch } from "@/lib/screening/guide/machine";

/** Runs the script against a pretend window and returns the width it set, or 0. */
function boot(width: number, search: string, stored: string | null): number {
  let set = "0px";
  const env = {
    innerWidth: width,
    location: { search },
    localStorage: { getItem: (key: string) => (key === MEMORY_KEY ? stored : null) },
    document: { documentElement: { style: { setProperty: (_: string, value: string) => (set = value) } } },
  };
  new Function("innerWidth", "location", "localStorage", "document", railBootScript())(
    env.innerWidth,
    env.location,
    env.localStorage,
    env.document
  );
  return Number.parseInt(set, 10);
}

/** What the store decides once the page runs. */
function store(width: number, search: string, stored: string | null): number {
  const state = stateFromSearch(search, parseMemory(stored));
  return railWidth(width, state.rail.kind !== "off", state.present);
}

const RETURNING = JSON.stringify({ seen: true, done: ["q1"], last: null });
const SEARCHES = [
  "",
  "?guide=start",
  "?guide=off",
  "?guide=q3&gstep=2",
  "?guide=q2&gstep=1&present=1",
  "?guide=views&gstep=2&present=1",
  "?guide=views&gstep=1",
  "?guide=start&present=1",
  "?guide=q9",
  "?school=k1&help=1",
];

describe("the rail's width before the first paint", () => {
  for (const width of [1600, 1499, 1280, 1024, 1023, 768])
    for (const stored of [null, RETURNING, "{broken"])
      it(`agrees with the store at ${width} px, ${stored ? "returning" : "first visit"}`, () => {
        for (const search of SEARCHES)
          expect(boot(width, search, stored), search).toBe(store(width, search, stored));
      });
});
