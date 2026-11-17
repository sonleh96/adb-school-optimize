/**
 * The copy that a screen needs only on demand: the guide, How this works, its worked example, the five first
 * questions, the glossary and the banned-word list. It is a separate entry so a bundler can load it when the user
 * opens a guide, the page or the glossary, and the list and the card ship without it.
 *
 * Reach it through the bound copy's `later()`, which imports this module on first use:
 *
 *   const { GUIDE, HOW_IT_WORKS } = await P.later();
 *
 * Nothing in the entry `./index` imports this file, so the up-front bundle does not hold it. The names it exports
 * also exist here with no data bound (`GUIDE`, `HOW_IT_WORKS`, ...) for tests and for tooling.
 */
import { buildIdeas } from "./ideas";
import { urgencyReassurance, findPair } from "./compare";
import { TRUST_TAIL, buildHow, buildQuestions, howExampleSegments } from "./explainer";
import { GLOSSARY_GROUPS } from "./glossary";
import { GUIDE, GUIDE_SEGMENTS } from "./guide";
import type { ComparisonData, CountBag, CountsByRuleArg, Top20Change } from "./model";
import { textOf } from "./segments";

export { BANNED } from "./banned";
export { GUIDE, GUIDE_SEGMENTS } from "./guide";
export { GLOSSARY_GROUPS } from "./glossary";
export { buildHow, buildQuestions, FIRST_QUESTIONS, HOW_IT_WORKS, howExampleSegments } from "./explainer";

/** What `laterFor` reads: the same bound data `copyFor` was given. */
export interface LaterInputs {
  readonly counts: CountBag;
  readonly data: ComparisonData & { top20Changes: readonly Top20Change[] };
  readonly countsByRule?: CountsByRuleArg;
}

export function laterFor({ counts: c, data, countsByRule }: LaterInputs) {
  const trust = findPair(data.pairwise, "additive_u", "additive_no_u")
    ? `${urgencyReassurance(data)} ${TRUST_TAIL}`
    : null;
  const example = howExampleSegments(data, c, countsByRule);
  return Object.freeze({
    GUIDE,
    GUIDE_SEGMENTS,
    GLOSSARY_GROUPS,
    HOW_IT_WORKS: buildHow(c, example === null ? null : textOf(example)),
    /** The worked example in How this works, with each school name marked, or null when the data holds none. */
    howExample: example,
    FIRST_QUESTIONS: buildQuestions(buildIdeas(c), trust),
  });
}

/** What the screen loads on demand. */
export type LaterCopy = ReturnType<typeof laterFor>;
