/**
 * Failure modes of the workspace state and its URL:
 *  1. A pasted link does not reproduce the screen: a key is lost, renamed or read wrongly on the way back in.
 *  2. A link carries defaults, so two links to the same screen differ.
 *  3. An invalid value (an unknown rule or school, a word that is not an option) replaces a good one.
 *  4. `null` does not clear a key, so a layer cannot undo what it set.
 *  5. What changed compares a rule with itself.
 *  6. A school in a pasted link is dropped before the list has loaded, or kept after the list shows it does not exist.
 *  7. Writing the workspace keys drops the URL keys another layer owns (the guides, help mode).
 *  8. A listener hears a change that did not happen, or misses one; the URL falls out of step with the screen.
 */
import { describe, expect, it } from "vitest";

import { createWorkspaceStore } from "@/lib/screening/workspace/store";
import {
  DEFAULT_STATE,
  type Known,
  applyPatch,
  revalidate,
  searchWithState,
  stateFromSearch,
} from "@/lib/screening/workspace/state";
import type { RuleId } from "@/lib/screening/types";

const S = "additive_u" as RuleId;
const RULES = new Set(["additive_u", "additive_no_u", "need_first_u"]);
const loading: Known = { ruleIds: null, defaultRule: S, schoolKeys: null };
const loaded: Known = { ruleIds: RULES, defaultRule: S, schoolKeys: new Set(["k1", "k2"]) };

describe("the URL", () => {
  it("reads every key and writes them back in a fixed order", () => {
    const state = stateFromSearch(
      "?school=k2&view=queue&rule=additive_no_u&compare=additive_u&qgroup=evidence&place=upper&scope=1&hover=k1",
      loaded
    );
    expect(state).toEqual({
      ...DEFAULT_STATE,
      rule: "additive_no_u",
      compare: "additive_u",
      school: "k2",
      hover: "k1",
      view: "queue",
      qgroup: "evidence",
      place: "upper",
      scope: true,
    });
    expect(searchWithState("", state)).toBe(
      "?rule=additive_no_u&compare=additive_u&view=queue&qgroup=evidence&place=upper&scope=1&school=k2&hover=k1"
    );
  });

  it("leaves defaults out, including the default rule", () => {
    expect(searchWithState("", stateFromSearch("?rule=additive_u&view=ranked&scope=0", loaded))).toBe("");
  });

  it("keeps the keys other layers own, after the workspace's own", () => {
    const state = stateFromSearch("?rule=need_first_u", loaded);
    expect(searchWithState("?guide=q2&rule=additive_no_u&gstep=1", state)).toBe(
      "?rule=need_first_u&guide=q2&gstep=1"
    );
  });

  it("ignores a value that is not an option and keeps the default", () => {
    expect(stateFromSearch("?view=map&qgroup=x&place=middle&scope=yes&rule=zzz", loaded)).toEqual(
      DEFAULT_STATE
    );
  });
});

describe("applyPatch", () => {
  const start = stateFromSearch("?rule=need_first_u&school=k1&view=queue", loaded);

  it("changes only the keys named", () => {
    expect(applyPatch(start, { school: "k2" }, loaded)).toEqual({ ...start, school: "k2" });
  });

  it("ignores an unknown rule or school and keeps the previous value", () => {
    expect(applyPatch(start, { rule: "nope", school: "k9" }, loaded)).toBe(start);
  });

  it("clears a key to its default with null", () => {
    expect(applyPatch(start, { school: null, view: null, rule: null }, loaded)).toEqual(DEFAULT_STATE);
  });

  it("never compares a rule with itself", () => {
    expect(applyPatch(start, { compare: "need_first_u" }, loaded).compare).toBeNull();
    // Switching to the rule that was being compared with drops the comparison.
    const comparing = applyPatch(start, { compare: "additive_no_u" }, loaded);
    expect(comparing.compare).toBe("additive_no_u");
    expect(applyPatch(comparing, { rule: "additive_no_u" }, loaded)).toMatchObject({
      rule: "additive_no_u",
      compare: null,
    });
    // The default rule is stored as null, and compared with as itself.
    expect(applyPatch(comparing, { rule: "additive_u", compare: "additive_u" }, loaded)).toMatchObject({
      rule: null,
      compare: null,
    });
  });

  it("accepts any school before the list has loaded, and drops one the list does not hold once it has", () => {
    const pasted = stateFromSearch("?school=k9&rule=need_first_u", loading);
    expect(pasted.school).toBe("k9");
    expect(revalidate(pasted, loaded)).toEqual({ ...pasted, school: null });
    expect(revalidate(stateFromSearch("?school=k2", loading), loaded).school).toBe("k2");
  });
});

describe("the store", () => {
  const browser = (search: string) => {
    const location = { search, pathname: "/screening", hash: "" };
    const writes: string[] = [];
    const history = {
      replaceState: (_data: unknown, _unused: string, next: string | URL | null | undefined) => {
        writes.push(String(next));
        location.search = String(next).replace(/^\/screening/, "");
      },
    };
    return { location, history, writes };
  };

  it("reads the URL once, then writes every change back to it", () => {
    const store = createWorkspaceStore(S);
    const page = browser("?rule=additive_no_u&guide=q1");
    store.attachUrl(page.location, page.history);
    expect(store.getState().rule).toBe("additive_no_u");
    expect(page.writes).toEqual([]);

    store.setState({ rule: "additive_u", compare: "additive_no_u", view: "queue" });
    expect(page.writes).toEqual(["/screening?compare=additive_no_u&view=queue&guide=q1"]);
  });

  it("tells listeners the new and the previous state, once per real change", () => {
    const store = createWorkspaceStore(S);
    const heard: string[] = [];
    store.onChange((now, before) => heard.push(`${before.rule}->${now.rule} ${now.school}`));
    store.setState({ rule: "need_first_u" });
    store.setState({ rule: "need_first_u" });
    store.setState({ school: "k1" });
    expect(heard).toEqual(["additive_u->need_first_u null", "need_first_u->need_first_u k1"]);
  });

  it("drops a pasted school that the loaded list does not hold", () => {
    const store = createWorkspaceStore(S);
    const page = browser("?school=k9");
    store.attachUrl(page.location, page.history);
    expect(store.getState().school).toBe("k9");
    store.setKnown({ ruleIds: RULES, schoolKeys: new Set(["k1"]) });
    expect(store.getState().school).toBeNull();
    expect(page.location.search).toBe("");
  });
});
