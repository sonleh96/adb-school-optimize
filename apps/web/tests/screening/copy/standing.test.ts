/**
 * How a school's record for one part of school need compares with the other schools in the list (`partStanding`).
 *
 * Failure modes, each with the test that catches it:
 *  1. The line leaves its direction to be guessed, or a large tie unsaid.           -> "names the other schools ..."
 *  2. Equal figures are counted as more or less, so a tie inflates the claim.        -> "counts a tie as neither ..."
 *  3. A missing figure is compared: the school's own, or another school's counted as 0, as level or as not there.
 *                                                                                    -> "says nothing ...", "counts a school whose figure is blank ..."
 *  4. The count takes in the school itself or the schools not in the list yet.      -> "counts only the other schools ..."
 *  5. A rule's line counts another rule's list.                                      -> "under every rule ..." (two tests)
 *  6. A part's line points the wrong way.                                            -> "words each part ..."
 *  7. Two records the method scores alike are counted apart by a float.              -> "scores power and water ..."
 *  8. A share is rounded up into a stronger claim, or a tiny group reads as 0 in 10. -> "rounds a share down ..."
 *  9. A small list is said in tenths, or a list of one, two or three reads wrongly.  -> "gives counts ..."
 * 10. A list whose figures are all equal reads as more or less.                      -> "says a list of equal ..."
 * 11. A line implies the school's condition or need, does not say "record", or keeps the scale's name.
 *                                                                                    -> "never words ..."
 * The expected lines are written out by hand from the figures each test sets.
 */
import { describe, expect, it } from "vitest";

import { BANNED } from "@/lib/screening/copy/later";
import {
  type CopyRuleId,
  type CopySchool,
  type NeedKey,
  partStanding,
  schoolsFromLists,
} from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";
import { inputsResponse, resultsResponse } from "@/lib/screening/types";

import { readFixture } from "../fixtures";
import { RULES, school, textProblems } from "./helpers";

const MAIN: CopyRuleId = "additive_no_u";
const FACILITIES = [
  "libraries",
  "workshops",
  "practical_skills",
  "home_economics",
  "computer_labs",
  "specialized_classrooms",
] as const;
/** A share as the line says it: no-break spaces keep "8 in 10" on one line. */
const tenths = (n: number) => `${n}\u00a0in\u00a010`;

/** The figures a test sets; the builder sets every other field. */
interface Figures {
  /** How many of the six facility types the school has, or null for a blank count. */
  types?: number | null;
  /** Permanent classrooms and all classrooms. */
  classrooms?: [number, number];
  /** Teacher houses and teachers. */
  houses?: [number, number];
  /** Power and water, and remoteness, as the engine scores them. */
  services?: number;
  remoteness?: number;
}

/** A school with the figures given, in the list under `rules` (every rule unless told), and not in it under the rest. */
function rec(id: string, figures: Figures = {}, rules: readonly CopyRuleId[] = RULES): CopySchool {
  const base = school({ id });
  const { types, classrooms, houses, services, remoteness } = figures;
  return {
    ...base,
    cohort: rules.includes(MAIN) ? "complete" : "queue",
    condition: {
      ...base.condition,
      ...(types === undefined
        ? {}
        : Object.fromEntries(
            FACILITIES.map((f, i) => [f, types === null && i === 0 ? null : i < (types ?? 0) ? 1 : 0])
          )),
      ...(classrooms ? { classrooms_permanent: classrooms[0], classrooms_total: classrooms[1] } : {}),
      ...(houses ? { teacher_houses: houses[0], teachers: houses[1] } : {}),
    },
    need_parts: {
      ...base.need_parts!,
      ...(services === undefined ? {} : { service_deficit: services }),
      ...(remoteness === undefined ? {} : { locality_disadvantage: remoteness }),
    },
    results: Object.fromEntries(rules.map((r) => [r, base.results![r]])),
  };
}

/** `n` schools with the same figures. */
const many = (prefix: string, n: number, figures: Figures) =>
  Array.from({ length: n }, (_, i) => rec(`${prefix}${i}`, figures));

const line = (subject: CopySchool, others: readonly CopySchool[], key: NeedKey = "facilities", rule = MAIN) =>
  partStanding(subject, rule, key, [subject, ...others]);

describe("comparing a part of school need with the list", () => {
  it("names the other schools and which way they differ, and the schools level with this one from 2 in 10", () => {
    // 29 others: 23 with more facility types and 6 with none, like the subject. 6 of the 30 is 2 in 10, so it is said.
    expect(
      line(rec("s", { types: 0 }), [...many("m", 23, { types: 1 }), ...many("n", 6, { types: 0 })])
    ).toBe(`${tenths(7)} schools in the list record more facility types; ${tenths(2)} record the same.`);
    // 5 of the 30 level with it is under 2 in 10, so it is not.
    expect(
      line(rec("s", { types: 0 }), [...many("m", 24, { types: 1 }), ...many("n", 5, { types: 0 })])
    ).toBe(`${tenths(8)} schools in the list record more facility types.`);
  });

  it("counts a tie as neither more nor less", () => {
    // Four others have none of the six types, like the subject, and three have one. Counted as more, the four would
    // make "every other school".
    expect(
      line(rec("s", { types: 0 }), [...many("none", 4, { types: 0 }), ...many("one", 3, { types: 1 })])
    ).toBe("3 of the 7 other schools in the list record more facility types; 4 record the same.");
  });

  it("names the larger group, and on a tie the schools whose bars are shorter", () => {
    expect(line(rec("s", { types: 2 }), [...many("more", 3, { types: 3 }), rec("fewer", { types: 1 })])).toBe(
      "3 of the 4 other schools in the list record more facility types."
    );
    // One school has more types and one has fewer: those with more have shorter "Missing facility types" bars.
    expect(line(rec("s", { types: 2 }), [rec("a", { types: 3 }), rec("b", { types: 1 })])).toBe(
      "1 of the 2 other schools in the list records more facility types."
    );
    // Remoteness grows the other way: the less remote school has the shorter bar.
    expect(
      line(
        rec("s", { remoteness: 0.45 }),
        [rec("a", { remoteness: 0.2 }), rec("b", { remoteness: 0.7 })],
        "locality"
      )
    ).toBe("1 of the 2 other schools in the list is recorded as less remote.");
  });

  it("says nothing for a figure the school's own record does not give, or for a school not in the list", () => {
    const others = many("o", 3, { types: 2 });
    expect(line(rec("s", { types: null }), others)).toBeNull();
    expect(line(rec("s", { classrooms: [0, 0] }), others, "classrooms")).toBeNull();
    expect(line(rec("s", { houses: [2, 0] }), others, "housing")).toBeNull();
    // Not in the list under the rule shown: no rank, so no list to compare with.
    expect(line(rec("q", { types: 0 }, []), others)).toBeNull();
  });

  it("counts a school whose figure is blank as one of the list, in no group, never as 0 or as level", () => {
    // Counted as 0 types, the blank would make "2 record the same"; left out, "1 of the 2 other schools".
    expect(
      line(rec("s", { types: 0 }), [
        rec("a", { types: 3 }),
        rec("b", { types: null }),
        rec("c", { types: 0 }),
      ])
    ).toBe("1 of the 3 other schools in the list records more facility types; 1 records the same.");
    // A share counts it too: 20 of the 25 schools in the list is 8 in 10, and with 4 blank, not every other school.
    expect(
      line(rec("s", { types: 0 }), [...many("m", 20, { types: 1 }), ...many("b", 4, { types: null })])
    ).toBe(`${tenths(8)} schools in the list record more facility types.`);
    // No other school has the figure: there is nothing to compare with.
    expect(line(rec("s", { types: 0 }), [rec("b", { types: null })])).toBeNull();
  });

  it("counts only the other schools in the list: not the school itself, and not the schools not in the list yet", () => {
    const subject = rec("s", { types: 0 });
    const notYet = rec("q", { types: 6 }, []);
    const one = "The one other school in the list records more facility types.";
    expect(line(subject, [rec("a", { types: 3 }), notYet])).toBe(one);
    // The school's own record, once in the list as well, is still not one of the others.
    expect(partStanding(subject, MAIN, "facilities", [subject, { ...subject }, rec("a", { types: 3 })])).toBe(
      one
    );
  });

  it("under every rule, counts that rule's own list, even when the records hold every rule's results", () => {
    const withoutUrgency: readonly CopyRuleId[] = ["additive_no_u", "need_first_no_u", "bottleneck_no_u"];
    const subject = rec("s", { types: 0 });
    // B and C are in every rule's list; D's urgency rating is unknown, so only the rules without urgency put it in
    // order; E is not in any list.
    const list = [
      subject,
      rec("b", { types: 3 }),
      rec("c", { types: 0 }),
      rec("d", { types: 6 }, withoutUrgency),
      rec("e", { types: 6 }, []),
    ];
    for (const rule of RULES)
      expect(partStanding(subject, rule, "facilities", list), rule).toBe(
        withoutUrgency.includes(rule)
          ? "2 of the 3 other schools in the list record more facility types; 1 records the same."
          : "1 of the 2 other schools in the list records more facility types; 1 records the same."
      );
  });

  it("under every rule, counts that rule's own list in the API's saved responses", () => {
    // The saved "ties and ranges" lists: Queue Urgency's urgency rating is unknown, so the three rules without urgency
    // put 20 schools in order and the four that read it (the benchmark among them) put 19. Ranked 10 has four of the
    // six facility types; Range All has four too, Queue Urgency has four, and every other school in the lists has fewer.
    const lists = RULES.map((r) =>
      parseWith(resultsResponse, readFixture(`results/${r}.json`, "ties-and-ranges"), `results/${r}`)
    );
    const inputs = parseWith(inputsResponse, readFixture("inputs.json", "ties-and-ranges"), "inputs");
    for (const rule of RULES) {
      const shown = lists.find((l) => l.run.rule_id === rule)!;
      const schools = schoolsFromLists(inputs, [shown, ...lists.filter((l) => l !== shown)], rule);
      const subject = schools.find((s) => s.name === "Ranked 10")!;
      expect(partStanding(subject, rule, "facilities", schools), rule).toBe(
        rule.endsWith("_no_u")
          ? "17 of the 19 other schools in the list record fewer facility types."
          : "17 of the 18 other schools in the list record fewer facility types."
      );
    }
  });

  it("words each part the way its record points", () => {
    const one = (key: NeedKey, own: Figures, other: Figures) => line(rec("s", own), [rec("a", other)], key);
    const the = "The one other school in the list";
    expect(one("classrooms", { classrooms: [0, 6] }, { classrooms: [6, 6] })).toBe(
      `${the} records a larger share of permanent classrooms.`
    );
    expect(one("classrooms", { classrooms: [5, 6] }, { classrooms: [1, 4] })).toBe(
      `${the} records a smaller share of permanent classrooms.`
    );
    // More permanent classrooms than classrooms reads as all of them, as the school's own sentence says.
    expect(one("classrooms", { classrooms: [7, 6] }, { classrooms: [6, 6] })).toBe(
      `${the} records the same share of permanent classrooms.`
    );
    expect(one("housing", { houses: [1, 9] }, { houses: [9, 9] })).toBe(
      `${the} records more teacher houses per teacher.`
    );
    expect(one("housing", { houses: [3, 6] }, { houses: [2, 4] })).toBe(
      `${the} records the same number of teacher houses per teacher.`
    );
    expect(one("facilities", { types: 1 }, { types: 4 })).toBe(`${the} records more facility types.`);
    expect(one("facilities", { types: 6 }, { types: 4 })).toBe(`${the} records fewer facility types.`);
    // The method scores a generator and water from a river 0.85, the grid and piped water 0.2.
    expect(one("services", { services: 0.85 }, { services: 0.2 })).toBe(
      `${the} records power and water that add less to school need.`
    );
    expect(one("services", { services: 0.35 }, { services: 0.6 })).toBe(
      `${the} records power and water that add more to school need.`
    );
    expect(one("locality", { remoteness: 1 }, { remoteness: 0.2 })).toBe(
      `${the} is recorded as less remote.`
    );
    expect(one("locality", { remoteness: 0 }, { remoteness: 0.45 })).toBe(
      `${the} is recorded as more remote.`
    );
    expect(one("locality", { remoteness: 0.7 }, { remoteness: 0.7 })).toBe(
      `${the} is recorded in the same remoteness category.`
    );
  });

  it("scores power and water in whole points of the method's scale, so the same score is level", () => {
    // The engine adds the two sources' scores and halves them: a generator with piped water comes to
    // 0.44999999999999996 and solar panels with a tank to 0.45, one score on the scale.
    const generatorPiped = (0.7 + 0.2) / 2;
    const solarTank = (0.4 + 0.5) / 2;
    expect(generatorPiped).not.toBe(solarTank);
    const level =
      "The one other school in the list records power and water that add the same to school need.";
    expect(
      line(rec("s", { services: generatorPiped }), [rec("a", { services: solarTank })], "services")
    ).toBe(level);
    expect(
      line(rec("s", { services: solarTank }), [rec("a", { services: generatorPiped })], "services")
    ).toBe(level);
  });

  it("rounds a share down to whole tenths of the whole list, the school included, never up", () => {
    // `more` others with one facility type, the rest with none like the subject: a list of `total` schools.
    const share = (more: number, total: number) =>
      line(rec("s", { types: 0 }), [
        ...many("m", more, { types: 1 }),
        ...many("n", total - 1 - more, { types: 0 }),
      ]);
    const says = (n: number) => `${tenths(n)} schools in the list record more facility types.`;
    expect(share(849, 1000)).toBe(says(8));
    expect(share(850, 1000)).toBe(says(8));
    expect(share(899, 1000)).toBe(says(8));
    expect(share(900, 1000)).toBe(says(9));
    expect(share(85, 100)).toBe(says(8));
    expect(share(90, 100)).toBe(says(9));
    // 27 of the 30 others is 90%, but 27 of the 31 schools in the list is 87%: 8 in 10, not 9.
    expect(share(27, 31)).toBe(says(8));
    // Every other school is said as such, not as 9 in 10.
    expect(share(30, 31)).toBe("Every other school in the list records more facility types.");
    // A group under 1 in 10 is not said as 0 in 10.
    expect(share(2, 30)).toBe(
      `Fewer than ${tenths(1)} schools in the list record more facility types; ${tenths(9)} record the same.`
    );
  });

  it("gives counts below 20 other schools, and tenths from 20", () => {
    const subject = rec("s", { types: 0 });
    expect(line(subject, [])).toBeNull();
    expect(line(subject, [rec("a", { types: 3 })])).toBe(
      "The one other school in the list records more facility types."
    );
    expect(line(subject, [rec("a", { types: 3 }), rec("b", { types: 1 })])).toBe(
      "Both other schools in the list record more facility types."
    );
    expect(line(subject, [rec("a", { types: 3 }), rec("b", { types: 1 }), rec("c", { types: 0 })])).toBe(
      "2 of the 3 other schools in the list record more facility types; 1 records the same."
    );
    // 4 of the 20 schools in the list is 2 in 10, so the schools level with it are said.
    expect(line(subject, [...many("m", 15, { types: 2 }), ...many("n", 4, { types: 0 })])).toBe(
      "15 of the 19 other schools in the list record more facility types; 4 record the same."
    );
    // 15 of the 21 schools in the list is 71%, and 5 of them is 24%.
    expect(line(subject, [...many("m", 15, { types: 2 }), ...many("n", 5, { types: 0 })])).toBe(
      `${tenths(7)} schools in the list record more facility types; ${tenths(2)} record the same.`
    );
  });

  it("says a list of equal figures is the same as every other school, at any size", () => {
    const equal = (n: number) => line(rec("s", { types: 2 }), many("e", n, { types: 2 }));
    expect(equal(1)).toBe("The one other school in the list records the same number of facility types.");
    expect(equal(2)).toBe("Both other schools in the list record the same number of facility types.");
    expect(equal(4)).toBe("Every other school in the list records the same number of facility types.");
    expect(equal(30)).toBe("Every other school in the list records the same number of facility types.");
  });

  it("never words a comparison as the school's condition or need, and always says what is recorded", () => {
    // Every part, every group, and every way of saying how many: three figures per part, low, middle and high.
    const levels: Record<NeedKey, [Figures, Figures, Figures]> = {
      classrooms: [{ classrooms: [0, 6] }, { classrooms: [3, 6] }, { classrooms: [6, 6] }],
      housing: [{ houses: [0, 6] }, { houses: [3, 6] }, { houses: [5, 6] }],
      facilities: [{ types: 0 }, { types: 3 }, { types: 6 }],
      services: [{ services: 0.2 }, { services: 0.45 }, { services: 0.85 }],
      locality: [{ remoteness: 0 }, { remoteness: 0.45 }, { remoteness: 1 }],
    };
    const lines = new Set<string>();
    for (const key of Object.keys(levels) as NeedKey[]) {
      const [low, middle, high] = levels[key];
      for (const others of [low, middle, high])
        for (const [n, level] of [
          [1, 0],
          [2, 0],
          [5, 0],
          [5, 1],
          [5, 2],
          [25, 6],
          [29, 27],
        ] as const) {
          // `level` of the others share the subject's figure; the rest have `others`.
          const said = line(
            rec("s", middle),
            [...many("g", n - level, others), ...many("l", level, middle)],
            key
          );
          if (said) lines.add(said);
        }
    }
    expect(lines.size).toBeGreaterThan(60);
    for (const text of lines) {
      expect(textProblems(text), text).toEqual([]);
      expect(text, text).toMatch(/\brecord/i);
      expect(text, text).not.toMatch(/scale|count (more|less)/i);
    }
    // The guard catches the words a comparison could slip into.
    for (const slip of [
      "5 in 10 schools in the list record worse facilities.",
      "6 in 10 schools in the list record a better power and water rating.",
      "Poorer classrooms than every other school in the list.",
      "Needier than 7 in 10 schools in the list.",
      "4 in 10 schools in the list are more in need.",
      "More deprived than the one other school in the list.",
      "3 of the 4 other schools in the list are less disadvantaged.",
    ])
      expect(
        BANNED.some((b) => b.pattern.test(slip)),
        slip
      ).toBe(true);
  });
});
