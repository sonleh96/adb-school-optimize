/**
 * The one way to bind the copy to the API's responses. Give it the parsed responses the screen already holds and it
 * builds the whole records, the counts of the rule shown, the group sizes of every rule, the recorded comparison and
 * the persistence margin, and binds `copyFor` to them at one boundary. Pass the result down; nothing below this
 * boundary should read a count from anywhere else.
 *
 * Why not call `copyFor` directly: the groups differ between rules (a rule that leaves urgency out can put more
 * schools in order), so a sentence that puts one school under two rules must count each rule's own group. This
 * function takes them from the lists, and `copyFor` refuses counts that come with several rules' results but
 * without them.
 */
import { ParseError } from "../schema";
import type { CompareResponse, InputsResponse, ResultsResponse } from "../types";

import { countsFrom } from "./counts";
import {
  PERSISTENCE_RULES,
  countsByRuleFromResults,
  countsFromResults,
  pairwiseFromCompare,
  schoolsFromLists,
  marginFromResults,
  testFromResults,
} from "./adapter";
import { type BoundCopy, copyFor } from "./bound";
import type { CopyRuleId, CopySchool } from "./model";
import { type RuleNames, isCopyRuleId } from "./rules";

export interface CopyResponses {
  /** The rule the screen shows. */
  readonly view: CopyRuleId;
  /** The bulk stored inputs of the input version the lists are of. */
  readonly inputs: InputsResponse;
  /**
   * The unfiltered list of every rule the screen compares, and of the shown rule. Include both combined-factors
   * lists for the reasons that name what each input adds, and the list of each rule the stochastic test ran for
   * (`additive_no_u`, `additive_u`) for its persistence flag.
   */
  readonly lists: readonly ResultsResponse[];
  /** The recorded comparison of the two rules the screen compares, if it shows one. */
  readonly compare?: CompareResponse;
  /** How the sentences name a rule: with its letter (the default) or in plain words. See `CopyData`. */
  readonly ruleNames?: RuleNames;
}

export interface BoundRecords {
  readonly copy: BoundCopy;
  /** The shown rule's list, one full record per row. */
  readonly schools: readonly CopySchool[];
}

export function bindCopy(responses: CopyResponses): BoundRecords {
  const { view, inputs, lists, compare, ruleNames } = responses;
  const shown = lists.find((l) => l.run.rule_id === view);
  if (!shown) throw new ParseError(`lists: there is no list for ${view}`);
  for (const l of lists)
    if (!isCopyRuleId(l.run.rule_id))
      throw new ParseError(`lists: the copy has no words for the rule ${JSON.stringify(l.run.rule_id)}`);
  const schools = schoolsFromLists(inputs, lists, view);
  // Each rule the stochastic test ran for has its own margin, from its own list.
  const margins = Object.fromEntries(
    lists.flatMap((l) => {
      const margin = marginFromResults(l);
      return margin === undefined ? [] : [[l.run.rule_id, margin]];
    })
  );
  // The group sizes of every rule's own run, and for each rule the stochastic test ran for, how many schools its own
  // test flags (when every school has a flag under it), so each rule's help states its own count.
  const countsByRule = countsByRuleFromResults(...lists);
  for (const id of PERSISTENCE_RULES) {
    if (countsByRule[id] && schools.length > 0 && schools.every((s) => s.persistence?.[id] !== undefined))
      countsByRule[id] = { ...countsByRule[id], flagged: countsFrom(schools, id).flagged as number };
  }
  // How each rule's test was drawn, for the method details' words.
  const tests = Object.fromEntries(
    lists.flatMap((l) => {
      const test = testFromResults(l);
      return test === undefined ? [] : [[l.run.rule_id, test]];
    })
  );
  return {
    schools,
    copy: copyFor({
      schools,
      counts: countsFromResults(shown, schools),
      countsByRule,
      margins,
      tests,
      ruleNames,
      ...(compare ? pairwiseFromCompare(compare) : {}),
    }),
  };
}
