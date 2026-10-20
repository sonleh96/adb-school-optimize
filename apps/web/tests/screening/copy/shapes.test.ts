/**
 * Whole data sets of a shape the study's data does not have: other sizes, blanks, ties, twins, nothing at all.
 *
 * Failure modes, each with the test that catches it:
 *  1. A sentence states the count of another data set. Two invented sets with no number in common are each run
 *     through every function, and the copy bound to one is searched for the other's numbers.
 *  2. Empty data or one school breaks a sentence ("NaN schools", a throw, "the 0 schools").
 *  3. A blank name, district or province leaves "null" or an empty clause anywhere in the text.
 *  4. All three readings missing, or a record that gives only its remoteness, reads as a value or as a gap
 *     of the wrong kind.
 *  5. An exact tie gets no note, or a school that is level with no one gets one.
 *  6. Two schools read the same after the copy cleans their names.
 *  7. The counts taken from the data miscount a group, a zero or a blank.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { copyFor, countsFrom } from "@/lib/screening/copy";
import type { CopySchool } from "@/lib/screening/copy";

import { Corpus, RULES, addFixedCopy, school, withLater } from "./helpers";

/** Ten schools: five with every input, two that show a range, three with incomplete records. */
function tenSchools(): CopySchool[] {
  const empty = Object.fromEntries(
    Object.keys(school({ id: "x" }).condition).map((k) => [k, null])
  ) as unknown as CopySchool["condition"];
  return [
    school({ id: "c1", name: "Alpha", district: null, place: 1, score: 0.9, need: 0.9, secondary: 0.4 }),
    school({ id: "c2", name: "Beta", place: 2, score: 0.8, need: 0.8, secondary: 0.3 }),
    school({ id: "c3", name: "Gamma", province: null, place: 3, score: 0.8, need: 0.8, secondary: 0.1 }),
    school({ id: "c4", name: "Lumi ", district: "North", place: 4, score: 0.5, need: 0.5 }),
    school({ id: "c5", name: "Lumi", district: "South", place: 5, score: 0.4, need: 0.4 }),
    school({ id: "i1", name: "Reach One", cohort: "interval", bounds: [3, 6], blank: ["aqi"] }),
    school({
      id: "i2",
      name: null,
      cohort: "interval",
      bounds: [6, 9],
      blank: ["aqi", "emissions", "land"],
      district: "",
      province: "",
    }),
    school({
      id: "q1",
      name: "Zero",
      cohort: "queue",
      gate: ["permanent_classroom_deficit"],
      condition: { classrooms_total: 0, classrooms_permanent: 0 },
    }),
    school({ id: "q2", name: "   ", cohort: "queue", gate: ["service_deficit"], power: null, water: null }),
    {
      ...school({
        id: "q3",
        name: "Only Remote",
        cohort: "queue",
        locality: "Remote",
        gate: [
          "permanent_classroom_deficit",
          "teacher_housing_deficit",
          "facility_presence_deficit",
          "service_deficit",
        ],
      }),
      condition: empty,
    },
  ];
}

/** A data set of the given sizes, of no particular schools. */
/** A name made of letters only, so no number of a school's name can read as a count. */
const letters = (i: number) =>
  i
    .toString(26)
    .split("")
    .map((c) => "abcdefghijklmnopqrstuvwxyz"[parseInt(c, 26)])
    .join("") + "z";

function sized(complete: number, interval: number, queue: number, tag: string): CopySchool[] {
  return [
    ...Array.from({ length: complete }, (_, i) =>
      school({
        id: `${tag}c${i}`,
        name: `${tag} complete ${letters(i)}`,
        place: i + 1,
        score: 0.9 - i / 1000,
      })
    ),
    ...Array.from({ length: interval }, (_, i) =>
      school({
        id: `${tag}i${i}`,
        name: `${tag} range ${letters(i)}`,
        cohort: "interval",
        bounds: [3 + i, 9 + i],
        blank: ["aqi"],
      })
    ),
    ...Array.from({ length: queue }, (_, i) =>
      school({
        id: `${tag}q${i}`,
        name: `${tag} held ${letters(i)}`,
        cohort: "queue",
        gate: ["service_deficit"],
        power: null,
      })
    ),
  ];
}

/** Every sentence the copy writes about a data set, so a guard can read them all. */
async function everything(schools: CopySchool[], corpus: Corpus, tag: string): Promise<void> {
  const P = copyFor({ schools });
  addFixedCopy(corpus, await withLater(P), tag);
  const names = schools.map((s) => s.name ?? "");
  const opts = { schoolNames: names };
  for (const s of schools) {
    const at = `${tag} ${s.id}`;
    corpus.add(`${at} distinctName`, P.distinctName(s), { ...opts, sentence: false });
    corpus.add(`${at} locationLine`, P.locationLine(s), { ...opts, sentence: false });
    corpus.add(`${at} missingSentence`, P.missingSentence(s), opts);
    P.missingLabels(s).forEach((l, i) => corpus.add(`${at} chip ${i}`, l, { ...opts, sentence: false }));
    for (const key of ["need", ...copy.INPUT_KEYS] as const)
      corpus.add(`${at} note ${key}`, P.missingValueNote(s, key), opts);
    if (s.cohort !== "queue")
      for (const key of copy.INPUT_KEYS) corpus.add(`${at} input ${key}`, P.inputSentence(s, key), opts);
    for (const r of RULES) {
      for (const o of [{}, { name: true, shortlist: 20 }])
        corpus.add(`${at} ${r} rank`, P.rankSentence(s, r, o), opts);
      corpus.add(`${at} ${r} headline`, P.placeHeadline(s, r), { ...opts, sentence: false });
      corpus.add(`${at} ${r} context`, P.placeContext(s, r), opts);
      corpus.add(`${at} ${r} context(method)`, P.placeContext(s, r, { method: true }), opts);
      corpus.add(`${at} ${r} full`, P.fullRankingSentence(s, r), opts);
      corpus.add(`${at} ${r} reason`, P.reasonSentence(s, r), opts);
      for (const form of ["card", "row"] as const) {
        const note = P.tieNote(s, r, undefined, form);
        if (note) corpus.add(`${at} ${r} tie ${form}`, note, { ...opts, sentence: form === "card" });
      }
    }
    for (const a of RULES)
      for (const b of RULES)
        if (a !== b) corpus.add(`${at} ${a}>${b}`, P.rangeComparisonSentence(s, a, b), opts);
  }
  for (const r of RULES) corpus.add(`${tag} ${r} list starts`, P.listStartsSentence(schools, r), opts);
}

describe("data of other sizes", () => {
  it("passes the writing guards for every sentence", async () => {
    const corpus = new Corpus();
    await everything(tenSchools(), corpus, "ten");
    expect(corpus.problems).toEqual([]);
    expect(corpus.checked).toBeGreaterThan(1000);
  });

  it("states none of another data set's counts", async () => {
    const A = sized(27, 6, 14, "Alder");
    const B = sized(68, 13, 22, "Bramble");
    const numbers = (schools: CopySchool[]) => {
      const c = countsFrom(schools);
      return [c.all, c.complete, c.range, c.ranked, c.queue].filter((n) => n >= 10);
    };
    const mentions = (schools: CopySchool[]) =>
      new RegExp(`(?<![\\w.,])(${numbers(schools).join("|")})(?![\\w%,])`);
    for (const [own, other] of [
      [A, B],
      [B, A],
    ]) {
      const corpus = new Corpus();
      await everything(own, corpus, "set");
      expect(corpus.problems).toEqual([]);
      expect(
        corpus.texts.filter(([, t]) => mentions(other).test(t)).map(([label, t]) => `${label}: ${t}`)
      ).toEqual([]);
      // Its own counts do appear, so the search above is not passing on silence.
      expect(corpus.texts.filter(([, t]) => mentions(own).test(t)).length).toBeGreaterThan(50);
    }
    expect(numbers(A)).toEqual([47, 27, 33, 14]);
    expect(numbers(B)).toEqual([103, 68, 13, 81, 22]);
  });

  it("states its own counts", () => {
    const P = copyFor({ schools: tenSchools() });
    expect(P.counts).toEqual({
      all: 10,
      complete: 5,
      range: 2,
      ranked: 7,
      queue: 3,
      urgencyZero: 0,
      emissionsNone: 0,
      airMissing: 2,
      remotenessOnly: 1,
      flagged: 0,
    });
    expect(P.STRINGS.groups).toBe(
      "5 schools have every input recorded, and two more lack a reading such as air quality and show a range of places, so 7 schools can be put in order."
    );
    expect(P.STRINGS.scopeShort).toBe(
      "7 schools can be put in order, 5 with every input recorded and 2 that show a range of places."
    );
    expect(P.TERMS.queue.label).toBe("Schools with incomplete records (3)");
    expect(P.TERMS.cohort_ranked.label).toBe("Can be put in order (7)");
    expect(P.TERMS.missing_all_but_remoteness.help).toBe(
      "1 of the 3 incomplete records are like this. Classroom, teacher, housing, facility, power and water details are all blank."
    );
    expect(P.STRINGS.urgencyDefinition).toMatch(/, and no school has 0\.$/);
    expect(P.LAYOUT.amongAll124).toBe("All 7 schools that can be put in order");
    expect(P.IDEAS.ranges.title).toBe("Two schools show a range because a reading is missing");
    expect(P.IDEAS.queue.title).toBe(
      "Some schools have no place in the list yet because their records are incomplete"
    );
  });

  it("counts a zero urgency, a zero emissions reading and a missing reading once each", () => {
    const base = tenSchools();
    const withU0 = base.map((s, i) => (i < 3 ? { ...s, components: { ...s.components, U: 0 } } : s));
    expect(countsFrom(withU0).urgencyZero).toBe(3);
    expect(copyFor({ schools: withU0 }).STRINGS.urgencyDefinition).toMatch(
      /, and 3 of the 10 schools have 0\.$/
    );
    expect(countsFrom(base.map((s) => ({ ...s, components: { ...s.components, U: 0 } }))).urgencyZero).toBe(
      10
    );
    expect(
      copyFor({ schools: base.map((s) => ({ ...s, components: { ...s.components, U: 0 } })) }).STRINGS
        .urgencyDefinition
    ).toMatch(/, and every school has 0\.$/);
    expect(
      copyFor({ schools: base.map((s) => ({ ...s, components: { ...s.components, U: 0 } })).slice(0, 6) })
        .STRINGS.urgencyDefinition
    ).toMatch(/, and every school has 0\.$/);
    const zeros = base.map((s, i) => (i < 6 ? { ...s, components: { ...s.components, U: 0 } } : s));
    expect(copyFor({ schools: zeros }).STRINGS.urgencyDefinition).toMatch(/, and most schools have 0\.$/);
    // E_raw 0 counts only for a school that can be put in order; a queue school's reading is not counted.
    const noEmissions = base.map((s) => ({
      ...s,
      raw: { ...s.raw, E_raw: s.raw.E_raw === null ? null : 0 },
    }));
    expect(countsFrom(noEmissions).emissionsNone).toBe(5 + 1);
    expect(countsFrom(noEmissions).airMissing).toBe(2);
    expect(
      countsFrom(base.map((s) => ({ ...s, persistent_candidate_circulated: s.id === "c1" || s.id === "c2" })))
        .flagged
    ).toBe(2);
  });

  it("reads one range school and one incomplete record in the singular", async () => {
    const schools = [
      school({ id: "a", place: 1 }),
      school({ id: "b", place: 2 }),
      school({ id: "r", cohort: "interval", bounds: [3, 3], blank: ["aqi"] }),
      school({ id: "q", cohort: "queue", gate: ["service_deficit"] }),
    ];
    const P = copyFor({ schools });
    expect(P.STRINGS.groups).toBe(
      "2 schools have every input recorded, and one more lacks a reading such as air quality and shows a range of places, so 3 schools can be put in order."
    );
    expect(P.STRINGS.listOrder.startsWith("The one school that shows a range is listed where ")).toBe(true);
    expect((await P.later()).HOW_IT_WORKS.find((s) => s.key === "placed")?.sentences).toContain(
      "The other one has an incomplete record and no place in the list yet, and it shows what is missing."
    );
  });
});

describe("a school that is level with another, or cannot be told from it", () => {
  const schools = tenSchools();
  const P = copyFor({ schools });

  it("gets a tie note exactly when another complete school has the same value", () => {
    for (const rule of RULES) {
      const nf = rule.startsWith("need_first");
      const value = (s: CopySchool) => (nf ? s.results?.[rule]?.school_need : s.results?.[rule]?.score_point);
      for (const s of schools.filter((x) => x.cohort === "complete")) {
        const level = schools.some(
          (y) =>
            y.id !== s.id &&
            y.cohort === "complete" &&
            Math.abs((value(y) as number) - (value(s) as number)) < 1e-12
        );
        expect(P.tieNote(s, rule) !== null, `${s.id} ${rule}`).toBe(level);
      }
    }
  });

  it("names the schools it is level with", () => {
    const [, beta, gamma] = schools;
    expect(P.tieNote(beta, "additive_u", undefined, "row")).toBe("Level with Gamma");
    expect(P.tieNote(gamma, "additive_u")).toBe(
      "It has exactly the same screening score as Beta, so the order goes by school name."
    );
    expect(P.tieNote(beta, "need_first_u")).toBe(
      "It has exactly the same school need as Gamma, so the other inputs decide which comes first."
    );
  });

  it("reads no two schools of the data set the same way", () => {
    const names = schools.map((s) => P.distinctName(s));
    expect(new Set(names).size).toBe(names.length);
    expect(P.distinctName(schools[3])).toBe("Lumi (North)");
    expect(P.distinctName(schools[4])).toBe("Lumi (South)");
    // Two unnamed schools: the one with a district gets it, the one with a blank district gets its record.
    expect(P.distinctName(schools[8])).toBe("Unnamed school (Middle)");
    expect(P.distinctName(schools[6])).toBe("Unnamed school (record i2)");
  });
});

describe("a record with all three readings missing, or only its remoteness", () => {
  const schools = tenSchools();
  const P = copyFor({ schools });
  const i2 = schools[6];

  it("names each missing reading and counts none as 0", () => {
    expect(P.rankSentence(i2, "additive_u")).toBe(
      "Anywhere from 6th to 9th of the 7 schools that can be put in order. Its air-quality reading, nearby emissions figure and land-cover figure are not recorded, so the screen shows the highest and lowest places in the list it could take."
    );
    expect(P.inputSentence(i2, "emissions")).toBe(
      "Its nearby emissions figure is not recorded, so it is not counted as 0."
    );
    expect(P.missingValueNote(i2, "land")).toBe(
      "No land-cover figure is recorded for this school, so it is not counted as 0. The school shows a range of places instead of one place."
    );
  });

  it("reads a blank name, district and province in words", () => {
    expect(P.rankSentence(i2, "additive_u", { name: true })).toMatch(
      /^Unnamed school could be anywhere from 6th to 9th/
    );
    expect(P.locationLine(i2)).toBe("Location not recorded");
    expect(P.locationLine(schools[0])).toBe("District not recorded, Highlands");
    expect(P.locationLine(schools[2])).toBe("Middle, province not recorded");
  });

  it("reads the remoteness-only record by its single chip, and a zero classroom count as unusable", () => {
    expect(P.missingLabels(schools[9])).toEqual(["Only remoteness recorded"]);
    expect(P.missingLabels(schools[7])).toEqual(["Record gives 0 classrooms, needs checking"]);
    expect(P.missingLabels(schools[8])).toEqual(["Power and water source blank"]);
    expect(P.missingValueKind(schools[7], "classrooms")).toBe("unusable");
    expect(P.missingValueKind(schools[8], "services")).toBe("blank");
  });
});

describe("no schools, and one school", () => {
  it("writes every fixed sentence for no schools without a stale or broken count", async () => {
    const corpus = new Corpus();
    const P = copyFor({});
    addFixedCopy(corpus, await withLater(P), "empty");
    corpus.add("empty list starts", P.listStartsSentence([], "additive_u"));
    corpus.add("empty statement", P.defaultListStatement());
    corpus.add("empty reassurance", P.urgencyReassurance());
    expect(corpus.problems).toEqual([]);
    expect(corpus.texts.filter(([, t]) => /NaN|undefined/.test(t))).toEqual([]);
    expect(P.counts).toEqual({
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
    });
    expect(P.STRINGS.urgencyDefinition).toMatch(/not known\.$/);
    expect(P.LAYOUT.amongAll124).toBe("All schools that can be put in order");
    expect(copyFor().counts.all).toBe(0);
  });

  it("writes every sentence for one school", async () => {
    const corpus = new Corpus();
    const one = [school({ id: "only", name: "Only", place: 1, bounds: [1, 1] })];
    await everything(one, corpus, "one");
    expect(corpus.problems).toEqual([]);
    const P = copyFor({ schools: one });
    expect(P.STRINGS.groups).toBe("1 school has every input recorded, so 1 school can be put in order.");
    expect(P.rankSentence(one[0], "additive_u")).toBe("1st of the one school with every input recorded.");
    expect(P.listStartsSentence(one, "additive_u")).toBe(
      "Under the combined-factors rule with urgency (S), the first of the one school with every input recorded is Only."
    );
    expect(P.tieNote(one[0], "additive_u")).toBeNull();
    expect(P.STRINGS.urgencyDefinition).toMatch(/, and no school has 0\.$/);
    expect(
      copyFor({ schools: one.map((s) => ({ ...s, components: { ...s.components, U: 0 } })) }).STRINGS
        .urgencyDefinition
    ).toMatch(/, and every school has 0\.$/);
  });
});
