/**
 * Names inside sentences (R18). A name has to be set apart on screen, so every sentence that embeds one can be
 * asked for its segments: the plain text with each name marked.
 *
 * Failure modes, each with the test that catches it:
 *  1. The marked form and the plain string say different things: every segments function is compared with its string
 *     function, and the string is derived from the segments, so the test also runs the plain function over a battery.
 *  2. A name is embedded but not marked, or marked twice: schools with unique tokens as names run through every
 *     function, and each token must appear in the text exactly as often as it is marked.
 *  3. A name is marked that is not embedded, or the names come out in the wrong order: the expected names are
 *     written out for each function.
 *  4. A one-letter name reads as punctuation or a rule letter: a school called "J" is marked like any other.
 *  5. Something that is not a name is marked (a rule's name, a district): the marked names are compared with the
 *     schools' names alone.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import type { CopyRuleId, PairwiseRow, PlacedSchool, Top20Change } from "@/lib/screening/copy";
import { GUIDE, GUIDE_SEGMENTS, LAYOUT } from "@/lib/screening/copy";
import {
  joinSegments,
  listSegments,
  nameList,
  nameSegment,
  namesIn,
  seg,
  spansOf,
  textOf,
} from "@/lib/screening/copy";

import { school } from "./helpers";

const S: CopyRuleId = "additive_u";
const S0: CopyRuleId = "additive_no_u";
const B: CopyRuleId = "benchmark";

describe("segments", () => {
  it("merge adjacent text, splice arrays and numbers, and drop nothing that is said", () => {
    const j = nameSegment("J");
    const s = seg`Hello ${"there"}, ${j} is ${3}rd${""}.`;
    expect(s).toEqual(["Hello there, ", j, " is 3rd."]);
    expect(textOf(s)).toBe("Hello there, J is 3rd.");
    expect(textOf(seg`${[j, " and ", j]}`)).toBe("J and J");
    expect(namesIn(seg`${[j, " and ", nameSegment("K", "saved-view")]}`)).toEqual(["J", "K"]);
    expect(namesIn(seg`${[j, " and ", nameSegment("K", "saved-view")]}`, "saved-view")).toEqual(["K"]);
  });

  it("find each name's offsets in the plain text", () => {
    const s = seg`Under the rule, ${nameSegment("J")} is 3rd and ${nameSegment("Kay")} is 4th.`;
    const text = textOf(s);
    const spans = spansOf(s);
    expect(spans.map((x) => text.slice(x.start, x.end))).toEqual(["J", "Kay"]);
    expect(spans.map((x) => x.name)).toEqual(["J", "Kay"]);
  });

  it("list names as joinList does", () => {
    for (const names of [["A"], ["A", "B"], ["A", "B", "C"], ["A", "B", "C", "D"]]) {
      const listed = nameList(names);
      expect(textOf(listed)).toBe(
        names.length === 1
          ? "A"
          : names.length === 2
            ? "A and B"
            : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
      );
      expect(namesIn(listed)).toEqual(names);
    }
    expect(textOf(listSegments([["x"], ["y"]], "or"))).toBe("x or y");
    expect(textOf(joinSegments([["a"], ["b"]], "-"))).toBe("a-b");
    expect(() => listSegments([])).toThrow("joinList needs at least one item");
  });
});

/** Unique tokens for names, so a name can be found in a sentence without guessing. */
const tok = (i: number) => `Qz${i}x`;
const occurrences = (text: string, token: string) => text.split(token).length - 1;

describe("a school's name in a place sentence", () => {
  const J = school({ id: "j", name: "J", place: 3 });
  const gamma = school({ id: "g", name: tok(1), cohort: "interval", bounds: [4, 9] });
  const P = copy.copyFor({ counts: { complete: 16, range: 5, ranked: 21 } });

  it("is marked when the sentence starts with it, and absent when it does not", () => {
    const withName = P.segments.rankSentence(J, S, { name: true });
    expect(namesIn(withName)).toEqual(["J"]);
    expect(textOf(withName)).toBe(P.rankSentence(J, S, { name: true }));
    expect(textOf(withName).startsWith("J is 3rd")).toBe(true);
    const without = P.segments.rankSentence(J, S);
    expect(namesIn(without)).toEqual([]);
    expect(textOf(without)).toBe(P.rankSentence(J, S));
  });

  it("is marked in every branch: a place, a range, a range that meets, a school with no result, an incomplete record", () => {
    const rows: [string, PlacedSchool][] = [
      ["place", school({ id: "a", name: tok(2), place: 5 })],
      ["range", gamma],
      ["meets", school({ id: "m", name: tok(3), cohort: "interval", bounds: [7, 7] })],
      ["no bounds", { ...school({ id: "n", name: tok(4), cohort: "interval" }), results: {} }],
      ["no place", { ...school({ id: "p", name: tok(5) }), results: {} }],
      ["incomplete", school({ id: "q", name: tok(6), cohort: "queue" })],
    ];
    for (const [label, s] of rows) {
      const segments = P.segments.rankSentence(s, S, { name: true, shortlist: 20 });
      expect(namesIn(segments), label).toEqual([s.name]);
      expect(textOf(segments), label).toBe(P.rankSentence(s, S, { name: true, shortlist: 20 }));
      expect(occurrences(textOf(segments), s.name as string), label).toBe(1);
    }
  });
});

describe("a school's name in a sentence about two rules", () => {
  const cohorts = ["complete", "interval", "queue"] as const;
  const standings = [
    undefined,
    { rank_complete120: 4 },
    { rank_best: 4, rank_worst: 4 },
    { rank_best: 4, rank_worst: 9 },
  ];
  const differ = {
    counts: { complete: 16, range: 5, ranked: 21 },
    countsByRule: { [S]: { complete: 16, ranked: 21 }, [B]: { complete: 21, ranked: 21 } },
  };

  it("is marked once, whichever way the school stands under each rule and whether or not the groups differ", () => {
    let n = 0;
    for (const cohort of cohorts)
      for (const a of standings)
        for (const b of standings)
          for (const P of [copy.copyFor({ counts: differ.counts }), copy.copyFor(differ)]) {
            n += 1;
            const name = tok(100 + n);
            const s = {
              ...school({ id: `x${n}`, name, cohort }),
              results: { ...(a ? { [S]: a } : {}), ...(b ? { [B]: b } : {}) },
            };
            const segments = P.segments.rangeComparisonSentence(s, S, B);
            expect(namesIn(segments), `${cohort} ${JSON.stringify(a)} ${JSON.stringify(b)}`).toEqual([name]);
            expect(textOf(segments)).toBe(P.rangeComparisonSentence(s, S, B));
            expect(occurrences(textOf(segments), name)).toBe(1);
          }
    expect(n).toBeGreaterThan(90);
  });

  it("does not mark the name of a rule", () => {
    const s = {
      ...school({ id: "r", name: "J" }),
      results: { [S]: { rank_complete120: 2 }, [S0]: { rank_complete120: 3 } },
    };
    const segments = copy.copyFor({ counts: { complete: 9 } }).segments.rangeComparisonSentence(s, S, S0);
    expect(namesIn(segments)).toEqual(["J"]);
    expect(textOf(segments)).toContain("(S0)");
  });
});

describe("the names in a list of schools", () => {
  const list = [
    school({ id: "l1", name: tok(10), place: 1 }),
    school({ id: "l2", name: "J", place: 2 }),
    school({ id: "l3", name: tok(11), place: 3 }),
    school({ id: "l4", name: tok(12), place: 4 }),
    school({ id: "r1", name: tok(13), cohort: "interval", bounds: [2, 5] }),
    school({ id: "r2", name: tok(14), cohort: "interval", bounds: [3, 8] }),
  ];
  const P = copy.copyFor({ schools: list });

  it("names the first schools, then the range schools that could join them, in the order said", () => {
    const segments = P.segments.listStartsSentence(list, S, 3);
    expect(namesIn(segments)).toEqual([tok(10), "J", tok(11), tok(13), tok(14)]);
    expect(textOf(segments)).toBe(P.listStartsSentence(list, S, 3));
    expect(textOf(segments)).toContain(`${tok(10)}, J and ${tok(11)}.`);
  });

  it("names one school alone", () => {
    const segments = P.segments.listStartsSentence(list.slice(0, 1), S, 1);
    expect(namesIn(segments)).toEqual([tok(10)]);
  });

  it("names no school when none has a place", () => {
    const none = [school({ id: "z", name: tok(15), cohort: "queue" })];
    expect(namesIn(P.segments.listStartsSentence(none, S))).toEqual([]);
  });
});

describe("the names in a tie note", () => {
  const a = school({ id: "t1", name: tok(20), score: 0.5 });
  const b = school({ id: "t2", name: "J", score: 0.5 });
  const c = school({ id: "t3", name: tok(21), score: 0.5 });
  const lone = school({ id: "t4", name: tok(22), score: 0.4 });
  const all = [a, b, c, lone];
  const P = copy.copyFor({ schools: all });

  it("marks the schools it is level with, not the school itself", () => {
    for (const form of ["card", "row"] as const) {
      const segments = P.segments.tieNote(a, S, all, form) as copy.Segments;
      expect(namesIn(segments), form).toEqual(["J", tok(21)]);
      expect(textOf(segments), form).toBe(P.tieNote(a, S, all, form));
      expect(occurrences(textOf(segments), tok(20)), form).toBe(0);
    }
  });

  it("marks a school's name with the district that tells twins apart as one name", () => {
    const x = school({ id: "x1", name: "Lumi ", score: 0.7, district: "North" });
    const y = school({ id: "x2", name: "Lumi", score: 0.7, district: "South" });
    const z = school({ id: "x3", name: "Kay", score: 0.7 });
    const segments = copy.tieNoteSegments(z, S, [x, y, z]) as copy.Segments;
    expect(namesIn(segments)).toEqual(["Lumi (North)", "Lumi (South)"]);
    expect(textOf(segments)).toContain("Lumi (North) and Lumi (South)");
  });

  it("is null, as the string is, where there is no tie", () => {
    expect(P.segments.tieNote(lone, S, all)).toBeNull();
    expect(P.tieNote(lone, S, all)).toBeNull();
  });
});

describe("the names in the comparison of two rules", () => {
  const row: PairwiseRow = {
    left_rule: S,
    right_rule: S0,
    n: 40,
    top10_overlap: 8,
    top20_overlap: 18,
    top30_overlap: 28,
    top40_overlap: 40,
    median_absolute_rank_shift: 3,
    maximum_absolute_rank_shift: 12,
  };
  const move = (name: string, status: string, l: number, r: number): Top20Change => ({
    left_rule: S,
    right_rule: S0,
    status,
    left_rank: l,
    right_rank: r,
    "School Name": name,
  });

  it("marks each school that joins or leaves, one sentence each when there are few", () => {
    const top20Changes = [move("J", "entrant", 24, 18), move(tok(30), "exit", 17, 22)];
    const P = copy.copyFor({ pairwise: [row], top20Changes });
    const segments = P.segments.comparisonSentence(S, S0);
    expect(namesIn(segments)).toEqual(["J", tok(30)]);
    expect(textOf(segments)).toBe(P.comparisonSentence(S, S0));
    expect(textOf(segments)).toContain("J moves from 24th to 18th and joins the top 20.");
  });

  it("marks them in two lists when there are many", () => {
    const top20Changes = [
      move(tok(31), "entrant", 21, 19),
      move(tok(32), "entrant", 22, 18),
      move("J", "entrant", 23, 17),
      move(tok(33), "exit", 17, 21),
      move(tok(34), "exit", 18, 22),
    ];
    const P = copy.copyFor({ pairwise: [row], top20Changes });
    const segments = P.segments.comparisonSentence(S, S0);
    // Those that join come first, nearest place first; then those that leave.
    expect(namesIn(segments)).toEqual(["J", tok(32), tok(31), tok(33), tok(34)]);
    expect(textOf(segments)).toBe(P.comparisonSentence(S, S0));
  });

  it("marks the schools that join and leave the top 10", () => {
    // Twelve schools in the same order under both rules, except that the 10th and 11th swap.
    const swap = (n: number) => (n === 10 ? 11 : n === 11 ? 10 : n);
    const schools = Array.from({ length: 12 }, (_, k) => {
      const n = k + 1;
      const name = n === 10 ? tok(41) : n === 11 ? tok(42) : n === 1 ? "J" : tok(100 + n);
      return {
        ...school({ id: `c${n}`, name }),
        results: { [S]: { rank_complete120: n }, [S0]: { rank_complete120: swap(n) } },
      };
    });
    const P = copy.copyFor({ schools, pairwise: [{ ...row, n: 12 }], top20Changes: [] });
    const segments = P.segments.comparisonSentence(S, S0, undefined, { top: 10 });
    expect(namesIn(segments)).toEqual([tok(42), tok(41)]);
    expect(textOf(segments)).toBe(P.comparisonSentence(S, S0, undefined, { top: 10 }));
    expect(textOf(segments)).toContain(`${tok(42)} moves from 11th to 10th and joins the top 10.`);
  });

  it("names no school when none moves in or out", () => {
    const P = copy.copyFor({ pairwise: [{ ...row, top20_overlap: 20 }], top20Changes: [] });
    expect(namesIn(P.segments.comparisonSentence(S, S0))).toEqual([]);
  });
});

describe("the name in the worked example of How this works", () => {
  it("marks the school the example follows, and leaves its possessive as text", () => {
    const range = (id: string, name: string, a: [number, number], b: [number, number]) => ({
      ...school({ id, name, cohort: "interval" }),
      results: {
        [S]: { rank_best: a[0], rank_worst: a[1] },
        [S0]: { rank_best: b[0], rank_worst: b[1] },
      },
    });
    const schools = [range("w1", tok(50), [5, 9], [5, 9]), range("w2", "J", [6, 10], [12, 19])];
    const row: PairwiseRow = {
      left_rule: S,
      right_rule: S0,
      n: 30,
      top10_overlap: 10,
      top20_overlap: 20,
      top30_overlap: 30,
      top40_overlap: 30,
      median_absolute_rank_shift: 1,
      maximum_absolute_rank_shift: 4,
    };
    const P = copy.copyFor({ schools, pairwise: [row], top20Changes: [] });
    expect(P.segments.howExample).not.toBeNull();
    expect(namesIn(P.segments.howExample as copy.Segments)).toEqual(["J"]);
    expect(textOf(P.segments.howExample as copy.Segments)).toContain("but J's possible places");
    const limits = P.HOW_IT_WORKS.find((x) => x.key === "limits");
    expect(limits?.sentences).toContain(textOf(P.segments.howExample as copy.Segments));
  });

  it("is null where the data holds no range school that moves", () => {
    expect(copy.copyFor().segments.howExample).toBeNull();
  });
});

describe("the names in the guide's lines", () => {
  const G = GUIDE.tasks;
  const step = (task: number, i: number) =>
    G[task].steps[i] as unknown as Record<string, (...a: unknown[]) => string>;

  it("mark each school in the lines that name one, and read as the string lines do", () => {
    expect(textOf(GUIDE_SEGMENTS.whyTitle("J", "3rd"))).toBe(step(1, 0).title("J", "3rd"));
    expect(namesIn(GUIDE_SEGMENTS.whyTitle("J", "3rd"))).toEqual(["J"]);
    expect(namesIn(GUIDE_SEGMENTS.whyTitle("J", null))).toEqual(["J"]);
    expect(textOf(GUIDE_SEGMENTS.whyTitle("J", null))).toBe("J has no place in the list yet");

    for (const place of ["anywhere from 5th to 6th", null])
      expect(textOf(GUIDE_SEGMENTS.rangeTitle("J", place))).toBe(step(2, 0).title("J", place));
    expect(namesIn(GUIDE_SEGMENTS.rangeTitle("J", "5th"))).toEqual(["J"]);

    expect(textOf(GUIDE_SEGMENTS.rangeTryIt(["A", "B", "J"], 3))).toBe(step(2, 0).tryIt("A, B and J", 3));
    expect(namesIn(GUIDE_SEGMENTS.rangeTryIt(["A", "B", "J"], 3))).toEqual(["A", "B", "J"]);
    expect(textOf(GUIDE_SEGMENTS.rangeTryIt(["A"], 0))).toBe(step(2, 0).tryIt("A", 0));

    const order = GUIDE_SEGMENTS.orderBody("J", "A", "16th", "B", "17th");
    expect(textOf(order)).toBe(step(2, 1).body("J", "A", "16th", "B", "17th"));
    expect(namesIn(order)).toEqual(["J", "A", "B"]);

    expect(textOf(GUIDE_SEGMENTS.mapBody("J"))).toBe(step(2, 2).body("J"));
    expect(namesIn(GUIDE_SEGMENTS.mapBody("J"))).toEqual(["J"]);
    expect(textOf(GUIDE_SEGMENTS.schoolTitle("J"))).toBe(step(3, 2).title("J"));
    expect(namesIn(GUIDE_SEGMENTS.schoolTitle("J"))).toEqual(["J"]);
    expect(textOf(GUIDE_SEGMENTS.rangesBody("J"))).toBe(step(4, 2).body("J"));
    expect(namesIn(GUIDE_SEGMENTS.rangesBody("J"))).toEqual(["J"]);
  });
});

describe("the names a person gives a saved view", () => {
  it("are marked as saved-view names, in the remove button and as a heading", () => {
    const remove = copy.removeViewSegments("J");
    expect(textOf(remove)).toBe(LAYOUT.removeView("J"));
    expect(textOf(remove)).toBe("Remove the saved view J");
    expect(namesIn(remove, "saved-view")).toEqual(["J"]);
    expect(namesIn(remove, "school")).toEqual([]);
    const heading = copy.savedViewSegments("Top of the list");
    expect(heading).toEqual([{ name: "Top of the list", kind: "saved-view" }]);
    expect(textOf(heading)).toBe("Top of the list");
  });
});

describe("every name in a battery of sentences", () => {
  it("is marked wherever it appears, in every function, for every school and rule", () => {
    const schools = [
      school({ id: "b1", name: tok(60), place: 1 }),
      school({ id: "b2", name: "J", place: 2 }),
      school({ id: "b3", name: tok(61), place: 3, score: 0.5 }),
      school({ id: "b4", name: tok(62), place: 4, score: 0.5 }),
      school({ id: "b5", name: tok(63), cohort: "interval", bounds: [3, 8] }),
      school({ id: "b6", name: tok(64), cohort: "queue", gate: ["teacher_housing_deficit"] }),
    ];
    const P = copy.copyFor({ schools });
    let checked = 0;
    for (const s of schools)
      for (const r of copy.RULE_IDS) {
        const calls: [string, copy.Segments | null, string | null][] = [
          ["rank", P.segments.rankSentence(s, r, { name: true }), P.rankSentence(s, r, { name: true })],
          ["tie", P.segments.tieNote(s, r), P.tieNote(s, r)],
          ["list", P.segments.listStartsSentence(schools, r), P.listStartsSentence(schools, r)],
          ["compare", P.segments.rangeComparisonSentence(s, r, B), P.rangeComparisonSentence(s, r, B)],
        ];
        for (const [label, segments, plain] of calls) {
          if (segments === null) {
            expect(plain, label).toBeNull();
            continue;
          }
          const text = textOf(segments);
          expect(text, label).toBe(plain);
          for (const who of schools) {
            const marked = namesIn(segments).filter((n) => n === who.name).length;
            // "J" may appear inside other words, so only a token that cannot is counted in the text.
            if ((who.name as string).startsWith("Qz"))
              expect(occurrences(text, who.name as string), `${label} ${who.name}`).toBe(marked);
          }
          checked += 1;
        }
      }
    expect(checked).toBeGreaterThan(150);
  });
});
