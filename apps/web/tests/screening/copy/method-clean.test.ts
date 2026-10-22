/**
 * The method details' words stay in the method details.
 *
 * Failure modes, each with the test that catches it:
 *  1. A method word reaches a plain view: a string of the method namespace is also said by the plain bound copy, or the
 *     plain copy says a method word (a rule id, a file name, a fingerprint). The plain surface of every rule is
 *     compared with the method namespace of the same rule.
 *  2. A method string uses a retired word. The BANNED list runs over every string the namespace says, under every rule.
 *  3. The bound copy carries the method namespace up front, so a plain view ships it. It is only reachable through
 *     `methodFor`, which loads it on demand.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import {
  countsByRuleFromResults,
  countsFromResults,
  pairwiseFromCompare,
  schoolsFromLists,
} from "@/lib/screening/copy";
import { BANNED } from "@/lib/screening/copy/later";

import { RULES, fixtureCompare, fixtureInputs, fixtureResults, methodStrings } from "./helpers";

const lists = RULES.map((r) => fixtureResults(r));
const byRule = countsByRuleFromResults(...lists);
const inputs = fixtureInputs();

/** Words only a method view says; interact.mjs scans plain views for the same ones. */
const METHOD_WORDS = /rank correlation|spearman|additive_u|fixture|\.json|\bsha256\b|Dirichlet/i;

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

async function bind(rule: copy.CopyRuleId) {
  const shown = lists.find((l) => l.run.rule_id === rule) as (typeof lists)[number];
  const schools = schoolsFromLists(inputs, [shown, ...lists.filter((l) => l !== shown)], rule);
  const P = copy.copyFor({
    schools,
    counts: countsFromResults(shown, schools),
    countsByRule: byRule,
    ...pairwiseFromCompare(fixtureCompare()),
  });
  const later = await P.later();
  // A term's research name and its position in the design are for analysts and designers, not for a reader.
  const readable = (terms: Record<string, { label: string; line: string; help: string }>) =>
    Object.values(terms).map((t) => [t.label, t.line, t.help]);
  const plain = strings([
    readable(P.TERMS),
    readable(P.termsFor(rule)),
    P.STRINGS,
    P.scope(rule),
    P.IDEAS,
    P.LAYOUT,
    P.HELP,
    P.KEYS,
    later.HOW_IT_WORKS.map((x) => [x.title, x.sentences]),
    later.FIRST_QUESTIONS.map((q) => [q.question, q.answer]),
    later.GUIDE,
    later.GLOSSARY_GROUPS.map((g) => g.heading),
    schools.flatMap((s) => [
      P.rankSentence(s, rule, { name: true }),
      P.placeContext(s, rule),
      P.fullRankingSentence(s, rule),
      P.missingSentences(s, rule),
      P.missingLabels(s),
      P.persistenceNote(s, rule),
    ]),
    P.comparisonSentence("additive_u", "additive_no_u"),
    P.urgencyReassurance(),
    P.listStartsSentence(undefined, rule),
  ]);
  return { P, plain, method: methodStrings(await P.methodFor(rule)) };
}

describe.each(RULES)("under %s", (rule) => {
  const surface = bind(rule);

  it("says no method string in a plain view", async () => {
    const { plain, method } = await surface;
    const plainSet = new Set(plain);
    // A short word such as "Province" is plain and method alike; what counts is a phrase.
    const phrases = method.filter((t) => t.trim().split(/\s+/).length >= 3);
    expect(phrases.filter((t) => plainSet.has(t))).toEqual([]);
    expect(plain.filter((t) => METHOD_WORDS.test(t) && !/analyst|technical/i.test(t))).toEqual([]);
  });

  it("uses no retired word in a method string", async () => {
    const { method } = await surface;
    // File names and fingerprints are the method record's own words, so the one pattern that guards them is not applied.
    const guards = BANNED.filter((b) => !b.pattern.test("Input schools.json"));
    expect(guards.length).toBe(BANNED.length - 1);
    const hits = method.flatMap((t) =>
      guards.filter((b) => b.pattern.test(t)).map((b) => `${t} / ${b.pattern}`)
    );
    expect(hits).toEqual([]);
  });

  it("leaves the plain surface clear of every retired word", async () => {
    const { plain } = await surface;
    const hits = plain.flatMap((t) =>
      BANNED.filter((b) => b.pattern.test(t)).map((b) => `${t} / ${b.pattern}`)
    );
    expect(hits).toEqual([]);
  });

  it("is only reachable on demand", async () => {
    const { P } = await surface;
    expect(P).not.toHaveProperty("METHOD");
    expect(await P.later()).not.toHaveProperty("METHOD");
    expect((await P.methodFor(rule)).layers.groups).toEqual({ Schools: "Schools", Boundaries: "Boundaries" });
  });
});

describe("what the method namespace leaves out", () => {
  it("has no access or environment layer, no map image, no catchment note and no briefing pack", async () => {
    const { method } = await bind("additive_u");
    const text = method.join("\n");
    expect(text).not.toMatch(
      /\bkm\b|Population access|Road segments|Elevation|inundation|Map images|catchment|prototype|briefing pack|\bpack\b/i
    );
    const layers = (await bind("additive_u")).P.methodFor("additive_u").then((m) =>
      Object.keys(m.layers.items)
    );
    expect(await layers).toEqual(["ranked", "numerals", "range", "provinces", "districts"]);
  });
});
