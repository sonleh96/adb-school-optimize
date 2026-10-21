/**
 * The fixed copy: rule names, terms, strings, ideas, the explainer, the questions and the guides.
 *
 * Failure modes, each with the test that catches it:
 *  1. A string carries a leaked value, a double space, a dash, a banned word or a rule letter without its plain
 *     name. Every fixed string runs through the writing guards, with no data bound and with counts bound.
 *  2. A rule's role, source or urgency flag drifts, so a proposed rule reads as circulated. Checked per rule.
 *  3. A share is shown wrongly in words. One literal per rule family.
 *  4. A term loses a field, sits in two glossary groups or in none. Checked over the whole map.
 *  5. The three ideas lose their word counts when a number fills a slot. Checked with and without counts.
 *  6. The explainer states the two group sizes before it explains them, or the school-need section lacks its definition.
 *  7. A count appears in copy that has no data bound, or copy bound to one data set shows the counts of another,
 *     so a stale number could ship. Two invented data sets with no number in common stand in for the study.
 *  8. A source file gains an en or em dash.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { copyFor } from "@/lib/screening/copy";
import * as later from "@/lib/screening/copy/later";

import { Corpus, RULES, addFixedCopy, withLater, type FixedCopy } from "./helpers";

const FULL = {
  all: 148,
  complete: 96,
  range: 3,
  ranked: 99,
  queue: 49,
  urgencyZero: 110,
  emissionsNone: 31,
  airMissing: 3,
  remotenessOnly: 7,
  flagged: 5,
};
const SMALL = {
  all: 12,
  complete: 6,
  range: 2,
  ranked: 8,
  queue: 4,
  urgencyZero: 12,
  emissionsNone: 1,
  airMissing: 2,
  remotenessOnly: 1,
  flagged: 1,
};

describe("every fixed string follows the writing rules", () => {
  it("with no data bound, as the module exports them", () => {
    const corpus = new Corpus();
    addFixedCopy(corpus, { ...copy, ...later }, "unbound");
    expect(corpus.problems).toEqual([]);
    expect(corpus.checked).toBeGreaterThan(200);
  });

  it.each([
    ["a mid-sized set", FULL],
    ["a small data set", SMALL],
    [
      "one school",
      {
        all: 1,
        complete: 1,
        range: 0,
        ranked: 1,
        queue: 0,
        urgencyZero: 0,
        emissionsNone: 0,
        airMissing: 0,
        remotenessOnly: 0,
        flagged: 0,
      },
    ],
    [
      "no schools",
      {
        all: 0,
        complete: 0,
        range: 0,
        ranked: 0,
        queue: 0,
        urgencyZero: 0,
        emissionsNone: 0,
        airMissing: 0,
        remotenessOnly: 0,
        flagged: 0,
      },
    ],
  ])("with counts for %s", async (_name, counts) => {
    const corpus = new Corpus();
    addFixedCopy(corpus, await withLater(copyFor({ counts })), "bound");
    expect(corpus.problems).toEqual([]);
  });

  it("for interface words, help words, keyboard hints and the guides", () => {
    const corpus = new Corpus();
    const LAYOUT_ARGS: Record<string, unknown[]> = {
      otherRulesCount: [5],
      addedBy: ["School need"],
      backToCirculated: ["Combined factors, with urgency"],
      notComputedGroup: ["Need first, no urgency", 4],
      listTitle: [20, "the combined-factors rule with urgency (S)"],
      fingerprints: [15],
      afterDownload: ["the top list"],
      viewOf: [2, 4],
      positionOf: [3, 20],
      placeRange: ["3rd", "12th"],
      valueRange: ["0.487", "0.537"],
      underRule: ["Place in the list", "the combined-factors rule with urgency (S)"],
      groupMany: [3],
      tooltipMissing: ["classroom count blank, power source blank"],
      tipNotComputed: ["Need first"],
      savedToast: [3],
      removeView: ["Top of the list"],
    };
    const LAYOUT_SENTENCES = new Set([
      "workspaceHint",
      "rowHintQueue",
      "fingerprints",
      "afterDownload",
      "emptyFiltered",
      "emptyIncompleteFiltered",
      "afterDownloadList",
      "afterDownloadPack",
      "copyNotDone",
      "linkNotCopied",
      "emptyData",
      "loadFailed",
      "availableAfterLoad",
      "mapKeyboard",
      "basemapUnavailable",
      "refreshFailed",
      "sessionEnded",
    ]);
    for (const [k, v] of Object.entries(copy.LAYOUT)) {
      const text = typeof v === "function" ? (v as (...a: unknown[]) => string)(...LAYOUT_ARGS[k]) : v;
      corpus.add(`LAYOUT.${k}`, text, { sentence: LAYOUT_SENTENCES.has(k) });
    }
    for (const [k, v] of Object.entries(copy.HELP)) {
      const text = typeof v === "function" ? (v as (n: number) => string)(25) : v;
      corpus.add(`HELP.${k}`, text, {
        sentence: ["bar", "barKeys", "none", "liveOn", "liveOff"].includes(k),
        keys: ["barKeys", "liveOn", "esc"].includes(k),
      });
    }
    for (const [k, v] of Object.entries(copy.KEYS))
      corpus.add(`KEYS.${k}`, v, { sentence: false, keys: true });

    const G = later.GUIDE;
    corpus.add("GUIDE.stepOf", G.stepOf(1, 3), { sentence: false });
    corpus.add("GUIDE.stepCounter", G.stepCounter(2, 5, 1, 3), { sentence: false });
    corpus.add("GUIDE.pointToCard", G.pointToCard(3));
    corpus.add("GUIDE.pointToCard(0)", G.pointToCard(0));
    corpus.add("GUIDE.needNumbered", G.needNumbered(2, 3));
    corpus.add("GUIDE.needNumbered all", G.needNumbered(3, 3));
    corpus.add("GUIDE.pageHint", G.pageHint, { sentence: false, keys: true });
    corpus.add("GUIDE.pointToMissing", G.pointToMissing);
    for (const k of ["railAria", "sectionsAria", "seen", "viewFallbackOnScreen"] as const)
      corpus.add(`GUIDE.${k}`, G[k], { sentence: false });
    corpus.add("GUIDE.drift", G.drift);
    corpus.add("GUIDE.driftRestore", G.driftRestore, { sentence: false });
    corpus.add("GUIDE.stepCount", G.stepCount(4), { sentence: false });
    corpus.add("GUIDE.stepCount(1)", G.stepCount(1), { sentence: false });
    corpus.add("GUIDE.howCount", G.howCount(6), { sentence: false });
    corpus.add("GUIDE.howCount(1)", G.howCount(1), { sentence: false });
    corpus.add("GUIDE.seenCount", G.seenCount(2, 5), { sentence: false });
    corpus.add("GUIDE.rangeWords", G.rangeWords(5, 6), { sentence: false });
    corpus.add("GUIDE.rangeWords(equal)", G.rangeWords(5, 5), { sentence: false });
    for (const [k, v] of Object.entries(G.seedViews)) {
      corpus.add(`GUIDE.seedViews.${k}.name`, v.name, { sentence: false });
      const on = "onScreen" in v ? v.onScreen : null;
      if (on)
        corpus.add(
          `GUIDE.seedViews.${k}.onScreen`,
          typeof on === "function" ? on("Incomplete records") : on,
          { sentence: false }
        );
    }
    for (const t of G.tasks) {
      corpus.add(`GUIDE ${t.id}.title`, t.title, { sentence: false });
      corpus.add(`GUIDE ${t.id}.sub`, t.sub, { sentence: /\?$/.test(t.sub) });
      for (const st of t.steps as readonly Record<string, unknown>[]) {
        const text = (v: unknown, ...args: unknown[]) =>
          typeof v === "function" ? (v as (...a: unknown[]) => string)(...args) : (v as string);
        const where = `GUIDE ${t.id}.${String(st.key)}`;
        corpus.add(`${where}.onScreen`, st.onScreen, { sentence: false });
        if (st.title !== undefined) {
          corpus.add(`${where}.title`, text(st.title, "Alder Junior High School", "1st"), {
            sentence: false,
          });
          if (typeof st.title === "function")
            corpus.add(`${where}.title(other)`, text(st.title, "Alder", null), { sentence: false });
        }
        if (st.body !== undefined)
          corpus.add(`${where}.body`, text(st.body, "Birch", "Alder", "16th", "Hazel", "17th"));
        if (st.tryIt !== undefined) corpus.add(`${where}.tryIt`, text(st.tryIt, "Birch and Elm", 2));
      }
    }
    expect(corpus.problems).toEqual([]);
  });
});

describe("rules", () => {
  const ROLES = ["Main rule", "Strict alternative", "Sensitivity check", "Reference"];
  const SOURCES = ["As circulated in the paper", "Proposed, awaiting the research team's review"];

  it.each(RULES)(
    "%s has one of the four roles and one of the two sources, and a proposed rule leaves urgency out",
    (id) => {
      expect(ROLES).toContain(copy.ruleRole(id));
      expect(SOURCES).toContain(copy.ruleSource(id));
      if (copy.ruleSource(id) === SOURCES[1]) expect(copy.ruleUsesUrgency(id)).toBe(false);
      expect(copy.ruleName(id).endsWith(`(${copy.ruleSymbol(id)})`)).toBe(true);
      expect(copy.ruleShortName(id)).toMatch(/^[A-Z][a-z]+( [a-z]+)*(, no urgency)?$/);
      expect(copy.ruleLabel(id)).not.toMatch(/weight/i);
    }
  );

  it("writes each rule's words so the text guards pass", () => {
    const corpus = new Corpus();
    for (const id of RULES) {
      corpus.add(`ruleLabel(${id})`, copy.ruleLabel(id), { sentence: false });
      corpus.add(`ruleShortName(${id})`, copy.ruleShortName(id), { sentence: false });
      corpus.add(`ruleOneLine(${id})`, copy.ruleOneLine(id));
      corpus.add(`ruleRole(${id})`, copy.ruleRole(id), { sentence: false });
      corpus.add(`ruleSource(${id})`, copy.ruleSource(id), { sentence: false });
      corpus.add(`ruleRoleLine(${id})`, copy.ruleRoleLine(id), { sentence: false });
      corpus.add(`ruleName(${id})`, copy.ruleName(id), { sentence: false });
      corpus.add(`ruleExplanation(${id})`, copy.ruleExplanation(id));
      corpus.add(`ruleRelation(${id})`, copy.ruleRelation(id));
      corpus.add(`urgencyNote(${id})`, copy.urgencyNote(id));
      for (const key of ["N", "A", "U", "R", "Q", "E", "L", "need_part"] as const)
        corpus.add(`shareSentence(${id}, ${key})`, copy.shareSentence(id, key));
    }
    expect(corpus.problems).toEqual([]);
  });

  it("says a rule that leaves urgency out leaves it out", () => {
    expect(copy.shareSentence("additive_no_u", "U")).toBe("The urgency value is left out by this rule.");
    expect(copy.urgencyNote("additive_no_u").startsWith("Left out by this rule.")).toBe(true);
    expect(copy.urgencyNote("additive_u").startsWith("This rule uses the urgency value.")).toBe(true);
  });

  it("reads the two main rules differently", () => {
    expect(copy.ruleRoleLine("additive_u")).toBe("The paper's main rule");
    expect(copy.ruleRoleLine("additive_no_u")).toBe(
      "A proposed revision of the main rule that leaves urgency out, awaiting the research team's review"
    );
    expect(copy.ruleRoleLine("benchmark")).toBe("Reference, as circulated in the paper");
  });

  it.each([
    ["additive_u", "N", "School need counts for 60 percent of the screening score."],
    ["additive_no_u", "N", "School need counts for about 63 percent of the screening score."],
    ["additive_u", "need_part", "Each part of school need counts for 12 percent of the screening score."],
    ["benchmark", "Q", "Air quality is left out by this rule."],
    ["need_first_u", "N", "School need sets the order under this rule."],
    [
      "need_first_no_u",
      "R",
      "Walking reach only breaks exact ties between schools with the same school need.",
    ],
    [
      "bottleneck_u",
      "U",
      "The urgency value counts for 3 percent of the screening score, and a further 40 percent of the screening score when the urgency value is the school's largest factor.",
    ],
    [
      "bottleneck_no_u",
      "need_part",
      "Each part of school need counts for about 8 percent of the screening score, and a further 8 percent of the screening score when school need is the school's largest factor.",
    ],
  ] as const)("says %s's share of %s in words", (id, key, want) => {
    expect(copy.shareSentence(id, key)).toBe(want);
  });

  it("refuses a rule or a factor it has no words for", () => {
    expect(() => copy.ruleLabel("nope" as never)).toThrow("Unknown rule id: nope");
    expect(() => copy.shareSentence("additive_u", "X" as never)).toThrow("No factor called X");
    expect(copy.isCopyRuleId("additive_u")).toBe(true);
    expect(copy.isCopyRuleId("a_rule_the_api_adds_later")).toBe(false);
  });
});

describe("the term map", () => {
  const P = copyFor({ counts: FULL });

  it("gives every term all five fields", () => {
    for (const [key, t] of Object.entries(P.TERMS)) {
      for (const f of ["technical", "label", "line", "help", "where"] as const) {
        expect(t[f], `${key}.${f}`).toBeTruthy();
      }
    }
  });

  it("puts every term in exactly one glossary group, and only terms", () => {
    const grouped = later.GLOSSARY_GROUPS.flatMap((g) => g.keys);
    for (const key of Object.keys(P.TERMS))
      expect(
        grouped.filter((x) => x === key),
        key
      ).toHaveLength(1);
    for (const key of grouped) expect(P.TERMS, key).toHaveProperty(key);
    for (const g of later.GLOSSARY_GROUPS) expect(g.heading.split(/\s+/).length).toBeLessThanOrEqual(4);
  });

  it("refuses a term it does not have", () => {
    expect(() => copy.term("nope" as never)).toThrow("Unknown term: nope");
    expect(copy.term("rank").label).toBe("Place in the list");
  });

  it("keeps the urgency definition in one place", () => {
    expect(P.TERMS.urgency.line).toBe(P.STRINGS.urgencyDefinition);
    for (const phrase of ["described as hazard-related", "could not be traced", "not known"]) {
      expect(P.STRINGS.urgencyDefinition).toContain(phrase);
    }
  });
});

describe("the three ideas", () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it.each([
    ["no counts", {}],
    ["a mid-sized set", FULL],
    ["a few schools", SMALL],
    ["one range school and one incomplete record", { ...SMALL, range: 1, ranked: 7, queue: 1 }],
    ["no range schools", { ...SMALL, range: 0, ranked: 6, queue: 0 }],
    ["thousands of schools", { all: 12900, complete: 10000, range: 180, ranked: 10180, queue: 2720 }],
  ])("hold their word counts with %s", (_name, counts) => {
    for (const [key, idea] of Object.entries(copy.buildIdeas(counts))) {
      expect(words(idea.short), `${key}.short`).toBe(25);
      expect(words(idea.long), `${key}.long`).toBe(60);
    }
  });

  it("never says 'Some schools' of a single school, and uses the plural for several", () => {
    const one = copy.buildIdeas({ ...SMALL, range: 1, ranked: 7, queue: 1 });
    expect(one.ranges.title).toBe("One school shows a range because a reading is missing");
    expect(one.queue.title).toBe("One school has no place in the list yet because its record is incomplete");
    for (const text of Object.values(one.ranges).concat(Object.values(one.queue)))
      expect(text, text).not.toMatch(/\bSome schools\b|\b(?:they|their|them|these schools|each one)\b/i);
    expect(one.queue.long).toMatch(/^One of the 12 schools has an incomplete record/);
    const several = copy.buildIdeas({ ...SMALL, range: 2, queue: 4 });
    expect(several.ranges.title).toBe("Two schools show a range because a reading is missing");
    expect(several.queue.short).toMatch(/^4 schools have no place/);
  });

  it("says what an air-quality reading is wherever it names the range", () => {
    expect(copy.IDEAS.ranges.short).toContain("air-pollution");
    expect(copy.IDEAS.ranges.long).toContain("air-pollution");
  });
});

describe("the explainer and the questions", async () => {
  const P = await withLater(copyFor({ counts: FULL }));

  it("has six sections of at least three sentences, each key once", () => {
    expect(P.HOW_IT_WORKS.map((s) => s.key)).toEqual([
      "purpose",
      "placed",
      "need",
      "inputs",
      "rules",
      "limits",
    ]);
    for (const s of P.HOW_IT_WORKS) expect(s.sentences.length, s.key).toBeGreaterThanOrEqual(3);
  });

  it("explains the two group sizes together, in the groups sentence, before it states either alone", () => {
    const flat = P.HOW_IT_WORKS.flatMap((s) => s.sentences);
    const firstCount = flat.find((t) => new RegExp(`\\b(${FULL.complete}|${FULL.ranked})\\b`).test(t));
    expect(firstCount).toBe(`Under the paper's main rule, ${P.groupsSentence("additive_u")}`);
    expect(P.scope("additive_u").groups).toBe(
      "96 schools have every input recorded, and three more lack a reading such as air quality and show a range of places, so 99 schools can be put in order."
    );
  });

  it("defines school need in its own section and shares the separate-measures and urgency sentences", () => {
    const need = P.HOW_IT_WORKS.find((s) => s.key === "need");
    expect(need?.sentences).toContain(P.STRINGS.schoolNeedDefinition);
    const flat = P.HOW_IT_WORKS.flatMap((s) => s.sentences);
    expect(flat).toContain(P.STRINGS.separateMeasures);
    expect(flat).toContain(P.STRINGS.urgencyDefinition);
  });

  it("asks five questions in a fixed order, each answered by a function the copy exports", () => {
    expect(P.FIRST_QUESTIONS.map((q) => q.key)).toEqual(["purpose", "why", "ranges", "incomplete", "trust"]);
    for (const q of P.FIRST_QUESTIONS) {
      expect(q.question.endsWith("?"), q.key).toBe(true);
      expect(typeof (copy as Record<string, unknown>)[q.live], `${q.key} -> ${q.live}`).toBe("function");
    }
  });

  it("holds five guides", () => {
    expect(later.GUIDE.tasks.map((t) => t.id)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
  });
});

describe("the fixed strings that carry a rule of the project", () => {
  it("keeps the precise caveat for analyst views and a plain one for the screen", () => {
    expect(copy.STRINGS.caveat).toBe(
      "This screen proposes schools for inspection. It does not establish school condition, site safety, intervention benefit or an optimal investment plan."
    );
    expect(copy.STRINGS.caveatAnalyst).toBe(copy.STRINGS.caveat);
    expect(copy.STRINGS.caveatPlain).toBe(
      "This tool suggests which schools to look at first. It does not show a school's real condition or safety, whether repairs would help, or how to spend money."
    );
  });

  it("names a missing reading as listed where it would sit if air quality added nothing, never as 0", () => {
    expect(copy.buildScope({}).listOrder).toContain("added nothing");
    expect(copy.TERMS.list_order.line).toContain("added nothing");
  });

  it("keeps method detail out of the plain flag text", () => {
    expect(copy.STRINGS.persistentFlag).not.toMatch(/5,000|Dirichlet/);
    expect(copy.STRINGS.persistentFlagMethod).toMatch(/5,000/);
  });

  it("opens every scope sentence with the groups sentence", () => {
    const P = copyFor({ counts: FULL });
    for (const t of [
      P.scope("additive_u").scopeComplete,
      P.scope("additive_u").scopeRanked,
      P.termsFor("additive_u").cohort_complete.line,
      P.termsFor("additive_u").cohort_ranked.line,
      P.termsFor("additive_u").rank_range.help,
    ]) {
      expect(t.startsWith(P.scope("additive_u").groups)).toBe(true);
    }
    expect(P.scope("additive_u").scopeShort).toBe(
      "99 schools can be put in order, 96 with every input recorded and 3 that show a range of places."
    );
  });
});

describe("counts belong to the data they came from", () => {
  // Two invented data sets. No number of one appears in the other, and none is a size the copy uses for anything else.
  const SET_A = {
    all: 47,
    complete: 27,
    range: 6,
    ranked: 33,
    queue: 14,
    urgencyZero: 31,
    emissionsNone: 9,
    airMissing: 6,
    remotenessOnly: 3,
    flagged: 2,
  };
  const SET_B = {
    all: 91,
    complete: 68,
    range: 13,
    ranked: 81,
    queue: 22,
    urgencyZero: 70,
    emissionsNone: 17,
    airMissing: 13,
    remotenessOnly: 8,
    flagged: 7,
  };
  const numbersOf = (set: Record<string, number>) => Object.values(set).filter((n) => n >= 10);
  const mentions = (set: Record<string, number>) =>
    new RegExp(`(?<![\\w.,])(${numbersOf(set).join("|")})(?![\\w%,])`);
  const textsOf = (P: FixedCopy) => {
    const corpus = new Corpus();
    addFixedCopy(corpus, P, "set");
    for (const [k, t] of Object.entries(P.TERMS))
      corpus.add(`TERMS.${k}.technical`, t.technical, { sentence: false, plain: false });
    return corpus.texts.filter(([label]) => !label.endsWith("persistentFlagMethod"));
  };

  it("keeps the counts of one data set out of the copy bound to the other", async () => {
    for (const [own, other] of [
      [SET_A, SET_B],
      [SET_B, SET_A],
    ]) {
      const texts = textsOf(await withLater(copyFor({ counts: own })));
      expect(texts.filter(([, t]) => mentions(other).test(t)).map(([label]) => label)).toEqual([]);
      // The copy does say its own counts, so the check above is not passing on silence.
      expect(texts.filter(([, t]) => mentions(own).test(t)).length).toBeGreaterThan(10);
    }
  });

  it("states no count of either data set with no data bound", () => {
    const texts = textsOf({ ...copy, ...later });
    for (const set of [SET_A, SET_B]) expect(texts.filter(([, t]) => mentions(set).test(t))).toEqual([]);
  });

  it("builds the module's own copy from no counts at all", () => {
    expect(copy.TERMS).toEqual(copy.buildTerms({}));
    expect(copy.STRINGS).toEqual(copy.buildStrings({}));
    expect(copy.IDEAS).toEqual(copy.buildIdeas({}));
    expect(later.HOW_IT_WORKS).toEqual(later.buildHow({}));
    expect(later.FIRST_QUESTIONS).toEqual(later.buildQuestions());
    expect(copy.buildScope({}).groups).toBe(
      "Schools with every input recorded have one place each, and schools that lack a reading such as air quality show a range of places; together they can be put in order."
    );
  });

  it("labels the three groups for analysts with their size only in bound copy", () => {
    expect(copy.TERMS.cohort_complete.technical).toBe("Complete-primary cohort");
    expect(copy.TERMS.cohort_ranked.technical).toBe("Condition-eligible cohort");
    expect(copy.TERMS.queue.technical).toBe("Verification queue");
    const A = copyFor({ counts: SET_A }).termsFor("additive_u");
    expect([A.cohort_complete.technical, A.cohort_ranked.technical, A.queue.technical]).toEqual([
      "Complete-primary cohort, 27 schools",
      "Condition-eligible cohort, 33 schools",
      "Verification queue, 14 schools",
    ]);
    expect(copyFor({ counts: { queue: 1 } }).termsFor("additive_u").queue.technical).toBe(
      "Verification queue, 1 school"
    );
  });

  it("differs from copy bound to empty data, which counts zero schools", () => {
    expect(copyFor({}).scope("additive_u").groups).toBe(
      "No school has every input recorded, so no school can be put in order."
    );
    expect(copy.TERMS.cohort_complete.label).toBe("Every input recorded");
    expect(copy.TERMS.cohort_ranked.label).toBe("Can be put in order");
  });
});

describe("the source files", () => {
  const dir = path.resolve(__dirname, "../../../lib/screening/copy");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));

  it("hold no en or em dash", () => {
    const offenders = files.filter((f) => /[\u2013\u2014]/.test(readFileSync(path.join(dir, f), "utf8")));
    expect(offenders).toEqual([]);
    expect(files.length).toBeGreaterThan(10);
  });

  it("never read the retired queue_priority signal", () => {
    const offenders = files.filter((f) =>
      /\.queue_priority|\[['"]queue_priority['"]\]/.test(readFileSync(path.join(dir, f), "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});
