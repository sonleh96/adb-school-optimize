/**
 * Failure modes of the guidance layers' state:
 *  1. Next or Page Down at a guide's last step does not open the next guide, or forgets to count the guide as seen.
 *  2. Next at the last guide's last step leaves the rail open, or the guide uncounted.
 *  3. Back at a first step jumps into another guide when not presenting; Page Up at a first step does not return
 *     to the previous guide's last step; either moves before the first guide.
 *  4. Skip does not count the guide as seen (the spec: "Skip closes and marks the guide seen").
 *  5. Presenting outlives the rail: it survives closing or going back to the start list.
 *  6. A returning user is taught twice (the rail opens with no link asking for it), or a first visit starts closed.
 *  7. A pasted link does not land on its step, or loses the help card, glossary search or page.
 *  8. A link to a guide the data cannot teach, or a step past its end, leaves the rail on nothing.
 *  9. Writing the layer keys drops the workspace's keys, a first visit's address carries the start list it opens
 *     on anyway, or a first visitor's link that closes the rail loses that on reload.
 * 10. Malformed local storage breaks the page instead of reading as a first visit.
 * 11. The card and the glossary drawer show together, or leaving help mode leaves its card open.
 * 12. "Show this step again" does not ask the screen to be set again from the guide's own school.
 * 13. Saved views do not step like a guide's steps: Next, Back, Page Down and Page Up do not move one view, they run
 *     into the guides, or the last view does not close the rail as the last guide does.
 * 14. Presentation mode beside the saved views does not start at view 1 presenting, or a saved view cannot present.
 * 15. A link to a saved view does not land on it, or a link past the last view (after one was removed) shows nothing.
 * 16. Opening a saved view forgets where an unfinished guide was left.
 */
import { describe, expect, it } from "vitest";

import {
  type Catalog,
  EMPTY_MEMORY,
  INITIAL_STATE,
  type LayerEvent,
  type Model,
  parseMemory,
  reduce,
  revalidate,
  revalidateViews,
  searchWithLayers,
  seenCount,
  stateFromSearch,
  statusOf,
} from "@/lib/screening/guide/machine";

const CATALOG: Catalog = [
  { id: "q1", steps: 3 },
  { id: "q2", steps: 3 },
  { id: "q5", steps: 4 },
];
const start: Model = { state: INITIAL_STATE, memory: EMPTY_MEMORY };
const run = (model: Model, ...events: LayerEvent[]) => events.reduce((m, e) => reduce(m, e, CATALOG), model);
const at = (guide: "q1" | "q2" | "q5", step: number, present = false): Model => ({
  state: { ...INITIAL_STATE, rail: { kind: "step", guide, step }, present },
  memory: { seen: true, done: [], last: { guide, step } },
});

describe("stepping through the guides", () => {
  it("opens the next guide at step 1 after a last step, and counts the finished guide as seen", () => {
    const after = run(at("q1", 3), { type: "next" });
    expect(after.state.rail).toEqual({ kind: "step", guide: "q2", step: 1 });
    expect(after.memory.done).toEqual(["q1"]);
    expect(after.state.apply.fresh).toBe(true);
  });

  it("does the same on Page Down, across a guide the data cannot teach", () => {
    expect(run(at("q2", 3), { type: "pageDown" }).state.rail).toEqual({ kind: "step", guide: "q5", step: 1 });
  });

  it("closes the rail after the last guide's last step and counts that guide", () => {
    const after = run(at("q5", 4), { type: "next" });
    expect(after.state.rail).toEqual({ kind: "off" });
    expect(after.memory.done).toEqual(["q5"]);
    expect(after.memory.last).toBeNull();
  });

  it("keeps Back inside the guide unless presenting", () => {
    expect(run(at("q2", 1), { type: "back" }).state.rail).toEqual({ kind: "step", guide: "q2", step: 1 });
    expect(run(at("q2", 1, true), { type: "back" }).state.rail).toEqual({
      kind: "step",
      guide: "q1",
      step: 3,
    });
    expect(run(at("q2", 2), { type: "back" }).state.rail).toEqual({ kind: "step", guide: "q2", step: 1 });
  });

  it("returns Page Up at a first step to the previous guide's last step, and stops at the first guide", () => {
    expect(run(at("q5", 1), { type: "pageUp" }).state.rail).toEqual({ kind: "step", guide: "q2", step: 3 });
    expect(run(at("q1", 1), { type: "pageUp" }).state.rail).toEqual({ kind: "step", guide: "q1", step: 1 });
  });

  it("asks for the screen to be set on every step it lands on", () => {
    const first = at("q1", 1);
    const seqs = [first, run(first, { type: "next" }), run(first, { type: "next" }, { type: "back" })].map(
      (m) => m.state.apply.seq
    );
    expect(seqs).toEqual([0, 1, 2]);
  });

  it("does not step before the data says which guides it can teach", () => {
    expect(reduce(at("q1", 1), { type: "next" }, null).state.rail).toEqual({
      kind: "step",
      guide: "q1",
      step: 1,
    });
  });
});

describe("leaving a guide", () => {
  it("closes the rail and counts a skipped guide as seen, at any step", () => {
    const after = run(at("q2", 2), { type: "skip" });
    expect(after.state.rail).toEqual({ kind: "off" });
    expect(after.memory).toEqual({ seen: true, done: ["q2"], last: null });
    expect(run(at("q2", 3), { type: "skip" }).memory.done).toEqual(["q2"]);
  });

  it("ends presenting when the rail closes or goes back to the start list", () => {
    expect(run(at("q1", 2, true), { type: "close" }).state.present).toBe(false);
    expect(run(at("q1", 2, true), { type: "allGuides" }).state).toMatchObject({
      rail: { kind: "start" },
      present: false,
    });
  });

  it("offers presenting only while a guide runs", () => {
    const onStart = run(start, { type: "toggleGuides" }, { type: "present", on: true });
    expect(onStart.state.present).toBe(false);
  });

  it("starts again from the guide's own school on Show this step again", () => {
    const after = run(at("q2", 1), { type: "restore" });
    expect(after.state.apply).toEqual({ seq: 1, fresh: true });
    expect(after.state.rail).toEqual({ kind: "step", guide: "q2", step: 1 });
  });

  it("does not open a guide the data cannot teach", () => {
    expect(run(start, { type: "openGuide", guide: "q3" })).toBe(start);
  });
});

describe("first and returning visits", () => {
  it("opens the start list on a first visit and keeps the rail closed for a returning user", () => {
    expect(stateFromSearch("", EMPTY_MEMORY).rail).toEqual({ kind: "start" });
    expect(stateFromSearch("", { seen: true, done: ["q1", "q2"], last: null }).rail).toEqual({ kind: "off" });
  });

  it("says each guide's status: seen, where it was left, or how many steps it has", () => {
    const memory = { seen: true, done: ["q1" as const], last: { guide: "q2" as const, step: 2 } };
    expect(statusOf(memory, "q1", 3)).toEqual({ kind: "seen" });
    expect(statusOf(memory, "q2", 3)).toEqual({ kind: "left", step: 2, of: 3 });
    expect(statusOf(memory, "q5", 4)).toEqual({ kind: "new", steps: 4 });
    expect(seenCount({ ...memory, done: ["q1", "q3"] }, CATALOG)).toBe(1);
  });

  it("reads malformed storage as a first visit", () => {
    expect(parseMemory("{not json")).toEqual(EMPTY_MEMORY);
    expect(parseMemory('{"seen":"yes","done":["q9","q1","q1"],"last":{"guide":"q2","step":0}}')).toEqual({
      seen: false,
      done: ["q1"],
      last: null,
    });
  });
});

describe("links", () => {
  it("lands a pasted link on its step, with the page, help card and glossary search", () => {
    const search =
      "?rule=additive_no_u&guide=q2&gstep=3&present=1&page=how&help=1&card=term%3Aneed_facilities&gloss=1&gq=need&gx=school_need";
    const state = stateFromSearch(search, { seen: true, done: [], last: null });
    expect(state).toEqual({
      rail: { kind: "step", guide: "q2", step: 3 },
      present: true,
      page: "how",
      help: true,
      card: "term:need_facilities",
      gloss: { open: true, q: "need", x: "school_need" },
      apply: { seq: 1, fresh: false },
    });
    expect(searchWithLayers(search, state)).toBe(
      "?rule=additive_no_u&guide=q2&gstep=3&present=1&page=how&help=1&card=term%3Aneed_facilities&gloss=1&gq=need&gx=school_need"
    );
  });

  it("drops its own keys when the layers close and keeps the workspace's", () => {
    const returning = { seen: true, done: [], last: null };
    expect(searchWithLayers("?guide=q1&gstep=2&school=k1&help=1", INITIAL_STATE, returning)).toBe(
      "?school=k1"
    );
  });

  it("keeps a closed rail in the address only for someone whose rail would otherwise open", () => {
    const linked = stateFromSearch("?guide=off&school=k1", EMPTY_MEMORY);
    expect(linked.rail).toEqual({ kind: "off" });
    expect(searchWithLayers("?guide=off&school=k1", linked, EMPTY_MEMORY)).toBe("?school=k1&guide=off");
    expect(searchWithLayers("?guide=off&school=k1", linked, { seen: true, done: [], last: null })).toBe(
      "?school=k1"
    );
  });

  it("names the start list only for someone whose rail would otherwise open closed", () => {
    const onStart = { ...INITIAL_STATE, rail: { kind: "start" as const } };
    expect(searchWithLayers("?school=k1", onStart, EMPTY_MEMORY)).toBe("?school=k1");
    expect(searchWithLayers("?school=k1", onStart, { seen: true, done: [], last: null })).toBe(
      "?school=k1&guide=start"
    );
  });

  it("ignores a card that is not one and a step that is not a number", () => {
    const state = stateFromSearch("?guide=q1&gstep=two&card=hello", EMPTY_MEMORY);
    expect(state.rail).toEqual({ kind: "step", guide: "q1", step: 1 });
    expect(state.card).toBeNull();
  });

  it("falls back to the start list for a guide the data cannot teach, and clamps a step past the end", () => {
    const missing = stateFromSearch("?guide=q3&gstep=1&present=1", EMPTY_MEMORY);
    expect(revalidate(missing, CATALOG)).toMatchObject({ rail: { kind: "start" }, present: false });
    const past = stateFromSearch("?guide=q2&gstep=9", EMPTY_MEMORY);
    expect(revalidate(past, CATALOG).rail).toEqual({ kind: "step", guide: "q2", step: 3 });
  });
});

describe("help mode and the glossary", () => {
  it("never shows the card and the drawer together, and closes the card with help mode", () => {
    const helping = run(start, { type: "help", on: true }, { type: "card", id: "term:rank" });
    const drawer = run(helping, { type: "gloss", open: true, x: "rank" });
    expect(drawer.state).toMatchObject({ card: null, gloss: { open: true, x: "rank" } });
    const card = run(drawer, { type: "card", id: "rule:benchmark" });
    expect(card.state.gloss.open).toBe(false);
    expect(run(card, { type: "help", on: false }).state).toMatchObject({ help: false, card: null });
  });
});

describe("saved views for meetings", () => {
  const VIEWS = 4;
  const runViews = (model: Model, ...events: LayerEvent[]) =>
    events.reduce((m, e) => reduce(m, e, CATALOG, VIEWS), model);
  const onView = (step: number, present = false): Model => ({
    state: { ...INITIAL_STATE, rail: { kind: "view", step }, present },
    memory: { seen: true, done: ["q1"], last: { guide: "q2", step: 2 } },
  });

  it("steps one view at a time on Next and Page Down, and closes after the last one", () => {
    expect(runViews(onView(2), { type: "next" }).state.rail).toEqual({ kind: "view", step: 3 });
    expect(runViews(onView(3), { type: "pageDown" }).state.rail).toEqual({ kind: "view", step: 4 });
    const after = runViews(onView(4, true), { type: "pageDown" });
    expect(after.state).toMatchObject({ rail: { kind: "off" }, present: false });
  });

  it("steps back on Back and Page Up, and never crosses into the guides, presenting or not", () => {
    expect(runViews(onView(3), { type: "back" }).state.rail).toEqual({ kind: "view", step: 2 });
    expect(runViews(onView(1, true), { type: "pageUp" }).state.rail).toEqual({ kind: "view", step: 1 });
    expect(runViews(onView(1, true), { type: "back" }).state.rail).toEqual({ kind: "view", step: 1 });
  });

  it("starts Presentation mode at view 1 presenting, and lets a view present like a step", () => {
    const fromStart = runViews(
      { ...start, state: { ...INITIAL_STATE, rail: { kind: "start" } } },
      {
        type: "openView",
        step: 1,
        present: true,
      }
    );
    expect(fromStart.state).toMatchObject({ rail: { kind: "view", step: 1 }, present: true });
    expect(fromStart.state.apply.seq).toBe(1);
    expect(runViews(onView(2), { type: "present", on: true }).state.present).toBe(true);
    expect(runViews(onView(2, true), { type: "allGuides" }).state).toMatchObject({
      rail: { kind: "start" },
      present: false,
    });
  });

  it("asks the screen to be set again on each view, and on Show this step again", () => {
    const next = runViews(onView(1), { type: "next" });
    expect(next.state.apply.seq).toBe(1);
    expect(runViews(next, { type: "restore" }).state.apply.seq).toBe(2);
  });

  it("keeps where an unfinished guide was left, and counts no guide as seen", () => {
    const after = runViews(onView(1), { type: "next" }, { type: "skip" });
    expect(after.memory).toEqual({ seen: true, done: ["q1"], last: { guide: "q2", step: 2 } });
  });

  it("does not open a view past the last one, and waits for the views to be known before stepping", () => {
    expect(runViews(onView(2), { type: "openView", step: 5 }).state.rail).toEqual({ kind: "view", step: 2 });
    expect(reduce(onView(2), { type: "next" }, CATALOG, null).state.rail).toEqual({ kind: "view", step: 2 });
  });

  it("reads and writes a link to a view, and clamps it to the views there are", () => {
    const state = stateFromSearch("?guide=views&gstep=3&present=1", EMPTY_MEMORY);
    expect(state).toMatchObject({ rail: { kind: "view", step: 3 }, present: true });
    expect(searchWithLayers("?rule=x", state)).toBe("?rule=x&guide=views&gstep=3&present=1");
    expect(revalidateViews(state, 2).rail).toEqual({ kind: "view", step: 2 });
    expect(revalidateViews(state, 0)).toMatchObject({ rail: { kind: "start" }, present: false });
    expect(revalidateViews(state, 3)).toBe(state);
  });
});
