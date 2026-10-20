/**
 * The plain-language copy system: a typed port of the design prototype's `copy.js`, with an adapter from the
 * screening API's responses. Bind the data once with `copyFor`, then pass the bound object down.
 */
export {
  countsByRuleFromResults,
  countsFromResults,
  pairwiseFromCompare,
  placedFromResults,
  schoolFromDetail,
  type ListedSchool,
} from "./adapter";
export { BANNED } from "./banned";
export { copyFor, type BoundCopy, type CopyData } from "./bound";
export { countsFrom, groupsSentence, urgencyDefinition } from "./counts";
export { buildHow, buildQuestions, FIRST_QUESTIONS, HOW_IT_WORKS } from "./explainer";
export { GUIDE } from "./guide";
export { buildIdeas, IDEAS } from "./ideas";
export { cleanName, displayName, formatApprox, formatCount, formatPercent, ordinal } from "./format";
export {
  comparisonSentence,
  defaultListStatement,
  defaultListStatementLong,
  urgencyReassurance,
} from "./compare";
export {
  missingLabels,
  missingSentence,
  missingSentences,
  missingValueKind,
  missingValueNote,
  type MissingValueKind,
} from "./missing";
export type * from "./model";
export {
  distinctName,
  fullRankingSentence,
  listStartsSentence,
  locationLine,
  placeContext,
  placeHeadline,
  rangeComparisonSentence,
  rankSentence,
  tieNote,
  type PlaceOpts,
} from "./rank";
export {
  contributions,
  INPUT_KEYS,
  inputSentence,
  reasonSentence,
  topDrivers,
  type Contribution,
  type Driver,
} from "./reasons";
export {
  DEFAULT_RULE,
  isCopyRuleId,
  PROPOSED_RULE,
  RULE_IDS,
  ruleExplanation,
  ruleLabel,
  ruleName,
  ruleOneLine,
  ruleRelation,
  ruleRole,
  ruleRoleLine,
  ruleShortName,
  ruleSource,
  ruleSymbol,
  ruleUsesUrgency,
  shareSentence,
  urgencyNote,
  type FactorKey,
} from "./rules";
export { buildStrings, STRINGS } from "./strings";
export { buildTerms, GLOSSARY_GROUPS, term, TERMS, type TermKey } from "./terms";
export { HELP, KEYS, LAYOUT } from "./words";
export {
  wireCompare,
  wireResults,
  wireSchoolDetail,
  type WireCompare,
  type WireResults,
  type WireSchoolDetail,
} from "./wire";
