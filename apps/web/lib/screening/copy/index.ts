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
  schoolsFromLists,
  standardErrorFromResults,
  type ListedSchool,
} from "./adapter";
export { bindCopy, type BoundRecords, type CopyResponses } from "./bind";
export { copyFor, type BoundCopy, type CopyData } from "./bound";
export { countsFrom, groupsSentence, urgencyDefinition } from "./counts";
export { buildIdeas, IDEAS } from "./ideas";
export { cleanName, displayName, formatApprox, formatCount, formatPercent, ordinal } from "./format";
export {
  comparisonSegments,
  comparisonSentence,
  defaultListStatement,
  defaultListStatementLong,
  urgencyReassurance,
} from "./compare";
export {
  missingGroupLabel,
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
  listStartsSegments,
  listStartsSentence,
  locationLine,
  persistenceNote,
  placeContext,
  placeHeadline,
  provinceHeading,
  rangeComparisonSegments,
  rangeComparisonSentence,
  rankSegments,
  rankSentence,
  rowPlace,
  scopesMix,
  tieNote,
  tieNoteSegments,
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
export { buildTerms, term, TERMS, type TermKey } from "./terms";
export { HELP, KEYS, LAYOUT, removeViewSegments, savedViewSegments } from "./words";
export {
  isName,
  joinSegments,
  listSegments,
  nameList,
  nameSegment,
  namesIn,
  seg,
  spansOf,
  textOf,
  type NameKind,
  type NameSegment,
  type NameSpan,
  type Segment,
  type Segments,
} from "./segments";
