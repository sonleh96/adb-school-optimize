/**
 * Sentences that compare rules, and the one that names the first schools of a list.
 *
 * Failure modes, each with the test that catches it:
 *  1. Agreement between two rules is framed two ways, or claims more than the recorded overlaps support. Each
 *     branch (everyone is in, all the same, some the same, a larger size shared) has its own case.
 *  2. A school that joins or leaves the top list is missing, listed under the wrong direction, or named at the
 *     wrong place. Read both ways round, the joiners of one must be the leavers of the other.
 *  3. The "which list" answer generalises beyond the schools both rules ordered, or names a shared size the data
 *     does not hold. The size is recomputed here from the overlaps.
 *  4. The first schools of a list are the wrong ones, or a range school that could be among them is left out.
 *  5. A comparison the response does not hold reads as a fact. It must say none is recorded.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { copyFor, pairwiseFromCompare, placedFromResults } from "@/lib/screening/copy";

import { Corpus, RULES, fixtureCompare, fixtureResults, school } from "./helpers";
import { parseWith } from "@/lib/screening/schema";
import { type CompareResponse, compareResponse } from "@/lib/screening/types";

const A = "additive_u";
const B = "additive_no_u";

interface Change {
  name: string;
  rankA: number;
  rankB: number;
}

/** A /compare response, as the API sends it, for the cases the saved one does not cover. */
function compare(options: {
  n?: number;
  overlaps?: [number, number, number, number];
  median?: number | null;
  maximum?: number | null;
  entrants?: Change[];
  exits?: Change[];
  a?: string;
  b?: string;
}): CompareResponse {
  const { n = 84, overlaps = [10, 20, 30, 40], median = 1, maximum = 7, entrants = [], exits = [] } = options;
  const identity = (name: string) => ({
    school_key: `key-${name}`,
    source_school_name: name,
    province: null,
    district: null,
    locality: null,
    latitude: null,
    longitude: null,
  });
  const change = (status: string) => (c: Change) => ({
    status,
    school: identity(c.name),
    rank_a: c.rankA,
    rank_b: c.rankB,
    rank_scope: `common complete cohort (${n})`,
    rank_scope_code: "common_complete_cohort",
  });
  const run = (rule_id: string) => ({ rule_id, input_version: "test", package_version: "test" });
  return parseWith(
    compareResponse,
    {
      input_version: "test",
      run_a: run(options.a ?? A),
      run_b: run(options.b ?? B),
      common_cohort_scope: `common complete cohort (${n})`,
      common_cohort_scope_code: "common_complete_cohort",
      common_cohort_count: n,
      metrics: {
        n,
        median_absolute_rank_shift: median,
        maximum_absolute_rank_shift: maximum,
        top_k: [10, 20, 30, 40].map((k, i) => ({ k, overlap: overlaps[i] })),
      },
      ranks: [],
      entrants: entrants.map(change("entrant")),
      exits: exits.map(change("exit")),
      excluded_schools: [],
    },
    "compare"
  );
}

const sentenceFor = (c: CompareResponse, a = A as copy.CopyRuleId, b = B as copy.CopyRuleId, opts = {}) => {
  const data = pairwiseFromCompare(c);
  return copyFor({
    counts: { all: 96, complete: 84, range: 3, ranked: 87, queue: 9 },
    ...data,
  }).comparisonSentence(a, b, undefined, opts);
};

const HEAD =
  "This compares the combined-factors rule with urgency (S) with the combined-factors rule without urgency (S0) among the 84 schools with every input recorded.";

describe("how two rules agree", () => {
  it("says the same top 20 and the largest shared top list when every overlap is full", () => {
    expect(sentenceFor(compare({ median: 1, maximum: 7 }))).toBe(
      `${HEAD} The same 20 schools make the top 20 under both, and the same 40 make the top 40. Half of the schools move 1 place or fewer, and the largest move is 7 places.`
    );
  });

  it("stops at 20 when 30 is not shared in full", () => {
    expect(sentenceFor(compare({ overlaps: [10, 20, 28, 33], median: 0, maximum: 1 }))).toBe(
      `${HEAD} The same 20 schools make the top 20 under both. At least half of the schools keep the same place in the list, and the largest move is 1 place.`
    );
  });

  it("counts the shared schools when the top 20 differs", () => {
    expect(sentenceFor(compare({ overlaps: [9, 17, 28, 36], median: 2, maximum: 13 }))).toBe(
      `${HEAD} 17 of the top 20 schools are the same under both. Half of the schools move 2 places or fewer, and the largest move is 13 places.`
    );
  });

  it("says everyone is in the top list when both rules ordered no more schools than it holds", () => {
    expect(sentenceFor(compare({ n: 16, overlaps: [9, 16, 16, 16] }))).toContain(
      "All 16 schools with every input recorded are in the top 20 under both."
    );
    expect(sentenceFor(compare({ n: 1, overlaps: [1, 1, 1, 1] }))).toContain(
      "The one school with every input recorded is in the top 20 under both."
    );
  });

  it("uses the top 10 when asked", () => {
    const text = sentenceFor(compare({ overlaps: [10, 20, 30, 40] }), A, B, { top: 10 });
    expect(text).toContain(
      "The same 10 schools make the top 10 under both, and the same 40 make the top 40."
    );
  });
});

describe("the schools that join or leave the top 20", () => {
  const entrants = [{ name: "Newcomer", rankA: 24, rankB: 18 }];
  const exits = [{ name: "Leaver ", rankA: 17, rankB: 22 }];

  it("lists each move when there are four or fewer", () => {
    expect(sentenceFor(compare({ overlaps: [10, 19, 28, 36], entrants, exits }))).toBe(
      `${HEAD} 19 of the top 20 schools are the same under both. When you switch to the combined-factors rule without urgency (S0), Newcomer moves from 24th to 18th and joins the top 20. Leaver moves from 17th to 22nd and drops out of the top 20. Half of the schools move 1 place or fewer, and the largest move is 7 places.`
    );
  });

  it("reads the other way round as the reverse moves", () => {
    const data = pairwiseFromCompare(compare({ overlaps: [10, 19, 28, 36], entrants, exits }));
    const text = copyFor({ counts: { complete: 84 }, ...data }).comparisonSentence(B, A);
    expect(text).toContain(
      "When you switch to the combined-factors rule with urgency (S), Leaver moves from 22nd to 17th and joins the top 20. Newcomer moves from 18th to 24th and drops out of the top 20."
    );
  });

  it("groups them when there are more than four, joiners by place and leavers by place", () => {
    const many = compare({
      overlaps: [10, 17, 27, 36],
      entrants: [
        { name: "Zed", rankA: 40, rankB: 19 },
        { name: "Yan", rankA: 22, rankB: 3 },
        { name: "Xu", rankA: 21, rankB: 8 },
      ],
      exits: [
        { name: "Wim", rankA: 9, rankB: 31 },
        { name: "Vee", rankA: 2, rankB: 25 },
        { name: "Uli", rankA: 14, rankB: 29 },
      ],
    });
    expect(sentenceFor(many)).toBe(
      `${HEAD} 17 of the top 20 schools are the same under both. When you switch to the combined-factors rule without urgency (S0), Yan, Xu and Zed join the top 20. Vee, Wim and Uli drop out. Half of the schools move 1 place or fewer, and the largest move is 7 places.`
    );
  });

  it("says one joiner and no leaver with a single verb", () => {
    const many = compare({
      overlaps: [10, 15, 25, 35],
      entrants: [
        { name: "A1", rankA: 21, rankB: 1 },
        { name: "A2", rankA: 22, rankB: 2 },
        { name: "A3", rankA: 23, rankB: 3 },
        { name: "A4", rankA: 24, rankB: 4 },
        { name: "A5", rankA: 25, rankB: 5 },
      ],
    });
    expect(sentenceFor(many)).toContain(
      "When you switch to the combined-factors rule without urgency (S0), A1, A2, A3, A4 and A5 join the top 20. Half"
    );
    const one = compare({ overlaps: [10, 19, 28, 36], entrants: [{ name: "Solo", rankA: 21, rankB: 20 }] });
    expect(sentenceFor(one)).toContain("Solo moves from 21st to 20th and joins the top 20.");
  });

  it("names the top 10 changes from the schools' own places when asked", () => {
    const place = (id: string, name: string, u: number, nu: number) => ({
      ...school({ id, name }),
      results: { additive_u: { rank_complete120: u }, additive_no_u: { rank_complete120: nu } },
    });
    const schools = [
      place("1", "S1", 1, 1),
      place("2", "S2", 2, 3),
      place("3", "S3", 3, 2),
      place("4", "S4", 4, 4),
      place("5", "S5", 5, 5),
      place("6", "S6", 6, 6),
      place("7", "S7", 7, 7),
      place("8", "S8", 8, 12),
      place("9", "S9", 9, 8),
      place("10", "S10", 10, 9),
      place("11", "S11", 11, 10),
      place("12", "S12", 12, 11),
    ];
    const c = compare({ overlaps: [9, 20, 30, 40] });
    const data = pairwiseFromCompare(c);
    const text = copyFor({
      counts: { complete: 12 },
      countsByRule: "shared",
      schools,
      ...data,
    }).comparisonSentence(A, B, undefined, {
      top: 10,
    });
    expect(text).toContain("9 of the top 10 schools are the same under both.");
    expect(text).toContain(
      "When you switch to the combined-factors rule without urgency (S0), S11 moves from 11th to 10th and joins the top 10. S8 moves from 8th to 12th and drops out of the top 10."
    );
  });

  it("names no change it was not given the schools for", () => {
    const text = sentenceFor(compare({ overlaps: [9, 20, 30, 40] }), A, B, { top: 10 });
    expect(text).not.toContain("When you switch");
  });
});

describe("a comparison the response does not hold", () => {
  it("says none is recorded for a pair with no row", () => {
    expect(copyFor({}).comparisonSentence(A, "benchmark", { pairwise: [], top20Changes: [] })).toBe(
      "No recorded comparison exists for the combined-factors rule with urgency (S) and the conventional benchmark (B)."
    );
  });

  it("says nothing moves when both sides are the same rule", () => {
    expect(copyFor({}).comparisonSentence(A, A, { pairwise: [], top20Changes: [] })).toBe(
      "Both sides use the same rule, so nothing moves."
    );
  });

  it("yields no row when no school is common, a shift is unknown, or the rule is unknown to the copy", () => {
    expect(pairwiseFromCompare(compare({ n: 0 }))).toEqual({ pairwise: [], top20Changes: [] });
    expect(pairwiseFromCompare(compare({ median: null }))).toEqual({ pairwise: [], top20Changes: [] });
    expect(pairwiseFromCompare(compare({ maximum: null }))).toEqual({ pairwise: [], top20Changes: [] });
    expect(pairwiseFromCompare(compare({ b: "a_rule_added_later" }))).toEqual({
      pairwise: [],
      top20Changes: [],
    });
  });

  it("refuses a response that lacks one of the four top-list sizes", () => {
    const broken = compare({});
    broken.metrics.top_k = broken.metrics.top_k.filter((t) => t.k !== 30);
    expect(() => pairwiseFromCompare(broken)).toThrow("metrics.top_k: no entry for the top 30");
  });
});

describe("which list to use", () => {
  /** The largest top-list size the two rules share in full, found from the overlaps. */
  const sharedSize = (overlaps: number[]) =>
    [40, 30, 20, 10].find((k) => overlaps[[10, 20, 30, 40].indexOf(k)] === k);

  it.each([[[10, 20, 30, 40]], [[10, 20, 30, 38]], [[10, 20, 27, 35]], [[10, 17, 25, 33]]] as [number[]][])(
    "states the shared size for overlaps %j",
    (overlaps) => {
      const row = pairwiseFromCompare(
        compare({ overlaps: overlaps as [number, number, number, number] })
      ).pairwise;
      const P = copyFor({
        counts: { complete: 84, range: 3, ranked: 87, all: 96, queue: 9 },
        pairwise: row,
      });
      const K = sharedSize(overlaps);
      const lead =
        "Which list should I use? This one, the paper's main rule, until the research team decides.";
      if (overlaps[1] === 20) {
        const tail = K && K > 20 ? ` and top ${K}` : "";
        expect(P.defaultListStatement()).toBe(
          `${lead} Leaving urgency out keeps the same top 20${tail} among the 84 with every input recorded.`
        );
      } else {
        expect(P.defaultListStatement()).toBe(
          `${lead} Leaving urgency out keeps ${overlaps[1]} of the top 20 among the 84 with every input recorded.`
        );
      }
      expect(P.defaultListStatement().length).toBeLessThanOrEqual(200);
      expect(P.defaultListStatementLong()).toBe(
        `This list uses the paper's main rule, the combined-factors rule with urgency (S). Use it until the research team decides on the proposed revision, the combined-factors rule without urgency (S0). Among the 84 schools with every input recorded, ${
          overlaps[1] === 20
            ? `the same 20 schools make the top 20 under both${K && K > 20 ? `, and the same ${K} make the top ${K}` : ""}.`
            : `${overlaps[1]} of the top 20 schools are the same under both.`
        }`
      );
    }
  );

  it("keeps its scope when the two rules ordered 20 schools or fewer", () => {
    const P = copyFor({ counts: { complete: 16 }, pairwise: pairwiseFromCompare(fixtureCompare()).pairwise });
    expect(P.defaultListStatement()).toBe(
      "Which list should I use? This one, the paper's main rule, until the research team decides. Leaving urgency out keeps the same schools at the top among the 16 with every input recorded."
    );
  });

  it("gives the plain lead alone when there is no recorded comparison", () => {
    const lead = "Which list should I use? This one, the paper's main rule, until the research team decides.";
    expect(copyFor({}).defaultListStatement()).toBe(lead);
    expect(copyFor({}).defaultListStatementLong()).toBe(
      "This list uses the paper's main rule, the combined-factors rule with urgency (S). Use it until the research team decides on the proposed revision, the combined-factors rule without urgency (S0)."
    );
    expect(copyFor({}).urgencyReassurance()).toBe(
      "No recorded comparison exists for the combined-factors rules with and without urgency."
    );
  });

  it("reads a largest move of one place in the singular, in both sentences that state it", () => {
    const pairwise = pairwiseFromCompare(compare({ median: 1, maximum: 1 })).pairwise;
    const P = copyFor({
      schools: [school({ id: "c1", place: 1 })],
      counts: { complete: 84 },
      countsByRule: "shared",
      pairwise,
    });
    expect(P.comparisonSentence("additive_u", "additive_no_u")).toContain(
      "Half of the schools move 1 place or fewer, and the largest move is 1 place."
    );
    expect(P.urgencyReassurance()).toContain("the largest move for any school is 1 place.");
    for (const text of [P.comparisonSentence("additive_u", "additive_no_u"), P.urgencyReassurance()])
      expect(text).not.toMatch(/\b1 places\b/);
  });

  it("reassures about the schools both rules ordered only, and says the range schools can still move", async () => {
    const ranges = [1, 2, 3].map((i) => school({ id: `r${i}`, cohort: "interval", bounds: [5, 9] }));
    const full = [school({ id: "c1", place: 1 }), ...ranges];
    const pairwise = pairwiseFromCompare(compare({ overlaps: [10, 20, 30, 40], maximum: 9 })).pairwise;
    const text = copyFor({
      schools: full,
      counts: { complete: 84, range: 3 },
      countsByRule: "shared",
      pairwise,
    }).urgencyReassurance();
    expect(text).toBe(
      "Among the 84 schools with every input recorded, the same 20 schools make the top 20 with or without the urgency value, and the same 40 make the top 40. Leaving it out changes the order in the list, and the largest move for any school is 9 places. For the three schools that show a range, leaving it out can still move their possible places."
    );
    const P = copyFor({
      schools: full,
      counts: { complete: 84, range: 3 },
      countsByRule: "shared",
      pairwise,
    });
    const L = await P.later();
    expect(L.FIRST_QUESTIONS.find((q) => q.key === "trust")?.answer).toBe(
      `${text} The research team is reviewing the revision that leaves it out, so the screen opens on the paper's main rule.`
    );
    expect(
      L.HOW_IT_WORKS.flatMap((s) => s.sentences).some((t) =>
        t.includes("the same 20 schools make the top 20 with or without urgency")
      )
    ).toBe(false);
  });

  it("builds the explainer's example from the range school whose possible places move most", async () => {
    const moves = (id: string, name: string, u: [number, number], nu: [number, number]) => ({
      ...school({ id, name, cohort: "interval" }),
      results: {
        additive_u: { rank_best: u[0], rank_worst: u[1] },
        additive_no_u: { rank_best: nu[0], rank_worst: nu[1] },
      },
    });
    const schools = [
      moves("m1", "Larch High School", [12, 18], [18, 30]),
      moves("m2", "Small Move", [5, 6], [5, 7]),
      moves("m3", "No Move", [3, 4], [3, 4]),
    ];
    const pairwise = pairwiseFromCompare(compare({ overlaps: [10, 20, 30, 40] })).pairwise;
    const P = copyFor({
      schools,
      counts: { all: 3, complete: 84, range: 3, ranked: 87, queue: 0 },
      countsByRule: "shared",
      pairwise,
    });
    const limits = (await P.later()).HOW_IT_WORKS.find((s) => s.key === "limits")?.sentences ?? [];
    expect(limits).toContain(
      "For example, among the 84 schools with every input recorded, the same 20 schools make the top 20 with or without urgency, and the same 40 make the top 40, but Larch High School's possible places among all 87 schools that can be put in order move from 12th to 18th with urgency to 18th to 30th without it."
    );
  });
});

describe("the first schools of a list", () => {
  const places = (...names: string[]) => names.map((name, i) => school({ id: `c${i}`, name, place: i + 1 }));

  it("names the first three, in order", () => {
    const rows = placedFromResults(fixtureResults(A));
    expect(copy.listStartsSentence(rows, A)).toBe(
      "Under the combined-factors rule with urgency (S), the first three of the 16 schools with every input recorded are Sample School 08, Sample School 15 and Sample School 13."
    );
  });

  it("names a range school that could also be among them", () => {
    const list = [
      ...places("One", "Two", "Three", "Four"),
      school({ id: "r1", name: "Edge", cohort: "interval", bounds: [3, 9] }),
      school({ id: "r2", name: "Far", cohort: "interval", bounds: [4, 9] }),
    ];
    expect(copy.listStartsSentence(list, A)).toBe(
      "Under the combined-factors rule with urgency (S), the first three of the 4 schools with every input recorded are One, Two and Three. Edge could also be among the first three, because it shows a range."
    );
    const both = [...list, school({ id: "r3", name: "Near", cohort: "interval", bounds: [1, 2] })];
    expect(copy.listStartsSentence(both, A)).toContain(
      "Edge and Near could also be among the first three, because they show a range."
    );
  });

  it("says the first of one school, and the first two of two", () => {
    expect(copy.listStartsSentence(places("Solo"), A)).toBe(
      "Under the combined-factors rule with urgency (S), the first of the one school with every input recorded is Solo."
    );
    expect(copy.listStartsSentence(places("A1", "B2"), A)).toContain("the first two of the 2 schools");
  });

  it("orders by the rule's place, not the order of the list", () => {
    const shuffled = [
      school({ id: "x", name: "Third", place: 3 }),
      school({ id: "y", name: "First", place: 1 }),
      school({ id: "z", name: "Second", place: 2 }),
    ];
    expect(copy.listStartsSentence(shuffled, A)).toContain("are First, Second and Third.");
  });

  it("says no school has a single place when none does", () => {
    expect(copy.listStartsSentence([], A)).toBe(
      "Under the combined-factors rule with urgency (S), no school has every input recorded, so the list has no single places yet."
    );
    expect(copy.listStartsSentence([school({ id: "q", cohort: "queue" })], A)).toContain(
      "no school has every input recorded"
    );
  });
});

describe("comparison text passes the writing guards", () => {
  it("for the saved comparison and every shape built above", () => {
    const corpus = new Corpus();
    const shapes = [
      fixtureCompare(),
      compare({}),
      compare({ overlaps: [9, 17, 28, 36], median: 0, maximum: 1 }),
      compare({
        overlaps: [10, 15, 25, 35],
        entrants: [
          { name: "A1", rankA: 21, rankB: 1 },
          { name: "A2", rankA: 22, rankB: 2 },
          { name: "A3", rankA: 23, rankB: 3 },
        ],
        exits: [
          { name: "B1", rankA: 4, rankB: 30 },
          { name: "B2", rankA: 5, rankB: 31 },
        ],
      }),
    ];
    shapes.forEach((c, i) => {
      const P = copyFor({
        counts: { complete: 84, range: 3, ranked: 87, all: 96, queue: 9 },
        ...pairwiseFromCompare(c),
      });
      for (const x of RULES)
        for (const y of RULES) corpus.add(`shape ${i} ${x}>${y}`, P.comparisonSentence(x, y));
      corpus.add(`shape ${i} reassurance`, P.urgencyReassurance());
      corpus.add(`shape ${i} statement`, P.defaultListStatement());
      corpus.add(`shape ${i} long`, P.defaultListStatementLong());
    });
    expect(corpus.problems).toEqual([]);
  });
});
