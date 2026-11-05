/**
 * The words of the explore page's second question, how stable the list is. Two charts answer it: how often each school
 * stayed in the top 20 when the paper changed the weights at random, in each setting of a rule's test, and where the
 * main method's top 20 sit under each of the seven rules.
 *
 * A share of runs is a share of runs under the paper's declared settings, never a probability, and a school near the
 * line can land on the other side of it in another round of runs. The line, the band and the caveat are the method
 * details' own words (`METHOD.insp.frequencies`). Each count comes from the data the page binds, never from here.
 *
 * Nothing in the entry `./index` imports this file, so the workspace does not carry it.
 */
import { countWord } from "./counts";
import { formatCount, formatPercent } from "./format";
import type { PersistenceRule } from "./model";
import { LAYOUT } from "./words";

/** One end of a column of the frequency chart: a share of runs, and whether the column holds that share itself. */
export interface FrequencyEnd {
  readonly at: number;
  readonly holds: boolean;
}

/** A column of the frequency chart. The copy words each kind, so the type lives with it. */
export type FrequencyBin =
  /** In the top 20 in none of the runs. */
  | { readonly kind: "none" }
  /** A share between two ends; `band` when the whole column lies inside the shaded band round the line. */
  | { readonly kind: "span"; readonly from: FrequencyEnd; readonly to: FrequencyEnd; readonly band: boolean }
  /** In the top 20 in every run. */
  | { readonly kind: "all" };

/** A count of schools as the subject of a sentence: "No school", "One school", "12 schools". */
const schools = (count: number): string =>
  count === 0 ? "no school" : count === 1 ? "one school" : `${formatCount(count)} schools`;

/** The other rules, after the first: "the other rule", "the other six rules". */
const otherRules = (rules: number): string =>
  rules === 2 ? "the other rule" : `the other ${countWord(rules - 1)} rules`;

/** A concentration as the paper writes it: 20, 40.5. */
const plainNumber = (n: number): string => String(Number(n.toPrecision(12)));
/** The three settings, from the one where the weights changed most to the one where they changed least. */
const SPREAD = ["Weights changed a lot", "Weights changed moderately", "Weights changed a little"] as const;
type Concentrations = { readonly topLevel: number; readonly schoolNeed: number };

/** Each rule's own test, as the subject of the sentence over its chart. Neither is read as the other's result. */
const TEST_OF: Readonly<Record<PersistenceRule, string>> = {
  additive_no_u: "In the main method's own test",
  additive_u: "In the earlier method's own test",
};

export const EXPLORE_STABILITY = Object.freeze({
  question: "How stable is the list?",
  /**
   * The section's answer: how many schools stayed in the top 20 often enough in every setting of the anchor rule's
   * own test, and how many of its top 20 are in the top 20 under every other rule too. The second half is left out
   * when the page has no other rule, or no school in the top 20.
   */
  answer: (
    rule: string,
    persistent: number,
    line: string,
    kept: number,
    top: number,
    rules: number
  ): string => {
    const first = `Under ${rule}, ${schools(persistent)} stayed in the top 20 in at least ${line} of runs with random weights in every setting`;
    if (rules < 2 || top === 0) return `${first}.`;
    const group = top === 20 ? "its top 20" : `the ${formatCount(top)} schools in its top 20`;
    const held =
      kept === 0
        ? `none of ${group} is in the top 20 under ${rules === 2 ? "the other rule" : `all ${otherRules(rules)}`}`
        : kept === top
          ? top === 1
            ? `the one school in its top 20 is also in the top 20 under ${otherRules(rules)}`
            : `all of ${group} are also in the top 20 under ${otherRules(rules)}`
          : `${formatCount(kept)} of ${group} ${kept === 1 ? "is" : "are"} also in the top 20 under ${otherRules(rules)}`;
    return `${first}, and ${held}.`;
  },
  frequencies: Object.freeze({
    title: "How often each school stayed in the top 20",
    what: (draws: number, settings: number) =>
      `The research team changed the weights at random ${formatCount(draws)} times in ${settings === 1 ? "one setting" : `each of ${countWord(settings)} settings`}. Each dot is one school, in the column for the share of those runs in which it stayed in the top 20.`,
    /** The switch between the two rules the paper's test ran for. */
    show: "Show the test for",
    /** The answer over the chart, for the rule whose test it shows. */
    persistent: (rule: PersistenceRule, count: number, line: string) =>
      `${TEST_OF[rule]}, ${schools(count)} in its list stayed in the top 20 in at least ${line} of runs in every setting.`,
    /** Under the switch, when it shows the earlier method's test. */
    urgency:
      "That test also drew a weight for the urgency rating, so it is the earlier method's result, not the main method's.",
    /** Under the switch, while the earlier method's list is on its way, and when it did not arrive. */
    urgencyLoading: "Loading the earlier method's test.",
    urgencyFailed: "The earlier method's list did not load, so its test cannot be shown.",
    /** Under the column labels: it gives their unit, since only the two end labels carry the per cent sign. */
    axis: "Per cent of runs in which the school stayed in the top 20",
    /*
     * The method details' words for one school's shares (`METHOD.insp.frequencies`, which loads only with the method
     * details), the same here so the two drawings read alike; a test holds them equal.
     */
    /** A setting in plain words, with its concentrations; settings in another number or order are named by place. */
    setting: (settings: readonly Concentrations[], i: number): string => {
      const s = settings[i];
      const pair = `${plainNumber(s.topLevel)}/${plainNumber(s.schoolNeed)}`;
      const spread =
        settings.length === SPREAD.length &&
        settings.every(
          (x, j) =>
            j === 0 || (x.topLevel > settings[j - 1].topLevel && x.schoolNeed > settings[j - 1].schoolNeed)
        );
      return `${spread ? SPREAD[i] : `Setting ${i + 1}`} (${pair})`;
    },
    runs: (percent: string) => `${percent} of runs`,
    line: (percent: string) => `${percent} line`,
    reaches: (percent: string) => `reaches the ${percent} line`,
    below: (percent: string) => `below the ${percent} line`,
    band: (lo: string, hi: string) =>
      `The shaded band, ${lo} to ${hi}, is near the line. Another round of runs could move a school inside it to the other side.`,
    caveat: "Each is a share of runs under declared scenarios, not a probability that the school needs help.",
    /**
     * A column's range under the chart, short enough to wrap between its words inside a phone's narrow column: "0%",
     * "under 10", "10 to 50", "78.9 to 80", "over 81.1", "100%". Only the two end columns carry the per cent sign,
     * since "81.1%" is wider than a column on a 360 px phone; the axis line under the labels names the unit for the
     * ranges between them (`axis`). The table names each range in full (`bin`).
     */
    column: (bin: FrequencyBin): string => {
      const n = (at: number) => formatPercent(at).slice(0, -1);
      switch (bin.kind) {
        case "none":
          return formatPercent(0);
        case "all":
          return formatPercent(1);
        case "span":
          if (bin.from.at === 0) return `under ${n(bin.to.at)}`;
          if (bin.to.at === 1) return `${bin.from.holds ? "from" : "over"} ${n(bin.from.at)}`;
          return `${n(bin.from.at)} to ${n(bin.to.at)}`;
      }
    },
    /** Beside the axis: the columns are ranges, not a scale, and why they are drawn alike. */
    notToScale: (line: string, band: boolean) =>
      `The columns are ranges of different widths, drawn the same width so the narrow ${band ? "band" : "ones"} near the ${line} line can be seen.`,
    /** A column, as its row in the table names it. */
    bin: (bin: FrequencyBin): string => {
      switch (bin.kind) {
        case "none":
          return "0% of runs";
        case "all":
          return "100% of runs";
        case "span": {
          const from = formatPercent(bin.from.at);
          const to = formatPercent(bin.to.at);
          const head = bin.from.holds
            ? `${from} to ${bin.to.holds ? to : `under ${to}`}`
            : `Above ${from}, ${bin.to.holds ? `up to ${to}` : `under ${to}`}`;
          return bin.band ? `${head}, in the shaded band` : head;
        }
      }
    },
    flag: "The paper flags a school as often in the top 20 when it reaches the line in every setting, so a small difference near the line can change the flag.",
    undrawn: (count: number) =>
      count === 1
        ? "One school in the list has no shares in this test, so it has no dot."
        : `${formatCount(count)} schools in the list have no shares in this test, so they have no dot.`,
    none: "This rule's list carries no shares from the paper's test, so there is nothing to draw.",
    /** After the marked school's name. */
    markedNone: "has no shares in this test, so it has no dot.",
    table: Object.freeze({
      share: "Share of runs",
      undrawn: "No shares in this test",
    }),
  }),
  bump: Object.freeze({
    title: (rule: string) => `Where ${rule}'s top 20 sit under each rule`,
    /** While the other rules' lists are on their way. */
    loading: "Loading the other rules' lists.",
    answer: (kept: number, top: number, rules: number) =>
      kept === top
        ? top === 1
          ? `The one school is in the top 20 under all ${countWord(rules)} rules.`
          : `All ${formatCount(top)} of these schools are in the top 20 under all ${countWord(rules)} rules.`
        : kept === 0
          ? `None of these schools is in the top 20 under all ${countWord(rules)} rules.`
          : `${formatCount(kept)} of these ${formatCount(top)} schools ${kept === 1 ? "is" : "are"} in the top 20 under all ${countWord(rules)} rules.`,
    what: (rule: string) =>
      `Each line is one school, from its rank under ${rule} in the first column to its rank under each other rule.`,
    /** Under the chart, when its narrow columns name each pair's two rules by one word each. */
    pairs: "Each pair of columns is one kind of rule, first without the urgency rating and then with it.",
    without: "Without",
    with: "With",
    axis: "Rank under each rule, with 1 at the top",
    closer: (from: number, to: number) =>
      `Below the line under rank ${formatCount(from - 1)}, ranks ${formatCount(from)} to ${formatCount(to)} are drawn closer together.`,
    /** The line under the answer that keys the two kinds of line; the marked school is keyed over every chart. */
    key: Object.freeze({
      kept: "In the top 20 under every rule",
      rest: "The rest of this top 20",
    }),
    lane: LAYOUT.incompleteTab,
    range: "A bar gives the highest and lowest ranks a school could take while a figure is missing.",
    out: "A ring in the bottom row means the school is not in that rule's list yet.",
    /** After the marked school's name, when the anchor rule ranks it below its top 20. */
    below: (rule: string, rank: string) =>
      `ranks ${rank} under ${rule}, below its top 20, so it is added in navy.`,
    /** After the marked school's name, when the anchor rule gives it a range of possible ranks. */
    ranged: (rule: string) =>
      `has a range of possible ranks under ${rule}, not one rank, so it is added in navy.`,
    /** The schools with a range under the anchor rule that could reach its top 20, which the chart leaves out. */
    reaching: (count: number) =>
      count === 1
        ? "One school with a range of possible ranks could also be in this top 20. Mark it to add it to the chart."
        : `${formatCount(count)} schools with a range of possible ranks could also be in this top 20. Mark one to add it to the chart.`,
    table: Object.freeze({
      school: "School",
      none: "No result",
      marked: "The marked school",
      /** A range whose highest and lowest ranks are the same: the missing figure cannot change it. */
      either: (rank: string) => `${rank} either way`,
    }),
  }),
});
