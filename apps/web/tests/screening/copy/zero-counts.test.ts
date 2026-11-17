/**
 * A count of zero is said as a zero, or left out, and never printed as a clause about nothing.
 *
 * Failure modes, each with the test that catches it:
 *  1. The scope line prints "and 0 that show a range of ranks" on a list with no range schools, and the other
 *     lines that state a group (the ranges, the list order, the filter note, the idea of a range) speak of schools
 *     that do not exist.
 *  2. The explainer says "the others have incomplete records" when none does.
 * The lists are the API's own saved responses for the datasets that hold no range school and no incomplete record.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { bindCopy } from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { inputsResponse, resultsResponse } from "@/lib/screening/types";

import { readFixture } from "../fixtures";
import { RULES } from "./helpers";

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

async function bound(dir: string, rule: copy.CopyRuleId) {
  const lists = RULES.map((r) => parseWith(resultsResponse, readFixture(`${dir}results/${r}.json`), r));
  const inputs = parseWith(inputsResponse, readFixture(`${dir}inputs.json`), "inputs");
  const { copy: P } = bindCopy({ view: rule, inputs, lists });
  return { P, later: await P.later() };
}

/** A zero stated as a count of schools, or a clause about no schools. */
const ZERO_CLAUSE = /(?:^|[\s,])0 (?:that|schools?|more)\b|and 0\b|\b(?:no|zero) (?:more|that)\b/;

describe.each(["worst-names/", "one/"])("a list with no range school and no incomplete record: %s", (dir) => {
  it.each(RULES)(
    "says no zero clause in the scope lines, the terms or the explainer, under %s",
    async (rule) => {
      const { P, later } = await bound(dir, rule);
      expect(P.counts).toMatchObject({ range: 0, queue: 0 });
      // A term's research name carries the real count, as an analyst label, so only what a reader sees is read.
      const readable = Object.values(P.termsFor(rule)).map((t) => [t.label, t.line, t.help]);
      const text = strings([P.scope(rule), P.groupsSentence(rule), readable, later.HOW_IT_WORKS]);
      expect(text.filter((t) => ZERO_CLAUSE.test(t))).toEqual([]);
    }
  );

  it("leaves the range clause out of the short scope line", async () => {
    const { P } = await bound(dir, "additive_u");
    const n = P.counts.ranked as number;
    expect(P.scope("additive_u").scopeDetail).toContain(
      `${n} ${n === 1 ? "school" : "schools"} can be put in order, all with every input recorded.`
    );
    expect(P.scope("additive_u").scopeRanked).not.toMatch(/Ranges count among/);
    expect(P.scope("additive_u").scopeDetail).not.toMatch(/ranges among/);
    expect(P.scope("additive_u").filterNote).not.toMatch(/ranges among/);
  });

  it("does not speak of schools that show a range or of incomplete records that do not exist", async () => {
    const { P, later } = await bound(dir, "additive_u");
    expect(P.scope("additive_u").listOrder).toBe("No school shows a range in this list.");
    expect(P.scope("additive_u").listOrderUpper).toBe(
      "The sensitivity check for schools that show a range has nothing to show here, because no school shows one."
    );
    const placed = later.HOW_IT_WORKS.find((s) => s.key === "placed")?.sentences.join(" ") ?? "";
    expect(placed).not.toMatch(/The others? have/);
    expect(P.IDEAS.ranges.title).not.toMatch(/^Some/);
    expect(P.IDEAS.queue.title).not.toMatch(/^Some/);
  });
});

describe("a list with range schools and incomplete records", () => {
  it("keeps every clause", async () => {
    const { P } = await bound("", "additive_u");
    expect(P.scope("additive_u").scopeDetail).toContain(
      "21 schools can be put in order, 16 with every input recorded and 5 that show a range of ranks."
    );
    expect(P.IDEAS.ranges.title).toMatch(/^Five schools show a range/);
  });
});

describe("a list with range schools and no school with every input", () => {
  it("states the group that is empty as none, not as 0", () => {
    const c = { all: 5, complete: 0, range: 5, ranked: 5, queue: 0 };
    const scope = copy.buildScope(c);
    expect(scope.scopeDetail).toContain("5 schools can be put in order, all showing a range of ranks.");
    expect(scope.groups).toBe(
      "No school has every input recorded, but five lack a figure such as air quality and show a range of ranks, so 5 schools can be put in order."
    );
    expect(copy.buildScope({ all: 0, complete: 0, range: 0, ranked: 0, queue: 0 }).scopeShort).toBe(
      "No school can be put in order."
    );
  });
});
