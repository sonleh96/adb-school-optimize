/**
 * How a school's record for one part of school need compares with the other schools in the list, in one sentence,
 * as TEPI Explorer captions each input "Higher than 50% of block groups". The list is the schools the rule shown puts
 * in order, those with one rank and those with a range. The school itself and the schools not in the list yet are
 * never counted.
 *
 * A part is compared on what the record gives: the share of classrooms built of permanent materials, teacher houses
 * per teacher, or how many of the six facility types the school has. Power and water, and remoteness, are recorded as
 * types and categories, so they are compared on the research team's scale, as the engine reads them, in whole points
 * of it. A share of two whole counts needs no such care: two equal fractions divide to the same number.
 *
 * Schools with exactly the same figure are neither more nor fewer. The sentence names the largest of three groups, the
 * schools this one has more than, fewer than, or the same as, so a school level with half the list is said to be level.
 * When two groups are the same size, it names the side the part's bar grows towards first, then the other side.
 *
 * A share is of the whole list, rounded down to whole tenths, so the sentence never claims more than the data holds:
 * 85 in 100 reads as 8 in 10. Below 20 other schools it gives the count instead. A school outside the list, or one whose
 * own figure is not recorded, gets no sentence; another school whose figure is not recorded is left out of the count.
 */
import { FACILITIES } from "./inputs";
import type { CopyCondition, CopyRuleId, CopySchool, NeedKey } from "./model";

/** From this many other schools with a recorded figure, a group is said as a share of the list. */
const SHARE_FROM = 20;

type Side = "higher" | "lower" | "same";
type Phrase = (quantity: string) => string;

interface Part {
  /** The figure the record gives, or null when it is not recorded. */
  readonly figure: (school: CopySchool) => number | null;
  /** The side the part's bar grows towards: a lower figure (fewer facility types) or a higher one (more remote). */
  readonly bar: "higher" | "lower";
  /** The sentence for a school whose figure is higher than the group's, lower, or the same. */
  readonly higher: Phrase;
  readonly lower: Phrase;
  readonly same: Phrase;
}

/** A share of a whole, or null when either is not recorded or the whole is not above 0. */
function ratio(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole <= 0) return null;
  return part / whole;
}

/**
 * A score on one of the research team's scales in whole points. Every score on them is a multiple of 0.05
 * (`packages/school_scoring/school_scoring/screening/components.py`), but the engine's power and water score is a
 * sum halved in floating point: a generator with piped water comes to 0.44999999999999996 and solar panels with a
 * tank to 0.45. In twentieths both are 9.
 */
const points = (score: number | null | undefined): number | null =>
  score == null ? null : Math.round(score * 20);

/** How many of the six facility types the record has at least one of; null when any count is blank. */
function facilityTypes(condition: CopyCondition): number | null {
  const counts = FACILITIES.map(([field]) => condition[field]);
  return counts.some((count) => count == null)
    ? null
    : counts.filter((count) => (count as number) > 0).length;
}

const PARTS: Readonly<Record<NeedKey, Part>> = {
  // All of a school's classrooms built of permanent materials is the most the share can say, as the sentence about
  // the school's own classrooms says "all" whenever the count reaches the total.
  classrooms: {
    figure: (s) => {
      const share = ratio(s.condition.classrooms_permanent, s.condition.classrooms_total);
      return share === null ? null : Math.min(share, 1);
    },
    bar: "lower",
    higher: (q) => `A larger recorded share of permanent classrooms than ${q}.`,
    lower: (q) => `A smaller recorded share of permanent classrooms than ${q}.`,
    same: (q) => `The same recorded share of permanent classrooms as ${q}.`,
  },
  housing: {
    figure: (s) => ratio(s.condition.teacher_houses, s.condition.teachers),
    bar: "lower",
    higher: (q) => `More recorded teacher houses per teacher than ${q}.`,
    lower: (q) => `Fewer recorded teacher houses per teacher than ${q}.`,
    same: (q) => `As many recorded teacher houses per teacher as ${q}.`,
  },
  facilities: {
    figure: (s) => facilityTypes(s.condition),
    bar: "lower",
    higher: (q) => `More recorded facility types than ${q}.`,
    lower: (q) => `Fewer recorded facility types than ${q}.`,
    same: (q) => `As many recorded facility types as ${q}.`,
  },
  // The research team's scale counts a generator, a river or water brought from home highest.
  services: {
    figure: (s) => points(s.need_parts?.service_deficit),
    bar: "higher",
    higher: (q) =>
      `Recorded power and water sources that count more on the research team's scale than those of ${q}.`,
    lower: (q) =>
      `Recorded power and water sources that count less on the research team's scale than those of ${q}.`,
    same: (q) =>
      `Recorded power and water sources that count the same on the research team's scale as those of ${q}.`,
  },
  locality: {
    figure: (s) => points(s.need_parts?.locality_disadvantage),
    bar: "higher",
    higher: (q) => `Recorded as more remote than ${q}.`,
    lower: (q) => `Recorded as less remote than ${q}.`,
    same: (q) => `Recorded in the same remoteness category as ${q}.`,
  },
};

/**
 * A group of `count` of the `others` with a recorded figure, in words: the count below `SHARE_FROM` other schools, and
 * from there the share of the whole list, this school included, rounded down to whole tenths. The share's three words
 * are joined by no-break spaces, so a line never breaks inside "9 in 10".
 */
function quantity(count: number, others: number): string {
  if (count === others)
    return others === 1
      ? "the one other school in the list"
      : others === 2
        ? "both other schools in the list"
        : "every other school in the list";
  if (others < SHARE_FROM) return `${count} of the ${others} other schools in the list`;
  return `${Math.floor((10 * count) / (others + 1))}\u00a0in\u00a010 schools in the list`;
}

/** The school is one of the schools the rule puts in order: it has a rank or a range of ranks under it. */
const inList = (school: CopySchool, ruleId: CopyRuleId): boolean => school.results?.[ruleId] != null;

/**
 * One sentence on how `school`'s record for the part `key` compares with the other schools `list` holds in order under
 * `ruleId`, or null when there is nothing to compare: the school is not in that list, its own figure is not recorded,
 * or no other school in the list has the figure recorded.
 */
export function partStanding(
  school: CopySchool,
  ruleId: CopyRuleId,
  key: NeedKey,
  list: readonly CopySchool[]
): string | null {
  const part = PARTS[key];
  const own = part.figure(school);
  if (own === null || !inList(school, ruleId)) return null;
  const groups: Record<Side, number> = { higher: 0, lower: 0, same: 0 };
  for (const other of list) {
    if (other.id === school.id || !inList(other, ruleId)) continue;
    const figure = part.figure(other);
    if (figure === null) continue;
    if (own > figure) groups.higher += 1;
    else if (own < figure) groups.lower += 1;
    else groups.same += 1;
  }
  const others = groups.higher + groups.lower + groups.same;
  if (others === 0) return null;
  const order: readonly Side[] =
    part.bar === "higher" ? ["higher", "lower", "same"] : ["lower", "higher", "same"];
  const side = order.reduce((best, next) => (groups[next] > groups[best] ? next : best));
  return part[side](quantity(groups[side], others));
}
