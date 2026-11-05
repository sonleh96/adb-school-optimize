/**
 * The words of the explore page's section on what puts a school in the top 20 (`components/explore/sections`): each
 * school's score split into what each part adds to it, and how far each school is ahead of the next.
 *
 * A part "adds" to a score. Nothing here says what a school's buildings are like, only what its record gives. No share
 * is written here: a part's share comes from the API's rules, through the diagram of each part's share. Every count
 * and figure comes from the data the page binds.
 *
 * Nothing in the entry `./index` imports this file, so the workspace does not carry it.
 */
import { capitalise, formatCount, joinList, lowerFirst, ordinal } from "./format";
import { LAYOUT } from "./words";

/** `count` of the `total` scores charted, as the end of a sentence about them. */
const ofTheScores = (count: number, total: number): string =>
  count === total
    ? total === 1
      ? "the one score here"
      : `every one of these ${formatCount(total)} scores`
    : `${formatCount(count)} of these ${formatCount(total)} scores`;

/** "One pair of neighbours", "3 pairs of neighbours". */
const neighbourPairs = (count: number): string =>
  count === 1 ? "one pair of neighbours" : `${formatCount(count)} pairs of neighbours`;

export const DRIVERS = Object.freeze({
  question: "What puts a school in the top 20?",
  /**
   * The answer: in how many of the `total` scores charted the five parts of school need add more than every other
   * input together, the other inputs taken at the most they could add.
   */
  answer: (count: number, total: number) => {
    if (total === 0) return "No school in this list has a rank yet, so there is nothing to draw.";
    if (count === total)
      return `School need adds the most. In ${total === 1 ? "the score" : "every score"} below, its five parts add more than all the other inputs together.`;
    if (count === 0)
      return "In none of the scores below do the five parts of school need add more than all the other inputs together.";
    return `In ${formatCount(count)} of the ${formatCount(total)} scores below, the five parts of school need add more than all the other inputs together.`;
  },
  /** The choice of list, in the words the tool's own switch uses. */
  rules: { legend: LAYOUT.rulePair, main: LAYOUT.withoutUrgency, urgency: LAYOUT.withUrgency },
  bars: {
    title: "What adds to each score",
    /** What a bar is, under the rule named as the page names it. */
    lede: (rule: string) =>
      `Each bar is one school's score under ${rule}, split into what each part adds to it.`,
    ranges: "A school with a range of ranks is here when its highest rank is 20th or above.",
    /** The part that adds the most to the most scores; several parts when they do so equally often. */
    largest: (parts: readonly string[], count: number, total: number) =>
      parts.length === 1
        ? `The part that adds the most to ${ofTheScores(count, total)} is ${lowerFirst(parts[0])}.`
        : `${capitalise(joinList(parts.map(lowerFirst)))} each add the most to ${ofTheScores(count, total)}.`,
    need: "Parts of school need",
    /** The other inputs, named in the order their parts sit in each bar. */
    others: (inputs: readonly string[]) => `Other inputs, in this order: ${joinList(inputs.map(lowerFirst))}`,
    unrecorded: "Not recorded: adds anything from nothing up to its full share",
    axis: "Score",
    outside: "The marked school, outside the top 20",
    /** The part that adds the most to the marked school's score, and what it adds, written as the table writes it. */
    marked: (part: string, adds: string) =>
      `The part that adds the most to its score is ${lowerFirst(part)}, ${adds}.`,
    table: {
      caption: (rule: string) => `What each part adds to each score under ${rule}`,
      rank: "Rank",
      school: "School",
      score: "Score",
    },
  },
  gaps: {
    title: "How far each school is ahead of the next",
    lede: "Each bar is the gap between the scores of two neighbouring ranks, among the schools with one rank.",
    /** How many pairs of neighbours are tied, and how many more are under 0.001 apart. */
    line: (ties: number, close: number) => {
      if (ties > 0 && close > 0)
        return `${capitalise(neighbourPairs(ties))} ${ties === 1 ? "has" : "have"} the same score, and ${formatCount(close)} more ${close === 1 ? "is" : "are"} under 0.001 apart.`;
      if (ties > 0)
        return `${capitalise(neighbourPairs(ties))} ${ties === 1 ? "has" : "have"} the same score.`;
      if (close > 0)
        return `${capitalise(neighbourPairs(close))} ${close === 1 ? "is" : "are"} under 0.001 apart.`;
      return "Every pair of neighbours is at least 0.001 apart.";
    },
    /** The gap at the edge of the top 20, as the gap is written, or null when the two have the same score. */
    edge: (gap: string | null) =>
      gap === null
        ? "The 20th and the 21st have the same score."
        : `The 20th school is ${gap} ahead of the 21st.`,
    pair: (above: number, below: number) => `${ordinal(above)} and ${ordinal(below)}`,
    tie: "Tied",
    close: "under 0.001",
    edgeTag: "Edge of the top 20",
    tieNote: "Tied: the same score.",
    roundingNote:
      "Scores less than a billionth apart count as the same score: rounding inside the computer can leave two equal scores that close.",
    closeNote:
      "The tool writes scores to three decimals, where two scores under 0.001 apart can look the same.",
    rangesNote:
      "Schools with a range of ranks are not in these gaps: their score is a range, not one number.",
  },
  /** Why a rule gets no bars, under the rule named as the page names it. */
  notDrawn: {
    needFirst: (rule: string) =>
      `Under ${rule}, school need alone sets the order and the other inputs only separate schools whose school need is exactly equal, so there is no sum of parts to draw.`,
    largest: (rule: string, factors: readonly string[]) =>
      `Under ${rule}, part of each score comes from whichever of ${joinList(factors.map(lowerFirst), "or")} is higher for the school, so a score is not its parts added up and no bars are drawn.`,
    unreadable:
      "The parts of these scores are not drawn, because the list does not show how they add up to them.",
  },
});
