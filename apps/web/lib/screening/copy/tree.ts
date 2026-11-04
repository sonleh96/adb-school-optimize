/**
 * The words of the fixed diagram of how much each part counts towards a rule's score, in How this works and the
 * method details. The shares themselves come from the API's rules (`lib/screening/score-tree.ts`), never from here.
 * A need-first rule draws no diagram: it gets its one line, `ruleOneLine`, instead.
 *
 * Shares are worded so that no total is stated that the shares under it do not add up to: a part of school need is a
 * fifth of it, a part of a largest-factor rule's combined factors is a share of them, and the last row states 100%
 * only when the shares above it, as written, add up to it.
 *
 * Nothing in the entry `./index` imports this file, so the first screen does not carry it.
 */
import { joinList } from "./format";

export const SCORE_TREE = Object.freeze({
  title: "How much each part counts",
  /** What the bars show, under the rule named as the screen names it. */
  lede: (rule: string) => `Under ${rule}, each bar is one part's fixed share of the score.`,
  /** A share of the score, given as "60" or "63.2". */
  share: (percent: string) => `${percent}%`,
  /** Each part of school need, which is the plain mean of its five parts (`components.py`). */
  fifthOfNeed: "a fifth of school need",
  /** A part of a largest-factor rule's combined factors, as its share of them, given as "60" or "63.2". */
  ofCombined: (percent: string) => `${percent}% of combined factors`,
  /** A largest-factor rule's combined-factors term. */
  combined: "Combined factors",
  /** A largest-factor rule's extra term, naming the inputs it takes the largest of. */
  largest: (inputs: readonly string[]) =>
    `Whichever is ${inputs.length > 2 ? "highest" : "higher"} for the school: ${joinList(inputs, "or")}`,
  /** The last row: every top part's bar end to end, as long as the whole score. */
  whole: "All the parts together",
  scale:
    "School need and the score both run from 0 to 1. A higher school need means more recorded need, and a higher score puts a school earlier in the list.",
});
