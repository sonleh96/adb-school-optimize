/**
 * Failure modes of the method details' state keys (analyst, mode, k, panel, n, prov, loc, formula, parts, hide, pop):
 *  1. Compare mode shows without the method details, from a link or a guide's setState.
 *  2. Turning the method details off while comparing loses the two rules, or leaves compare mode half on.
 *  3. Compare mode is entered with one rule, so it compares nothing.
 *  4. `a` and `b`, the names the guide contract uses for compare mode's rules, are ignored or left in the URL.
 *  5. A link opens a popover, or a method popover stays open after the method details are turned off.
 *  6. Two links to the same layers differ by order or repetition, or setting the same layers fires a change.
 *  7. A length that is not offered (7 schools, "abc") replaces a good one.
 *  8. A filter value that the loaded list does not hold is kept, so the list shows nothing for no visible reason.
 *  9. A method-only key (a filter, hidden layers, the formula, the parts, the chart's length) stays in force on a
 *     plain screen, from a pasted link or after the method details are turned off: a filter nobody can see.
 */
import { describe, expect, it } from "vitest";

import type { RuleId } from "@/lib/screening/types";
import {
  DEFAULT_STATE,
  type Known,
  applyPatch,
  revalidate,
  searchWithState,
  stateFromSearch,
} from "@/lib/screening/workspace/state";
import { createWorkspaceStore } from "@/lib/screening/workspace/store";

const S = "additive_u" as RuleId;
const RULES = new Set(["additive_u", "additive_no_u", "need_first_u"]);
const loaded: Known = {
  ruleIds: RULES,
  defaultRule: S,
  schoolKeys: new Set(["k1"]),
  provinces: new Set(["North Province", "South Province"]),
  localities: new Set(["Remote"]),
};

describe("compare mode", () => {
  it("turns the method details on, whatever the link says (1)", () => {
    const state = stateFromSearch("?mode=compare&analyst=0&rule=need_first_u", loaded);
    expect(state).toMatchObject({
      mode: "compare",
      analyst: true,
      rule: "need_first_u",
      compare: "additive_u",
    });
    expect(applyPatch(DEFAULT_STATE, { mode: "compare" }, loaded).analyst).toBe(true);
  });

  it("returns to the plain list on the compared rule, with What changed, when the method details go off (2)", () => {
    const comparing = applyPatch(
      DEFAULT_STATE,
      { mode: "compare", a: "need_first_u", b: "additive_no_u" },
      loaded
    );
    expect(applyPatch(comparing, { analyst: false }, loaded)).toEqual({
      ...DEFAULT_STATE,
      rule: "additive_no_u",
      compare: "need_first_u",
    });
    expect(applyPatch(comparing, { analyst: null }, loaded).mode).toBe("screen");
  });

  it("always holds two rules: the main rule's comparison is the next rule the API lists (3)", () => {
    expect(applyPatch(DEFAULT_STATE, { mode: "compare" }, loaded)).toMatchObject({
      rule: "additive_no_u",
      compare: "additive_u",
    });
    const other = applyPatch(DEFAULT_STATE, { mode: "compare", rule: "need_first_u" }, loaded);
    expect(other).toMatchObject({ rule: "need_first_u", compare: "additive_u" });
  });

  it("reads a and b as the two rules and writes them under rule and compare (4)", () => {
    const state = stateFromSearch("?mode=compare&a=need_first_u&b=additive_no_u&guide=q1", loaded);
    expect(state).toMatchObject({ compare: "need_first_u", rule: "additive_no_u" });
    expect(searchWithState("?a=x&b=y&guide=q1", state)).toBe(
      "?analyst=1&mode=compare&rule=additive_no_u&compare=need_first_u&guide=q1"
    );
  });
});

describe("the other method keys", () => {
  it("never writes a popover to the URL, and closes a method popover with the method details (5)", () => {
    const open = applyPatch(DEFAULT_STATE, { analyst: true, pop: "layers" }, loaded);
    expect(open.pop).toBe("layers");
    expect(searchWithState("", open)).toBe("?analyst=1");
    expect(applyPatch(open, { analyst: false }, loaded).pop).toBeNull();
    // The compare pickers close when compare mode ends.
    const picking = applyPatch(DEFAULT_STATE, { mode: "compare", pop: "pickB" }, loaded);
    expect(applyPatch(picking, { mode: "screen" }, loaded).pop).toBeNull();
  });

  it("writes hidden layers in one order, once each, and hears no change for the same layers (6)", () => {
    const a = stateFromSearch("?analyst=1&hide=districts,numerals,districts,roads", loaded);
    expect(a.hide).toEqual(["numerals", "districts"]);
    expect(searchWithState("", a)).toBe("?analyst=1&hide=numerals%2Cdistricts");
    expect(applyPatch(a, { hide: ["districts", "numerals"] }, loaded)).toBe(a);

    const store = createWorkspaceStore(S);
    let heard = 0;
    store.onChange(() => (heard += 1));
    store.setState({ analyst: true, hide: ["provinces"] });
    store.setState({ hide: "provinces" });
    expect(heard).toBe(1);
  });

  it("ignores a length that is not offered (7)", () => {
    const state = stateFromSearch("?analyst=1&n=30&k=10", loaded);
    expect(state).toMatchObject({ n: 30, k: 10 });
    expect(applyPatch(state, { n: 7, k: "abc" }, loaded)).toBe(state);
    expect(applyPatch(state, { n: "10" }, loaded).n).toBe(10);
    expect(searchWithState("", applyPatch(state, { n: 20, k: 20 }, loaded))).toBe("?analyst=1");
  });

  it("drops a filter value the loaded list does not hold (8)", () => {
    const loading: Known = { ruleIds: null, defaultRule: S, schoolKeys: null };
    const pasted = stateFromSearch("?analyst=1&prov=West%20Province&loc=Remote", loading);
    expect(pasted).toMatchObject({ prov: "West Province", loc: "Remote" });
    expect(revalidate(pasted, loaded)).toMatchObject({ prov: null, loc: "Remote" });
    const on = applyPatch(DEFAULT_STATE, { analyst: true }, loaded);
    expect(applyPatch(on, { prov: "Nowhere" }, loaded)).toBe(on);
  });
});

describe("method-only keys on a plain screen (9)", () => {
  const METHOD_ONLY = "prov=South%20Province&loc=Remote&hide=numerals&formula=1&parts=1&k=10";

  it("are read as their defaults from a plain link, and leave it", () => {
    const plain = stateFromSearch(`?${METHOD_ONLY}&n=30&view=queue`, {
      ...loaded,
      provinces: new Set(["South Province"]),
    });
    expect(plain).toEqual({ ...DEFAULT_STATE, n: 30, view: "queue" });
    expect(searchWithState(`?${METHOD_ONLY}&n=30&view=queue`, plain)).toBe("?view=queue&n=30");
  });

  it("are cleared when the method details are turned off, and the plain keys stay", () => {
    const on = stateFromSearch(`?analyst=1&${METHOD_ONLY}&n=30&place=upper`, {
      ...loaded,
      provinces: new Set(["South Province"]),
    });
    expect(on).toMatchObject({ prov: "South Province", loc: "Remote", formula: true, parts: true, k: 10 });
    expect(applyPatch(on, { analyst: false }, loaded)).toEqual({ ...DEFAULT_STATE, n: 30, place: "upper" });
  });
});
