/**
 * How a school's record for one part of school need compares with the other schools in the list (`partStanding`).
 *
 * Failure modes, each with the test that catches it:
 *  1. Equal figures are counted as more or fewer, so a tie inflates the claim.     -> "counts a tie as neither ..."
 *  2. A missing figure is compared: the school's own, or another school's counted as 0 or as level.
 *                                                                                   -> "says nothing ...", "leaves out ..."
 *  3. The count takes in the school itself or the schools not in the list yet.     -> "counts only the other schools ..."
 *  4. A rule's line counts another rule's list.                                     -> "every rule ..." (two tests)
 *  5. A part's line points the wrong way, or a cap hides a difference the record shows, or the reverse.
 *                                                                                   -> "words each part ..."
 *  6. A share is rounded up into a stronger claim, or counts this school as one it is compared with.
 *                                                                                   -> "rounds a share down ..."
 *  7. A small list is said in tenths, or a list of one, two or three reads wrongly. -> "gives the count ..."
 *  8. A list whose figures are all equal reads as more or fewer.                    -> "says a list of equal ..."
 *  9. A line implies the school's condition or need, or does not say "recorded".   -> "never words ..."
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

/** The figures a test sets; the builder sets every other field. */
interface Figures {
  /** How many of the six facility types the school has, or null for a blank count. */
  types?: number | null;
  /** Permanent classrooms and all classrooms. */
  classrooms?: [number, number];
  /** Teacher houses and teachers. */
  houses?: [number, number];
  /** Power and water, and remoteness, on the research team's scale. */
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
  it("counts a tie as neither more nor fewer", () => {
    const subject = rec("s", { types: 0 });
    // Four others have none of the six types too, three have one: counted as more, the four would make "7 of 7".
    expect(line(subject, [...many("none", 4, { types: 0 }), ...many("one", 3, { types: 1 })])).toBe(
      "As many recorded facility types as 4 of the 7 other schools in the list."
    );
    // Level with three, above two, below two: the largest group is the schools level with it.
    expect(
      line(rec("s", { types: 2 }), [
        ...many("same", 3, { types: 2 }),
        ...many("more", 2, { types: 3 }),
        ...many("fewer", 2, { types: 1 }),
      ])
    ).toBe("As many recorded facility types as 3 of the 7 other schools in the list.");
  });

  it("names the side the part's bar grows towards when two groups are the same size, then the other side", () => {
    // One school has more types, one the same: fewer types is the side "Missing facility types" grows towards.
    expect(line(rec("s", { types: 0 }), [rec("a", { types: 1 }), rec("b", { types: 0 })])).toBe(
      "Fewer recorded facility types than 1 of the 2 other schools in the list."
    );
    // Remoteness grows the other way, towards a more remote category.
    expect(
      line(
        rec("s", { remoteness: 0.45 }),
        [rec("a", { remoteness: 0.2 }), rec("b", { remoteness: 0.7 })],
        "locality"
      )
    ).toBe("Recorded as more remote than 1 of the 2 other schools in the list.");
    // A side ahead of the same group on a tie: more types than one, the same as one.
    expect(line(rec("s", { types: 2 }), [rec("a", { types: 1 }), rec("b", { types: 2 })])).toBe(
      "More recorded facility types than 1 of the 2 other schools in the list."
    );
  });

  it("says nothing for a figure the school's own record does not give, or for a school not in the list", () => {
    const others = many("o", 3, { types: 2 });
    expect(line(rec("s", { types: null }), others)).toBeNull();
    expect(line(rec("s", { classrooms: [0, 0] }), others, "classrooms")).toBeNull();
    expect(line(rec("s", { houses: [2, 0] }), others, "housing")).toBeNull();
    // Not in the list under the rule shown: no rank, so no list to compare with.
    expect(line(rec("q", { types: 0 }, []), others)).toBeNull();
  });

  it("leaves out another school whose figure is not recorded, instead of counting it as 0 or as level", () => {
    // Counted as 0 types, the blank would be level with the subject: "Fewer ... than 2 of the 3".
    expect(
      line(rec("s", { types: 0 }), [
        rec("a", { types: 3 }),
        rec("b", { types: null }),
        rec("c", { types: 3 }),
      ])
    ).toBe("Fewer recorded facility types than both other schools in the list.");
    expect(line(rec("s", { types: 0 }), [rec("b", { types: null })])).toBeNull();
  });

  it("counts only the other schools in the list: not the school itself, and not the schools not in the list yet", () => {
    const subject = rec("s", { types: 0 });
    const notYet = rec("q", { types: 6 }, []);
    expect(line(subject, [rec("a", { types: 3 }), notYet])).toBe(
      "Fewer recorded facility types than the one other school in the list."
    );
    // The school's own record, once in the list as well, is still not one of the others.
    expect(partStanding(subject, MAIN, "facilities", [subject, { ...subject }, rec("a", { types: 3 })])).toBe(
      "Fewer recorded facility types than the one other school in the list."
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
          ? "Fewer recorded facility types than 2 of the 3 other schools in the list."
          : "Fewer recorded facility types than 1 of the 2 other schools in the list."
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
          ? "More recorded facility types than 17 of the 19 other schools in the list."
          : "More recorded facility types than 17 of the 18 other schools in the list."
      );
    }
  });

  it("words each part the way its record points", () => {
    const one = (key: NeedKey, own: Figures, other: Figures) => line(rec("s", own), [rec("a", other)], key);
    expect(one("classrooms", { classrooms: [0, 6] }, { classrooms: [6, 6] })).toBe(
      "A smaller recorded share of permanent classrooms than the one other school in the list."
    );
    expect(one("classrooms", { classrooms: [5, 6] }, { classrooms: [1, 4] })).toBe(
      "A larger recorded share of permanent classrooms than the one other school in the list."
    );
    // More permanent classrooms than classrooms reads as all of them, as the school's own sentence says.
    expect(one("classrooms", { classrooms: [7, 6] }, { classrooms: [6, 6] })).toBe(
      "The same recorded share of permanent classrooms as the one other school in the list."
    );
    expect(one("housing", { houses: [1, 9] }, { houses: [9, 9] })).toBe(
      "Fewer recorded teacher houses per teacher than the one other school in the list."
    );
    // Both records give at least one house per teacher, so both bars are empty, but the records differ.
    expect(one("housing", { houses: [12, 6] }, { houses: [6, 6] })).toBe(
      "More recorded teacher houses per teacher than the one other school in the list."
    );
    expect(one("housing", { houses: [3, 6] }, { houses: [2, 4] })).toBe(
      "As many recorded teacher houses per teacher as the one other school in the list."
    );
    expect(one("facilities", { types: 1 }, { types: 4 })).toBe(
      "Fewer recorded facility types than the one other school in the list."
    );
    expect(one("facilities", { types: 6 }, { types: 4 })).toBe(
      "More recorded facility types than the one other school in the list."
    );
    // On the research team's scale a generator and water from a river count 0.85, the grid and piped water 0.2.
    expect(one("services", { services: 0.85 }, { services: 0.2 })).toBe(
      "Recorded power and water sources that count more on the research team's scale than those of the one other school in the list."
    );
    expect(one("services", { services: 0.35 }, { services: 0.6 })).toBe(
      "Recorded power and water sources that count less on the research team's scale than those of the one other school in the list."
    );
    expect(one("locality", { remoteness: 1 }, { remoteness: 0.2 })).toBe(
      "Recorded as more remote than the one other school in the list."
    );
    expect(one("locality", { remoteness: 0 }, { remoteness: 0.45 })).toBe(
      "Recorded as less remote than the one other school in the list."
    );
    expect(one("locality", { remoteness: 0.7 }, { remoteness: 0.7 })).toBe(
      "Recorded in the same remoteness category as the one other school in the list."
    );
  });

  it("scores power and water in whole points of the method's scale, so the same score is level", () => {
    // The engine adds the two sources' scores and halves them: a generator with piped water comes to
    // 0.44999999999999996 and solar panels with a tank to 0.45, one score on the scale.
    const generatorPiped = (0.7 + 0.2) / 2;
    const solarTank = (0.4 + 0.5) / 2;
    expect(generatorPiped).not.toBe(solarTank);
    const level =
      "Recorded power and water sources that count the same on the research team's scale as those of the one other school in the list.";
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
    // No-break spaces hold the share together, so a line never breaks inside "8 in 10".
    const says = (tenths: number) =>
      `Fewer recorded facility types than ${tenths}\u00a0in\u00a010 schools in the list.`;
    expect(share(849, 1000)).toBe(says(8));
    expect(share(850, 1000)).toBe(says(8));
    expect(share(899, 1000)).toBe(says(8));
    expect(share(900, 1000)).toBe(says(9));
    expect(share(85, 100)).toBe(says(8));
    expect(share(90, 100)).toBe(says(9));
    // 27 of the 30 others is 90%, but 27 of the 31 schools in the list is 87%: 8 in 10, not 9.
    expect(share(27, 31)).toBe(says(8));
    // Every other school is said as such, not as 9 in 10.
    expect(share(30, 31)).toBe("Fewer recorded facility types than every other school in the list.");
  });

  it("gives the count below 20 other schools, and tenths from 20", () => {
    const subject = rec("s", { types: 0 });
    expect(line(subject, [])).toBeNull();
    expect(line(subject, [rec("a", { types: 3 })])).toBe(
      "Fewer recorded facility types than the one other school in the list."
    );
    expect(line(subject, [rec("a", { types: 3 }), rec("b", { types: 1 })])).toBe(
      "Fewer recorded facility types than both other schools in the list."
    );
    expect(line(subject, [rec("a", { types: 3 }), rec("b", { types: 1 }), rec("c", { types: 0 })])).toBe(
      "Fewer recorded facility types than 2 of the 3 other schools in the list."
    );
    expect(line(subject, [...many("m", 15, { types: 2 }), ...many("n", 4, { types: 0 })])).toBe(
      "Fewer recorded facility types than 15 of the 19 other schools in the list."
    );
    // 15 of the 21 schools in the list is 71%.
    expect(line(subject, [...many("m", 15, { types: 2 }), ...many("n", 5, { types: 0 })])).toBe(
      "Fewer recorded facility types than 7\u00a0in\u00a010 schools in the list."
    );
  });

  it("says a list of equal figures is the same as every other school, at any size", () => {
    const equal = (n: number) => line(rec("s", { types: 2 }), many("e", n, { types: 2 }));
    expect(equal(1)).toBe("As many recorded facility types as the one other school in the list.");
    expect(equal(2)).toBe("As many recorded facility types as both other schools in the list.");
    expect(equal(4)).toBe("As many recorded facility types as every other school in the list.");
    expect(equal(30)).toBe("As many recorded facility types as every other school in the list.");
  });

  it("never words a comparison as the school's condition or need, and always says recorded", () => {
    // Every part, every side, and every way of saying how many: three figures per part, low, middle and high.
    const levels: Record<NeedKey, [Figures, Figures, Figures]> = {
      classrooms: [{ classrooms: [0, 6] }, { classrooms: [3, 6] }, { classrooms: [6, 6] }],
      housing: [{ houses: [0, 6] }, { houses: [3, 6] }, { houses: [9, 6] }],
      facilities: [{ types: 0 }, { types: 3 }, { types: 6 }],
      services: [{ services: 0.2 }, { services: 0.45 }, { services: 0.85 }],
      locality: [{ remoteness: 0 }, { remoteness: 0.45 }, { remoteness: 1 }],
    };
    const lines = new Set<string>();
    for (const key of Object.keys(levels) as NeedKey[]) {
      const [low, middle, high] = levels[key];
      for (const others of [low, middle, high])
        for (const [n, odd] of [
          [1, 0],
          [2, 0],
          [5, 0],
          [5, 1],
          [25, 5],
        ] as const) {
          // `odd` of the others sit on another side, so the group named is not every other school.
          const elsewhere = others === middle ? high : middle;
          const said = line(
            rec("s", middle),
            [...many("g", n - odd, others), ...many("o", odd, elsewhere)],
            key
          );
          if (said) lines.add(said);
        }
    }
    // 5 parts, 3 sides, 5 ways of saying how many.
    expect(lines.size).toBe(75);
    for (const text of lines) {
      expect(textProblems(text), text).toEqual([]);
      expect(text, text).toMatch(/\brecorded\b/i);
    }
    // The guard catches the words a comparison could slip into.
    for (const slip of [
      "Worse recorded facility types than 9 in 10 schools in the list.",
      "Better recorded power and water than both other schools in the list.",
      "Poorer recorded classrooms than every other school in the list.",
      "Needier than 7 in 10 schools in the list.",
      "More in need than 7 in 10 schools in the list.",
      "More deprived than the one other school in the list.",
      "Less disadvantaged than 3 of the 4 other schools in the list.",
    ])
      expect(
        BANNED.some((b) => b.pattern.test(slip)),
        slip
      ).toBe(true);
  });
});
