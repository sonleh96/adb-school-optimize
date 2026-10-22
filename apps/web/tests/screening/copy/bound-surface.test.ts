/**
 * The whole bound surface, bound under each of the seven rules, says nothing false about which schools a group holds.
 * The method details' words are part of it: they are bound under the rule shown as well.
 *
 * Failure modes, each with the test that catches it (the last three findings shared them):
 *  1. A string says "every input recorded" of a group that holds a school with a reading the rule does not read.
 *     The benchmark reads no air-quality figure and the rules without urgency do not read urgency, so their groups
 *     (21 and 17 schools in the saved responses) hold schools that lack one.
 *  2. A string names a group size that belongs to a rule other than the one shown.
 *  3. A string says one group is the same under every rule, or that places can be compared across rules because of it.
 *  4. A definition of the whole method is worded with the numbers of whichever rule was bound.
 *  5. Somewhere on the surface (the guides and the glossary included) the rule without urgency is still called
 *     proposed or awaiting review, the stochastic test is still said not to have been redone for it, or the
 *     circulated rule with urgency is still called the paper's main rule.
 * The lists are the API's own saved responses; the sets differ by rule.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import {
  countsByRuleFromResults,
  countsFromResults,
  pairwiseFromCompare,
  ruleReads,
  schoolsFromLists,
} from "@/lib/screening/copy";

import { RULES, fixtureCompare, fixtureInputs, fixtureResults, methodStrings } from "./helpers";

const lists = RULES.map((r) => fixtureResults(r));
const byRule = countsByRuleFromResults(...lists);
const inputs = fixtureInputs();
const readsAll = (r: copy.CopyRuleId) => ruleReads(r).urgency && ruleReads(r).readings;
const completeOf = (r: copy.CopyRuleId) => byRule[r]?.complete as number;

/** Every string in a value, however deep. */
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
  // The method details' words for this rule, which only the method details read.
  const method = methodStrings(await P.methodFor(rule));
  const scoped = [
    P.termsFor(rule),
    P.scope(rule),
    P.groupsSentence(rule),
    ...schools.flatMap((s) => [
      P.rankSentence(s, rule, { name: true }),
      P.placeContext(s, rule),
      P.fullRankingSentence(s, rule),
      P.missingSentences(s, rule),
    ]),
    P.listStartsSentence(undefined, rule),
  ];
  const neutral = [P.TERMS, P.STRINGS, P.IDEAS, P.LAYOUT, later.HOW_IT_WORKS, later.FIRST_QUESTIONS];
  // Everything a person can read about the rules and the paper, the guides and the glossary's terms included.
  const about = [
    neutral,
    later.GUIDE,
    later.GLOSSARY_GROUPS,
    P.defaultListStatement(),
    P.defaultListStatementLong(),
    P.urgencyReassurance(),
    P.comparisonSentence("additive_no_u", "additive_u"),
    RULES.flatMap((r) => [
      P.ruleRole(r),
      P.ruleSource(r),
      P.ruleRoleLine(r),
      P.ruleRelation(r),
      P.ruleExplanation(r),
      P.termsFor(r),
    ]),
  ];
  return {
    scoped: [...strings(scoped), ...method],
    neutral: strings(neutral),
    about: [...strings(about), ...method],
    method,
    P,
    schools,
  };
}

describe.each(RULES)("bound under %s", (rule) => {
  const surface = bind(rule);

  it("never says every input is recorded of a group the rule does not hold to that", async () => {
    const { scoped } = await surface;
    if (readsAll(rule)) return;
    expect(scoped.filter((t) => /every input recorded|All of its inputs are recorded/.test(t))).toEqual([]);
  });

  it("never calls the rule without urgency proposed or pending, nor the circulated rule the main rule", async () => {
    const { about } = await surface;
    const stale =
      /proposed|pending|awaiting|not yet reviewed|has not been redone|research team is reviewing|paper's main rule only|main rule in the research paper as circulated/i;
    expect(about.filter((t) => stale.test(t))).toEqual([]);
    // The only rule the surface calls the main rule is the one without urgency.
    expect(
      about.filter((t) => /(?:main rule|main one)[^.]*combined-factors rule with urgency \(S\)/i.test(t))
    ).toEqual([]);
  });

  it("names a complete group only by the size a rule that reads every input gives it", async () => {
    const { scoped, neutral } = await surface;
    const allowed = new Set(RULES.filter(readsAll).map(completeOf));
    const claims = [...scoped, ...neutral].flatMap((t) =>
      [...t.matchAll(/\b(\d[\d,]*) schools? (?:have|with|has) every input recorded/g)].map((m) =>
        Number(m[1].replace(/,/g, ""))
      )
    );
    for (const n of claims) expect(allowed.has(n), `${n} schools with every input recorded`).toBe(true);
  });

  it("never says a group is the same under every rule, or that places compare across rules because of it", async () => {
    const { scoped, neutral } = await surface;
    const bad = [...scoped, ...neutral].filter((t) =>
      /same group under every rule|same (?:\d+ )?schools under every rule|can be compared across rules|run on the .*schools with every input/i.test(
        t
      )
    );
    expect(bad).toEqual([]);
  });

  it("words the definitions of the whole method without the numbers of the rule bound", async () => {
    const { P } = await surface;
    for (const key of ["rank", "rank_range", "cohort_complete", "cohort_ranked", "compare"] as const) {
      const t = P.TERMS[key];
      expect(t.label + t.line + t.help, key).not.toMatch(/\d[\d,]* schools?|\(\d/);
    }
    expect(P.TERMS.compare.help).not.toMatch(/same group/);
  });
});

describe("the definitions of one rule", () => {
  it("count the group of that rule and say what it reads", async () => {
    const { P } = await bind("benchmark");
    expect(P.termsFor("benchmark").cohort_complete.label).toBe("A record for every input the rule uses (21)");
    expect(P.termsFor("benchmark").cohort_complete.help).not.toMatch(/compare rules|every rule/);
    const noUrgency = (await bind("additive_no_u")).P.termsFor("additive_no_u");
    expect(noUrgency.cohort_complete.label).toBe("A record for every input the rule uses (17)");
    const main = (await bind("additive_u")).P.termsFor("additive_u");
    expect(main.cohort_complete.label).toBe("Every input recorded (16)");
  });

  it("describe a comparison by the schools both rules put in order", async () => {
    const { P } = await bind("additive_u");
    expect(P.termsFor("additive_u").compare.help).toBe(
      "Comparisons come from the study's recorded comparison. Each one ranks the schools that both rules put in order, so the group can differ from one pair of rules to the next."
    );
  });
});
