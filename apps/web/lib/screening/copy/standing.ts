/**
 * How a school's record for one part of school need compares with the other schools in the list, in one line with the
 * other schools as its subject, so the direction is said, never guessed: "5 in 10 schools in the list record more
 * facility types; 4 in 10 record the same." TEPI Explorer captions each input in this spirit ("Higher than 50% of block
 * groups"). The list is the schools the rule shown puts in order, those with one rank and those with a range. The school
 * itself and the schools not in the list yet are never counted.
 *
 * A part is compared on what the record gives: the share of classrooms built of permanent materials, teacher houses
 * per teacher, or how many of the six facility types the school has. Power and water, and remoteness, are recorded as
 * types and categories, so they are compared as the method scores them, in whole points of the research team's scale.
 * A share of two whole counts needs no such care: two equal fractions divide to the same number.
 *
 * Schools with exactly the same figure record neither more nor less. The line names the larger of two groups, the
 * schools that record more than this one and those that record less, then the schools that record the same when they
 * are at least 2 in 10 of the list. When the two groups are the same size, it names the schools whose bars are shorter.
 *
 * Every share is of the whole list, rounded down to whole tenths, so the line never claims more than the data holds:
 * 85 in 100 reads as 8 in 10. Below 20 other schools the line gives counts instead. A school outside the list, or one
 * whose own figure is not recorded, gets no line. Another school whose figure is not recorded is still one of the list:
 * it counts in the whole and in no group, so a share never reads larger than it is.
 */
import { capitalise } from "./format";
import { FACILITIES } from "./inputs";
import type { CopyCondition, CopyRuleId, CopySchool, NeedKey } from "./model";

/** Below this many other schools, a group is said as a count; from it, as a share of the list. */
const COUNT_BELOW = 20;
/** The schools level with this one are said when they are at least this many tenths of the list. */
const SAME_FROM = 2;

/** A verb phrase for a plural subject ("5 in 10 schools ... record") and for a singular one ("every other ... records"). */
interface Said {
  readonly many: string;
  readonly one: string;
}
const said = (many: string, one: string): Said => ({ many, one });

type Group = "more" | "less" | "same";

interface Part {
  /** The figure the record gives, or null when it is not recorded. */
  readonly figure: (school: CopySchool) => number | null;
  /** The group named first when the two are the same size: the schools whose bars are shorter than this one's. */
  readonly shorter: "more" | "less";
  /** What the schools that record more, or less, than this one record. */
  readonly more: Said;
  readonly less: Said;
  /** What the schools level with this one record, in a line of their own and after the first clause. */
  readonly same: (own: number) => { readonly alone: Said; readonly after: Said };
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
    shorter: "more",
    more: said(
      "record a larger share of permanent classrooms",
      "records a larger share of permanent classrooms"
    ),
    less: said(
      "record a smaller share of permanent classrooms",
      "records a smaller share of permanent classrooms"
    ),
    same: () => ({
      alone: said(
        "record the same share of permanent classrooms",
        "records the same share of permanent classrooms"
      ),
      after: said("record the same share", "records the same share"),
    }),
  },
  housing: {
    figure: (s) => ratio(s.condition.teacher_houses, s.condition.teachers),
    shorter: "more",
    more: said("record more teacher houses per teacher", "records more teacher houses per teacher"),
    less: said("record fewer teacher houses per teacher", "records fewer teacher houses per teacher"),
    same: () => ({
      alone: said(
        "record the same number of teacher houses per teacher",
        "records the same number of teacher houses per teacher"
      ),
      after: said("record the same", "records the same"),
    }),
  },
  facilities: {
    figure: (s) => facilityTypes(s.condition),
    shorter: "more",
    more: said("record more facility types", "records more facility types"),
    less: said("record fewer facility types", "records fewer facility types"),
    same: () => ({
      alone: said("record the same number of facility types", "records the same number of facility types"),
      after: said("record the same", "records the same"),
    }),
  },
  // The research team's scale scores a generator, a river or water brought from home highest, so they add most.
  services: {
    figure: (s) => points(s.need_parts?.service_deficit),
    shorter: "less",
    more: said(
      "record power and water that add more to school need",
      "records power and water that add more to school need"
    ),
    less: said(
      "record power and water that add less to school need",
      "records power and water that add less to school need"
    ),
    same: () => ({
      alone: said(
        "record power and water that add the same to school need",
        "records power and water that add the same to school need"
      ),
      after: said("score the same", "scores the same"),
    }),
  },
  locality: {
    figure: (s) => points(s.need_parts?.locality_disadvantage),
    shorter: "less",
    more: said("are recorded as more remote", "is recorded as more remote"),
    less: said("are recorded as less remote", "is recorded as less remote"),
    same: () => ({
      alone: said(
        "are recorded in the same remoteness category",
        "is recorded in the same remoteness category"
      ),
      after: said("are in the same category", "is in the same category"),
    }),
  },
};

interface Who {
  readonly text: string;
  readonly one: boolean;
}

/**
 * A group of `count` of the `others` in the list, as the subject of a line: below `COUNT_BELOW` other schools the
 * count itself, and from there the share of the whole list, this school included, rounded down to whole tenths. The
 * share's three words are joined by no-break spaces, so a line never breaks inside "9 in 10".
 */
function group(count: number, others: number): Who {
  if (count === others)
    return others === 1
      ? { text: "the one other school in the list", one: true }
      : others === 2
        ? { text: "both other schools in the list", one: false }
        : { text: "every other school in the list", one: true };
  if (others < COUNT_BELOW)
    return { text: `${count} of the ${others} other schools in the list`, one: count === 1 };
  const tenths = Math.floor((10 * count) / (others + 1));
  return {
    text:
      tenths > 0
        ? `${tenths}\u00a0in\u00a010 schools in the list`
        : "fewer than 1\u00a0in\u00a010 schools in the list",
    one: false,
  };
}

/** The same, after the first clause of a line, where "of the list" is understood: "4 in 10", or below 20 "4". */
function then(count: number, others: number): Who {
  if (others < COUNT_BELOW) return { text: String(count), one: count === 1 };
  return { text: `${Math.floor((10 * count) / (others + 1))}\u00a0in\u00a010`, one: false };
}

const clause = (who: Who, what: Said): string => `${who.text} ${who.one ? what.one : what.many}`;

/** The school is one of the schools the rule puts in order: it has a rank or a range of ranks under it. */
const inList = (school: CopySchool, ruleId: CopyRuleId): boolean => school.results?.[ruleId] != null;

/**
 * One line on how `school`'s record for the part `key` compares with the other schools `list` holds in order under
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
  const groups: Record<Group, number> = { more: 0, less: 0, same: 0 };
  let others = 0;
  for (const other of list) {
    if (other.id === school.id || !inList(other, ruleId)) continue;
    others += 1;
    const figure = part.figure(other);
    if (figure === null) continue;
    if (figure > own) groups.more += 1;
    else if (figure < own) groups.less += 1;
    else groups.same += 1;
  }
  const same = part.same(own);
  const side = groups.more === groups.less ? part.shorter : groups.more > groups.less ? "more" : "less";
  // No school records more or less: the line is about the schools level with this one, when any has the figure.
  if (groups[side] === 0)
    return groups.same === 0 ? null : `${capitalise(clause(group(groups.same, others), same.alone))}.`;
  const first = capitalise(clause(group(groups[side], others), part[side]));
  const level =
    10 * groups.same >= SAME_FROM * (others + 1) ? `; ${clause(then(groups.same, others), same.after)}` : "";
  return `${first}${level}.`;
}
