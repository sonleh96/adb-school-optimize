/**
 * The words of the explore page (`/explore`): charts of every school the method puts in order, so a reader sees
 * patterns across the list and where one school sits in it. Each question is answered in a sentence before its charts.
 *
 * A chart says what the records give, never a school's condition. A share of the list is rounded down to whole
 * tenths, as the card's comparison lines are, so a sentence never claims more than the data holds; below 20 schools
 * it gives counts instead. Each count comes from the data the page binds, never from here.
 *
 * Nothing in the entry `./index` imports this file, so the workspace does not carry it.
 */
import { REMOTENESS_CATEGORIES } from "./definitions";
import { capitalise, formatCount } from "./format";
import type { NeedKey, PartStep } from "./model";
import { LAYOUT } from "./words";

/** A verb phrase for a plural subject ("4 in 10 schools ... record") and for a singular one ("every school ... records"). */
interface Said {
  readonly many: string;
  readonly one: string;
}
const said = (many: string, one: string): Said => ({ many, one });

/** Below this many schools, a sentence gives counts; from it, shares of the list in whole tenths. */
const COUNT_BELOW = 20;

/**
 * `count` of the `total` schools of the list as the subject of a sentence, with whether it takes a singular verb. The
 * share's three words are joined by no-break spaces, so a line never breaks inside "9 in 10".
 */
function ofTheList(count: number, total: number): { readonly text: string; readonly one: boolean } {
  if (count === total)
    return total === 1
      ? { text: "the one school in the list", one: true }
      : total === 2
        ? { text: "both schools in the list", one: false }
        : { text: "every school in the list", one: true };
  if (total < COUNT_BELOW) return { text: `${count} of the ${total} schools in the list`, one: count === 1 };
  const tenths = Math.floor((10 * count) / total);
  return {
    text: tenths > 0 ? `${tenths} in 10 schools in the list` : "fewer than 1 in 10 schools in the list",
    one: false,
  };
}

/** A score on the research team's scale, from whole points (twentieths): 12 is "0.6", 7 is "0.35". */
const score = (points: number): string => String(Number((points / 20).toFixed(2)));

/** A step of a kind the part's axis never has: a caller's mistake, so it throws rather than words a wrong record. */
const noStep = (step: PartStep, part: string): never => {
  throw new Error(`The ${part} chart has no step of kind ${step.kind}`);
};

/** How one part's chart is worded. */
export interface PartWords {
  /** The chart's heading. */
  readonly title: string;
  /** What the axis measures, under the chart. */
  readonly axis: string;
  /** Which way along the axis adds more to school need. */
  readonly direction: string;
  /**
   * Under the axis, when its columns are only the values the list holds rather than a scale: why two neighbouring
   * columns can be far apart in value.
   */
  readonly spacing?: string;
  /**
   * A step's row in the table, and its label under its column. A share's axis labels only its two ends this way, and
   * the lines between its quarter steps with `edge`.
   */
  readonly label: (step: PartStep) => string;
  /** On a share's axis, the line where a quarter step starts (1 to 3), between two columns. */
  readonly edge?: (quarter: 1 | 2 | 3) => string;
  /** What the schools in a step record, after their subject. */
  readonly records: (step: PartStep) => Said;
}

const PERCENT_EDGES = ["0%", "25%", "50%", "75%", "100%"] as const;
const PER_TEACHER_EDGES = ["0", "0.25", "0.5", "0.75", "1"] as const;

const PARTS: Readonly<Record<NeedKey, PartWords>> = {
  classrooms: {
    title: "Permanent classrooms",
    axis: "Share of classrooms built of permanent materials",
    direction: "A smaller share adds more to school need.",
    label: (step) => {
      switch (step.kind) {
        case "none":
          return "None";
        case "quarter":
          return step.quarter === 0
            ? "Above 0%, under 25%"
            : `${PERCENT_EDGES[step.quarter]} to under ${PERCENT_EDGES[step.quarter + 1]}`;
        case "whole":
          return "All";
        default:
          return noStep(step, "classrooms");
      }
    },
    edge: (quarter) => PERCENT_EDGES[quarter],
    records: (step) => {
      switch (step.kind) {
        case "none":
          return said("record no permanent classrooms", "records no permanent classrooms");
        case "quarter": {
          const range =
            step.quarter === 0
              ? "above 0% and under 25%"
              : `from ${PERCENT_EDGES[step.quarter]} to under ${PERCENT_EDGES[step.quarter + 1]}`;
          return said(
            `record a share of permanent classrooms ${range}`,
            `records a share of permanent classrooms ${range}`
          );
        }
        case "whole":
          return said("record only permanent classrooms", "records only permanent classrooms");
        default:
          return noStep(step, "classrooms");
      }
    },
  },
  housing: {
    title: "Teacher houses",
    axis: "Teacher houses per teacher",
    direction: "Fewer houses per teacher add more to school need, and one or more adds nothing.",
    label: (step) => {
      switch (step.kind) {
        case "none":
          return "None";
        case "quarter":
          return step.quarter === 0
            ? "Above 0, under 0.25"
            : `${PER_TEACHER_EDGES[step.quarter]} to under ${PER_TEACHER_EDGES[step.quarter + 1]}`;
        case "whole":
          return "1 or more";
        default:
          return noStep(step, "housing");
      }
    },
    edge: (quarter) => PER_TEACHER_EDGES[quarter],
    records: (step) => {
      switch (step.kind) {
        case "none":
          return said("record no teacher houses", "records no teacher houses");
        case "quarter": {
          const range =
            step.quarter === 0
              ? "above 0 and under 0.25"
              : `from ${PER_TEACHER_EDGES[step.quarter]} to under ${PER_TEACHER_EDGES[step.quarter + 1]}`;
          const unit = step.quarter === 3 ? "teacher house per teacher" : "teacher houses per teacher";
          return said(`record ${range} ${unit}`, `records ${range} ${unit}`);
        }
        case "whole":
          return said("record at least one house per teacher", "records at least one house per teacher");
        default:
          return noStep(step, "housing");
      }
    },
  },
  facilities: {
    title: "Facility types",
    axis: "Facility types recorded, of the six the list looks at",
    direction: "Fewer facility types add more to school need.",
    label: (step) => (step.kind === "count" ? String(step.count) : noStep(step, "facilities")),
    records: (step) => {
      if (step.kind !== "count") return noStep(step, "facilities");
      if (step.count === 0)
        return said("record none of the six facility types", "records none of the six facility types");
      if (step.count === 6) return said("record all six facility types", "records all six facility types");
      return said(
        `record ${step.count} of the six facility types`,
        `records ${step.count} of the six facility types`
      );
    },
  },
  services: {
    title: "Power and water",
    axis: "Score for power and water, on the research team's scale",
    direction: "A higher score adds more to school need.",
    spacing:
      "Only the scores that schools in the list record get a column, so the columns sit side by side however far apart their scores are.",
    label: (step) => (step.kind === "points" ? score(step.points) : noStep(step, "services")),
    records: (step) => {
      if (step.kind !== "points") return noStep(step, "services");
      const what = `power and water that score ${score(step.points)} on the research team's scale`;
      return said(`record ${what}`, `records ${what}`);
    },
  },
  locality: {
    title: "Remoteness",
    axis: "Remoteness category",
    direction: "A more remote category adds more to school need.",
    label: (step) =>
      step.kind === "category" ? capitalise(REMOTENESS_CATEGORIES[step.index]) : noStep(step, "locality"),
    records: (step) => {
      if (step.kind !== "category") return noStep(step, "locality");
      const category = REMOTENESS_CATEGORIES[step.index];
      return said(`are recorded as ${category}`, `is recorded as ${category}`);
    },
  },
};

export const EXPLORE = Object.freeze({
  title: LAYOUT.explore,
  lede: "Charts of every school in the list, to show patterns across the schools and where one school sits among them.",
  /** The schools the charts hold, and the rule that puts them in order, as the screen names it. */
  scope: (count: number, rule: string) =>
    `The charts hold the ${formatCount(count)} ${count === 1 ? "school" : "schools"} that ${rule} puts in order.`,
  caveat: "The charts show what each school's record gives, not the school's real condition.",
  skip: "Skip to the charts",
  loading: "Loading the schools.",
  /** The list of the page's questions at its top, each a link to its section. */
  index: "Questions on this page",
  pick: {
    label: "Mark a school",
    hint: "It shows in navy in every chart that holds it.",
    none: "No school marked",
    notInList: "The school in this page's address is not in the list, so no school is marked.",
  },
  others: "Other schools in the list",
  compare: {
    question: "How do schools compare on each part of school need?",
    lede: "Each dot is one school in the list, in the column for what its record gives.",
  },
  parts: PARTS,
  /** The step that holds the most schools, as a sentence: "4 in 10 schools in the list record no teacher houses." */
  most: (key: NeedKey, step: PartStep, count: number, total: number) => {
    const who = ofTheList(count, total);
    const what = PARTS[key].records(step);
    return `${capitalise(who.text)} ${who.one ? what.one : what.many}.`;
  },
  /** The schools of the list whose record gives no figure for the part, and so have no dot. */
  unrecorded: (count: number) =>
    count === 1
      ? "One school in the list has no figure recorded for this part, so it has no dot."
      : `${formatCount(count)} schools in the list have no figure recorded for this part, so they have no dot.`,
  table: {
    show: "Show the numbers",
    hide: "Hide the numbers",
    step: "Record",
    schools: "Schools in the list",
    marked: "Holds the marked school",
    unrecorded: "Not recorded",
  },
});
