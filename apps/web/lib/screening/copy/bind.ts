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

import {
  countsByRuleFromResults,
  countsFromResults,
  pairwiseFromCompare,
  schoolsFromLists,
  standardErrorFromResults,
} from "./adapter";
import { type BoundCopy, copyFor } from "./bound";
import type { CopyRuleId, CopySchool } from "./model";
import { isCopyRuleId } from "./rules";

export interface CopyResponses {
  /** The rule the screen shows. */
  readonly view: CopyRuleId;
  /** The bulk stored inputs of the input version the lists are of. */
  readonly inputs: InputsResponse;
  /**
   * The unfiltered list of every rule the screen compares, and of the shown rule. Include both combined-factors
   * lists for the reasons that name what each input adds, and the circulated rule's for the persistence flag.
   */
  readonly lists: readonly ResultsResponse[];
  /** The recorded comparison of the two rules the screen compares, if it shows one. */
  readonly compare?: CompareResponse;
}

export interface BoundRecords {
  readonly copy: BoundCopy;
  /** The shown rule's list, one full record per row. */
  readonly schools: readonly CopySchool[];
}

export function bindCopy(responses: CopyResponses): BoundRecords {
  const { view, inputs, lists, compare } = responses;
  const shown = lists.find((l) => l.run.rule_id === view);
  if (!shown) throw new ParseError(`lists: there is no list for ${view}`);
  for (const l of lists)
    if (!isCopyRuleId(l.run.rule_id))
      throw new ParseError(`lists: the copy has no words for the rule ${JSON.stringify(l.run.rule_id)}`);
  const schools = schoolsFromLists(inputs, lists, view);
  const circulated = lists.find((l) => l.run.rule_id === "additive_u");
  return {
    schools,
    copy: copyFor({
      schools,
      counts: countsFromResults(shown, schools),
      countsByRule: countsByRuleFromResults(...lists),
      standardError: circulated ? standardErrorFromResults(circulated) : undefined,
      ...(compare ? pairwiseFromCompare(compare) : {}),
    }),
  };
}
