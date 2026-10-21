/**
 * Failure modes of saved views for meetings, in their pure parts:
 *  1. Storage that holds junk (not JSON, another shape, wrong types) breaks the screen or shows junk views, instead of
 *     reading as nothing kept, so the seeds show.
 *  2. One bad item throws away the good ones; a list of nothing but junk reads as "the person removed every view".
 *  3. A kept name is longer than the name field allows, is blank, or is cut inside a character.
 *  4. Views kept by the final design's prototype (a bare list with its seeds as fixed states) are lost, or their seeds
 *     keep naming the prototype's school instead of being chosen again by role.
 *  5. A seed is offered twice.
 *  6. A seed whose subject the data lacks is offered; or removing a view removes another one, because the list skips
 *     seeds the data cannot show.
 *  7. Saving the first view loses the seeds; a view keeps what only passes (the pointer's school, an open sheet).
 *  8. Seeds are chosen by the order the API sent the schools, or name a school by id that the roles did not choose.
 * 10. Restore the starting views is offered when there is nothing to restore, or withheld after a seed was removed
 *     or the order changed.
 *  9. The pack's links carry junk or an unknown school, its file misses a rule a view shows, or its name is not the
 *     plain pattern.
 */
import { describe, expect, it } from "vitest";

import { copyFor } from "@/lib/screening/copy";
import { rolesOf } from "@/lib/screening/guide/roles";
import type { RuleId } from "@/lib/screening/types";
import { linkOf, linksText, packFileName, packText, rulesUsed, stateOf } from "@/lib/screening/views/pack";
import { seedsOf } from "@/lib/screening/views/seeds";
import {
  NAME_MAX,
  SEED_ENTRIES,
  type Seeds,
  cleanName,
  isStarting,
  parseEntries,
  resolve,
  viewQuery,
  withRemoved,
  withSaved,
} from "@/lib/screening/views/views";
import { DEFAULT_STATE, type Known, applyPatch } from "@/lib/screening/workspace/state";

import { school } from "./copy/helpers";

const ALL_SEEDS: Seeds = { top: "rule=additive_u", urgency: "u", range: "school=r1", queue: "view=queue" };

describe("reading what storage holds", () => {
  it("reads junk as nothing kept, so the seeds show (1)", () => {
    for (const text of [null, "", "{broken", "null", "42", '"text"', "{}", '{"v":2,"views":[]}', '{"v":1}'])
      expect(parseEntries(text), String(text)).toBeNull();
  });

  it("keeps the good items of a list and drops the bad, but reads a list of only junk as junk (2)", () => {
    const text = JSON.stringify({
      v: 1,
      views: [
        { seed: "top" },
        7,
        { name: "Board", q: "rule=need_first_u" },
        { name: 3, q: "" },
        { seed: "x" },
      ],
    });
    expect(parseEntries(text)).toEqual([{ seed: "top" }, { name: "Board", q: "rule=need_first_u" }]);
    expect(parseEntries(JSON.stringify({ v: 1, views: [1, null, { q: "" }] }))).toBeNull();
    expect(parseEntries(JSON.stringify({ v: 1, views: [] }))).toEqual([]);
  });

  it("holds a name to the field's limit, in whole characters, and drops a blank one (3)", () => {
    const long = "Ö".repeat(70);
    const [kept] = parseEntries(JSON.stringify({ v: 1, views: [{ name: long, q: "" }] }))!;
    expect(kept).toEqual({ name: "Ö".repeat(NAME_MAX), q: "" });
    expect(cleanName(`${"🏫".repeat(59)}ab`)).toBe(`${"🏫".repeat(59)}a`);
    expect(cleanName("  Provincial   board \n meeting ")).toBe("Provincial board meeting");
    expect(parseEntries(JSON.stringify({ v: 1, views: [{ name: "   ", q: "" }] }))).toBeNull();
  });

  it("moves the prototype's bare list over, with its seeds chosen again by role (4)", () => {
    const prototype = [
      { name: "Top of the list, combined factors", q: "", seed: "top" },
      { name: "A school with possible places", q: "school=k-prototype", seed: "range" },
      { name: "Board", q: "?rule=need_first_u", cam: { c: [147, -6], z: 6 } },
    ];
    expect(parseEntries(JSON.stringify(prototype))).toEqual([
      { seed: "top" },
      { seed: "range" },
      { name: "Board", q: "rule=need_first_u" },
    ]);
  });

  it("offers a seed once (5)", () => {
    const text = JSON.stringify({ v: 1, views: [{ seed: "queue" }, { seed: "top" }, { seed: "queue" }] });
    expect(parseEntries(text)).toEqual([{ seed: "queue" }, { seed: "top" }]);
  });
});

describe("the list a person sees", () => {
  it("leaves out the seeds the data cannot show, and removes the view chosen (6)", () => {
    const noRange: Seeds = { top: "a", queue: "c" };
    const kept = [{ seed: "top" as const }, { seed: "range" as const }, { name: "Board", q: "b" }];
    const views = resolve(kept, noRange);
    expect(views.map((v) => v.seed ?? v.name)).toEqual(["top", "Board"]);
    expect(withRemoved(kept, views[1].at)).toEqual([{ seed: "top" }, { seed: "range" }]);
    expect(resolve(null, noRange).map((v) => v.seed)).toEqual(["top", "queue"]);
  });

  it("keeps the seeds ahead of the first saved view, and saves the screen without what only passes (7)", () => {
    const state = applyPatch(
      DEFAULT_STATE,
      { school: "k1", hover: "k2", panel: "export", pack: true, view: "queue" },
      { ruleIds: null, defaultRule: "additive_u" as RuleId, schoolKeys: null }
    );
    const q = viewQuery(state);
    expect(q).toBe("view=queue&school=k1");
    expect(resolve(withSaved(null, " Board ", q), ALL_SEEDS).map((v) => v.seed ?? v.name)).toEqual([
      "top",
      "urgency",
      "range",
      "queue",
      "Board",
    ]);
  });
});

describe("seeds, by role", () => {
  const copy = copyFor({});
  const first = school({ id: "c1", place: 1 });
  const second = school({ id: "c2", place: 2 });
  const wide = school({ id: "r2", cohort: "interval", bounds: [9, 30], blank: ["aqi"] });
  const early = school({ id: "r1", cohort: "interval", bounds: [4, 12], blank: ["aqi"] });
  const queued = school({ id: "q1", cohort: "queue", gate: ["permanent_classroom_deficit"] });

  it("picks the range school with the best possible place, whatever order the data arrives in (8)", () => {
    for (const order of [
      [wide, second, early, first, queued],
      [queued, first, early, second, wide],
    ])
      expect(seedsOf(rolesOf(order, copy)!, true)).toEqual({
        top: "rule=additive_u",
        urgency: "rule=additive_no_u&compare=additive_u",
        range: "school=r1",
        queue: "view=queue&qgroup=evidence",
      });
  });

  it("offers only what the data holds: one complete school, and no proposed revision (6)", () => {
    expect(seedsOf(rolesOf([first], copy)!, false)).toEqual({ top: "rule=additive_u" });
    expect(seedsOf(rolesOf([first, queued], copy)!, true)).toEqual({
      top: "rule=additive_u",
      urgency: "rule=additive_no_u&compare=additive_u",
      queue: "view=queue&qgroup=evidence",
    });
  });
});

describe("the pack", () => {
  const known: Known = {
    ruleIds: new Set(["additive_u", "additive_no_u", "need_first_u"]),
    defaultRule: "additive_u" as RuleId,
    schoolKeys: new Set(["k1"]),
  };

  it("links each view to its state as the workspace reads it, never to junk or an unknown school (9)", () => {
    const page = "https://rise.example/screening";
    expect(linkOf(page, stateOf({ q: "rule=additive_u" }, known))).toBe(page);
    expect(linkOf(page, stateOf({ q: "school=k1&junk=1&rule=nope" }, known))).toBe(`${page}?school=k1`);
    expect(linkOf(page, stateOf({ q: "school=gone" }, known))).toBe(page);
  });

  it("names every rule the views show, the compared one too, once each (9)", () => {
    const states = ["", "rule=additive_no_u&compare=additive_u", "mode=compare&rule=need_first_u", ""].map(
      (q) => stateOf({ q }, known)
    );
    expect(rulesUsed(states, known)).toEqual(["additive_u", "additive_no_u", "need_first_u"]);
  });

  it("writes the views in order with each rule's record, under the plain file name (9)", () => {
    const items = [
      { name: "Top", link: "https://rise.example/screening" },
      { name: "Board", link: "https://rise.example/screening?school=k1" },
    ];
    expect(
      JSON.parse(
        packText(items, [{ rule: "additive_u" as RuleId, record: [{ key: "rule_id", value: "additive_u" }] }])
      )
    ).toEqual({
      saved_views: [
        { order: 1, name: "Top", link: "https://rise.example/screening" },
        { order: 2, name: "Board", link: "https://rise.example/screening?school=k1" },
      ],
      method_record: { additive_u: ["rule_id: additive_u"] },
    });
    expect(linksText(items)).toBe(
      "1. Top\nhttps://rise.example/screening\n\n2. Board\nhttps://rise.example/screening?school=k1"
    );
    expect(packFileName(new Date(2026, 9, 21, 23, 30))).toBe("rise-png-saved-views-2026-10-21.json");
  });
});

describe("when the starting views are what is kept", () => {
  const seeds = SEED_ENTRIES;
  it("is true for nothing kept and for the four seeds in order, so there is nothing to restore", () => {
    expect(isStarting(null)).toBe(true);
    expect(isStarting(seeds)).toBe(true);
  });
  it("is false once a seed is removed, the order changes, or a view is saved", () => {
    expect(isStarting([])).toBe(false);
    expect(isStarting(withRemoved(seeds, 1))).toBe(false);
    expect(isStarting([seeds[1], seeds[0], seeds[2], seeds[3]])).toBe(false);
    expect(isStarting(withSaved(null, "Board", "view=queue"))).toBe(false);
  });
});
