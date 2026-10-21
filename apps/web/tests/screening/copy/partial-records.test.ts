/**
 * What a record says when part of the API's answer is broken, absent or not applicable.
 *
 * Failure modes, each with the test that catches it:
 *  1. One rule's broken contributions fail the whole card, though the card shows another rule.
 *  2. The reasons for a rule whose contributions are missing say "none of its inputs adds", which is false.
 *  3. An urgency value that no loaded rule read reads as recorded when it is unknown, or as unknown when it is
 *     recorded. It comes from the stored input.
 *  4. Two scores a rounding error apart are called a tie, though the engine orders them.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { ParseError, parseWith } from "@/lib/screening/schema";
import { schoolFromDetail } from "@/lib/screening/copy";

import { copy as clone, readFixture } from "../fixtures";
import { KEYS } from "./helpers";
import { schoolDetailResponse } from "@/lib/screening/types";

type Body = {
  inputs: Record<string, number | string | null>;
  rules: {
    rule: { rule_id: string };
    result: {
      components: Record<string, number | null | undefined>;
      contributions: { component: string }[];
      need_part_contributions: Record<string, unknown> | null;
      maximum_term: Record<string, unknown> | null;
    };
  }[];
};
const body = () => clone(readFixture(`schools/${KEYS.complete}.json`)) as Body;
const load = (b: Body, view: copy.CopyRuleId) =>
  schoolFromDetail(parseWith(schoolDetailResponse, b, "school"), view);
const entry = (b: Body, id: string) => {
  const e = b.rules.find((r) => r.rule.rule_id === id);
  if (!e) throw new Error(`no ${id}`);
  return e;
};

describe("one rule's contributions are broken", () => {
  const broken = () => {
    const b = body();
    entry(b, "additive_no_u").result.need_part_contributions = null;
    return b;
  };

  it("fails only that rule's part, not a card that shows another rule", () => {
    const s = load(broken(), "additive_u");
    expect(s.cohort).toBe("complete");
    expect(Object.keys(s.contributions ?? {})).toEqual(["additive_u", "bottleneck_u", "bottleneck_no_u"]);
    expect(copy.reasonSentence(s, "additive_u")).toMatch(/^\w+ things? adds? most to its screening score/);
    expect(load(broken(), "benchmark").cohort).toBe("complete");
    expect(load(broken(), "need_first_u").cohort).toBe("complete");
  });

  it("still fails the card of the rule it belongs to, naming the path", () => {
    const path = "rules.additive_no_u.result.need_part_contributions: expected a value, got null";
    expect(() => load(broken(), "additive_no_u")).toThrow(path);
    expect(() => load(broken(), "additive_no_u")).toThrow(ParseError);
  });

  it("does the same for a largest-factor rule, which is built from its own record and nothing else", () => {
    const b = body();
    entry(b, "bottleneck_no_u").result.maximum_term = null;
    expect(() => load(b, "bottleneck_no_u")).toThrow(
      "rules.bottleneck_no_u.result.maximum_term: expected a value, got null"
    );
    const s = load(b, "additive_u");
    expect(Object.keys(s.contributions ?? {})).toEqual(["additive_u", "additive_no_u", "bottleneck_u"]);
  });

  it("builds a largest-factor card without the combined-factors record it once leaned on", () => {
    const b = body();
    b.rules = b.rules.filter((r) => r.rule.rule_id === "bottleneck_u");
    const s = load(b, "bottleneck_u");
    expect(copy.topDrivers(s, "bottleneck_u").length).toBeGreaterThan(0);
  });

  it("does not say that no input adds when the contributions are only missing", () => {
    const s = load(broken(), "additive_u");
    expect(copy.reasonSentence(s, "additive_no_u")).toBe(
      "What adds to the screening score under the combined-factors rule without urgency (S0) is not available for this school."
    );
  });

  it("does not hide a break in the rule shown that is not a parse error", () => {
    const b = body();
    entry(b, "additive_u").result.contributions = entry(b, "additive_u").result.contributions.filter(
      (c) => c.component !== "R"
    );
    expect(() => load(b, "additive_u")).toThrow(
      "rules.additive_u.result.contributions: no entry for component R"
    );
  });
});

describe("an urgency value that no loaded rule reads", () => {
  const withoutUrgencyRules = () => {
    const b = body();
    b.rules = b.rules.filter(
      (r) => !["additive_u", "need_first_u", "bottleneck_u", "benchmark"].includes(r.rule.rule_id)
    );
    return b;
  };

  it("is read from the stored input when no rule that reads urgency has a run, known or unknown", () => {
    const known = load(withoutUrgencyRules(), "additive_no_u");
    // Known, but the engine's figure is not loaded, and the stored value is on another scale: it is not shown.
    expect(known.components).not.toHaveProperty("U");
    expect(copy.missingValueKind(known, "urgency")).toBe("recorded");

    const b = withoutUrgencyRules();
    b.inputs.urgency_source_scalar = null;
    const unknown = load(b, "additive_no_u");
    expect(unknown.components.U).toBeNull();
    expect(copy.missingValueKind(unknown, "urgency")).toBe("blank");
  });

  it("is unknown only when a rule that reads it found it unknown", () => {
    const b = body();
    for (const r of b.rules) if ("U" in r.result.components) r.result.components.U = null;
    const s = load(b, "additive_no_u");
    expect(s.components.U).toBeNull();
    expect(copy.missingValueKind(s, "urgency")).toBe("blank");
  });

  it("is the value itself when a rule that reads it has a run", () => {
    const s = load(body(), "additive_no_u");
    expect(s.components.U).toBe(0.21014492753623193);
    expect(copy.missingValueKind(s, "urgency")).toBe("recorded");
  });
});
