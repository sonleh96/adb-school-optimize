/** Why the engine holds a school back for a reason that is not a need part, as a clause a sentence can use. */
import { FACILITIES, AREA_PARTS } from "./inputs";
import { capitalise, joinList, plural } from "./format";
import type { AreaField, CopySchool, OtherGate } from "./model";

// The district figures behind district context, as a sentence names them.
const AREA_FIGURES: Record<AreaField, string> = {
  progression10_deficit: "the share of students moving on from Grade 7 to Grade 10",
  progression12_deficit: "the share of students moving on from Grade 7 to Grade 12",
  secondary_participation_deficit: "the secondary enrolment figure",
  activity_deficit: "the night-time light figure",
  conflict_exposure: "the conflict exposure figure",
  female_disadvantage: "the girls' share of enrolment",
};
// The recorded counts that a negative number can spoil, as a sentence names them.
const STOCK_NAMES: readonly (readonly [keyof CopySchool["condition"], string])[] = [
  ["classrooms_total", "the total number of classrooms"],
  ["classrooms_permanent", "the number of classrooms built of permanent materials"],
  ["teachers", "the number of teachers"],
  ["teacher_houses", "the number of teacher houses"],
  ...FACILITIES.map(([f, n]) => [f, `the ${n} count`] as const),
];

/**
 * The negative counts a sentence names for `negative_stock_value`. A negative total of classrooms or number of
 * teachers is named with the share it spoils (see `partCause`) when that share is among the reasons, so it is left
 * out here and a count is never stated twice.
 */
export function negativeCounts(
  school: CopySchool
): readonly (readonly [keyof CopySchool["condition"], string])[] {
  const covered: Partial<Record<keyof CopySchool["condition"], string>> = {
    classrooms_total: "permanent_classroom_deficit",
    teachers: "teacher_housing_deficit",
  };
  return STOCK_NAMES.filter(([f]) => {
    const v = school.condition[f];
    if (typeof v !== "number" || v >= 0) return false;
    const part = covered[f];
    return !(part && (school.gate_failures as readonly string[]).includes(part));
  });
}

interface OtherCause {
  readonly kind: "blank" | "unusable" | "not_calculable";
  readonly text: string;
  readonly label: string;
  readonly effect: string;
}

// Why the engine holds a school back for a reason that is not a need part.
// kind is 'blank' (the value is not recorded), 'unusable' (recorded, but the calculation cannot use it) or
// 'not_calculable' (a figure built from other parts cannot be worked out).
export function otherCause(school: CopySchool, gate: OtherGate): OtherCause {
  switch (gate) {
    case "negative_stock_value": {
      const names = negativeCounts(school).map(([, n]) => n);
      return {
        kind: "unusable",
        text: names.length
          ? `${joinList(names)} ${plural(names.length, "is", "are")} recorded as a negative number`
          : "a count in the record is a negative number",
        label: "Negative count, needs checking",
        effect: "which needs checking",
      };
    }
    case "unresolved_area_context": {
      const a = school.area_parts;
      const figures = a ? AREA_PARTS.filter(([f]) => a[f] == null).map(([f]) => AREA_FIGURES[f]) : [];
      return {
        kind: "not_calculable",
        text: figures.length
          ? `${joinList(figures)} for its district ${plural(figures.length, "is", "are")} not recorded or cannot be used`
          : "a figure for its district is not recorded or cannot be used",
        label: "District figure missing or unusable",
        effect: "so its district context cannot be worked out",
      };
    }
    case "unresolved_reach":
      return {
        kind: "not_calculable",
        text: "the number of people within modelled walking distance is not recorded or cannot be used",
        label: "Walking reach missing or unusable",
        effect: "so its walking reach cannot be worked out",
      };
    case "urgency_unknown":
      return {
        kind: "blank",
        text: "its urgency value is not recorded",
        label: "Urgency value not recorded",
        effect: "and the rules that use urgency need it",
      };
    default:
      throw new Error(`No gate called ${String(gate)}`);
  }
}

// "The night-time light figure ... , so its district context cannot be worked out."
export const gateSentence = (c: { text: string; effect?: string }): string =>
  `${capitalise(c.text)}${c.effect ? `, ${c.effect}` : ""}.`;
