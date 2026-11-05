/**
 * The five parts of school need as the explore page charts them across the list: for each part, the steps along its
 * axis, and which step each school's record puts it in. A school is placed by the figure its card's line compares
 * (`partFigure`), so a chart and the line under it never disagree. Remoteness is the one exception: it is placed by the
 * category its record gives, which the method scores in the same order, so the two orders are the same.
 *
 * The list is the schools the rule shown puts in order, with one rank or a range (`inList`). A school of the list whose
 * record gives no figure the axis can place is in no column, so it is never drawn as a zero; it still counts in the list.
 */
import { REMOTENESS_CATEGORIES } from "@/lib/screening/copy/definitions";
import type { CopyRuleId, CopySchool, NeedKey, PartStep } from "@/lib/screening/copy/model";
import { inList, partFigure } from "@/lib/screening/copy/standing";

import { bands } from "./scale";

/** The five parts, in the order the method and the card list them. */
export const PART_KEYS: readonly NeedKey[] = ["classrooms", "housing", "facilities", "services", "locality"];

/** One column of a part's chart. The copy words each kind of step, so the type lives with it. */
export type Step = PartStep;

interface Axis {
  /** Where the record puts the school, or null when it gives no figure. */
  readonly figure: (school: CopySchool) => number | null;
  /** The axis's steps. Only power and water reads the list's figures: the method's scale is not in the web app. */
  readonly steps: (figures: readonly number[]) => readonly Step[];
  /** The index of the step a figure falls in, or null for a figure no step holds. */
  readonly stepOf: (figure: number, steps: readonly Step[]) => number | null;
}

const SHARE_STEPS: readonly Step[] = [
  { kind: "none" },
  { kind: "quarter", quarter: 0 },
  { kind: "quarter", quarter: 1 },
  { kind: "quarter", quarter: 2 },
  { kind: "quarter", quarter: 3 },
  { kind: "whole" },
];
/**
 * A share from 0 to 1. Quarters are exact in binary, and a share is a quotient of two whole counts, so a share of
 * exactly 1/4 is in the step from 1/4 and one a hair under it is not.
 */
const shareStep = (share: number): number | null =>
  !(share >= 0 && share <= 1) ? null : share === 0 ? 0 : share === 1 ? 5 : 1 + Math.floor(share * 4);

const FACILITY_TYPES = 6;
const COUNT_STEPS: readonly Step[] = Array.from({ length: FACILITY_TYPES + 1 }, (_, count) => ({
  kind: "count",
  count,
}));
const countStep = (count: number): number | null =>
  Number.isInteger(count) && count >= 0 && count <= FACILITY_TYPES ? count : null;

/** The scores the list's records hold, lowest first, one step each. */
const pointSteps = (figures: readonly number[]): readonly Step[] =>
  [...new Set(figures)].sort((a, b) => a - b).map((points) => ({ kind: "points", points }));
const pointStep = (points: number, steps: readonly Step[]): number | null => {
  const index = steps.findIndex((step) => step.kind === "points" && step.points === points);
  return index < 0 ? null : index;
};

const CATEGORY_STEPS: readonly Step[] = REMOTENESS_CATEGORIES.map((_, index) => ({
  kind: "category",
  index,
}));
/** The record's remoteness category, read as the engine reads it: trimmed and in any case. */
const recordedCategory = (school: CopySchool): number | null => {
  const index =
    school.locality == null ? -1 : REMOTENESS_CATEGORIES.indexOf(school.locality.trim().toLowerCase());
  return index < 0 ? null : index;
};

const shareAxis = (key: "classrooms" | "housing"): Axis => ({
  figure: (school) => partFigure(school, key),
  steps: () => SHARE_STEPS,
  stepOf: shareStep,
});

const AXES: Readonly<Record<NeedKey, Axis>> = {
  classrooms: shareAxis("classrooms"),
  housing: shareAxis("housing"),
  facilities: {
    figure: (school) => partFigure(school, "facilities"),
    steps: () => COUNT_STEPS,
    stepOf: countStep,
  },
  services: { figure: (school) => partFigure(school, "services"), steps: pointSteps, stepOf: pointStep },
  locality: { figure: recordedCategory, steps: () => CATEGORY_STEPS, stepOf: (index) => index },
};

/** One part's chart: the schools of the list in each step of its axis. */
export interface PartColumns {
  readonly key: NeedKey;
  readonly steps: readonly Step[];
  /** The schools of the list in each step, in the list's order. One column per step. */
  readonly columns: readonly (readonly CopySchool[])[];
  /** The schools of the list whose record gives no figure for the part. */
  readonly unrecorded: readonly CopySchool[];
  /** How many schools the list holds: those in every column and those with no figure. */
  readonly total: number;
}

export function partColumns(key: NeedKey, schools: readonly CopySchool[], rule: CopyRuleId): PartColumns {
  const axis = AXES[key];
  const listed = schools.filter((school) => inList(school, rule));
  const placed = listed.map((school) => ({ school, figure: axis.figure(school) }));
  const steps = axis.steps(placed.flatMap(({ figure }) => (figure === null ? [] : [figure])));
  const columns: CopySchool[][] = steps.map(() => []);
  const unrecorded: CopySchool[] = [];
  for (const { school, figure } of placed) {
    const step = figure === null ? null : axis.stepOf(figure, steps);
    if (step === null) unrecorded.push(school);
    else columns[step].push(school);
  }
  return { key, steps, columns, unrecorded, total: listed.length };
}

/**
 * The columns with the school `id` moved to the top of its own: the last of its column, so its dot is drawn there and
 * a reader finds it where its column ends. Order inside a column means nothing, so no other school moves column.
 */
export function raised(
  columns: readonly (readonly CopySchool[])[],
  id: string | null
): (readonly CopySchool[])[] {
  return columns.map((column) => {
    const school = id === null ? undefined : column.find((s) => s.id === id);
    return school ? [...column.filter((s) => s !== school), school] : column;
  });
}

/** The column holding the school with `id`, or null when no column does. */
export function columnOf(chart: PartColumns, id: string): number | null {
  const index = chart.columns.findIndex((column) => column.some((school) => school.id === id));
  return index < 0 ? null : index;
}

/** The column holding the most schools, the first of them in the axis's order; null when every column is empty. */
export function tallest(chart: PartColumns): number | null {
  let best: number | null = null;
  chart.columns.forEach((column, index) => {
    if (column.length > 0 && (best === null || column.length > chart.columns[best].length)) best = index;
  });
  return best;
}

/** A label under a part's chart, as a fraction of its width: under a column, or on the line where a quarter starts. */
export type Tick =
  | { readonly kind: "step"; readonly at: number; readonly step: number; readonly room: number }
  | { readonly kind: "edge"; readonly at: number; readonly quarter: 1 | 2 | 3 };

/**
 * Where a chart's labels go. Every column is named under its centre, with its width as the room to wrap in, except a
 * share's quarters, which are read from the lines between them: a line marks where the quarter after it starts.
 */
export function ticksOf(chart: PartColumns): Tick[] {
  const scale = bands(chart.steps.length, 1);
  return chart.steps.flatMap((step, index): Tick[] => {
    if (step.kind !== "quarter")
      return [{ kind: "step", at: scale.centre(index), step: index, room: scale.step }];
    return step.quarter === 0 ? [] : [{ kind: "edge", at: scale.edge(index), quarter: step.quarter }];
  });
}
