/**
 * The words of the fixed diagram of how much each part counts towards a rule's score, in How this works and the
 * method details. The shares themselves come from the API's rules (`lib/screening/score-tree.ts`), never from here.
 * A need-first rule draws no diagram: it gets its one line, `ruleOneLine`, instead.
 *
 * Nothing in the entry `./index` imports this file, so the first screen does not carry it.
 */
import { joinList } from "./format";

export const SCORE_TREE = Object.freeze({
  title: "How much each part counts",
  /** What the bars show, under the rule named as the screen names it. */
  lede: (rule: string) =>
    `Under ${rule}, each bar is one part's fixed share of the score. Together the shares make up the whole score.`,
  /** A part's share of the score in whole percent, with "about" when the share is not a whole percent. */
  share: (percent: number, whole: boolean) => (whole ? `${percent}%` : `about ${percent}%`),
  /** Under school need: how its five parts make it up (the plain mean, `components.py`). */
  needParts: "The average of the five parts below",
  /** A largest-factor rule's combined-factors term. */
  combined: "Combined factors",
  /** A largest-factor rule's extra term, naming the inputs it takes the largest of. */
  largest: (inputs: readonly string[]) =>
    `Whichever is ${inputs.length > 2 ? "highest" : "higher"} for the school: ${joinList(inputs, "or")}`,
  /** The last row: every part's bar end to end, as long as the whole score. */
  whole: "The whole score",
  scale:
    "School need and the score both run from 0 to 1. A higher school need means more recorded need, and a higher score puts a school earlier in the list.",
});
