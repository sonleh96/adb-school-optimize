/**
 * The two rules the screen is built around, in the order the switch shows them: the revised paper's main rule, which
 * leaves urgency out and is the rule the screen opens on, then the circulated paper's rule, kept beside it as the
 * labelled urgency sensitivity. The page groups and compares these two as this pair. It never reads the pair from the
 * API's policy role, which names the main rule alone as primary.
 *
 * The copy's `DEFAULT_RULE` and `PROPOSED_RULE` keep the design prototype's names and values for the copy's parity
 * test. The screen does not read them; the lint config refuses an import of either outside the copy.
 */
import { type CopyRuleId, PRIMARY_RULE, SENSITIVITY_RULE } from "./copy";

export { PRIMARY_RULE, SENSITIVITY_RULE };

/** The main rule first, then the urgency sensitivity. */
export const RULE_PAIR: readonly [CopyRuleId, CopyRuleId] = Object.freeze([
  PRIMARY_RULE,
  SENSITIVITY_RULE,
]) as [CopyRuleId, CopyRuleId];

/** One of the two rules of the pair. */
export const inRulePair = (id: string): boolean => id === PRIMARY_RULE || id === SENSITIVITY_RULE;

/** The two rules of the pair, either way round. */
export const isRulePair = (a: string, b: string): boolean => a !== b && inRulePair(a) && inRulePair(b);
