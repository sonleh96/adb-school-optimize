/**
 * The seed views, chosen from the loaded data by role (notes/final.md, R13), never by name or id: the top of the list
 * under the paper's main rule, the main rule with and without urgency, the first school with possible places,
 * and the incomplete records grouped by what is missing. A seed whose subject the data lacks is not offered.
 */
import type { Roles } from "../guide/roles";
import { PRIMARY_RULE, SENSITIVITY_RULE } from "../rule-pair";

import type { Seeds } from "./views";

const query = (pairs: Record<string, string>) => new URLSearchParams(pairs).toString();

export function seedsOf(roles: Roles, urgencyRule: boolean): Seeds {
  const seeds: { -readonly [K in keyof Seeds]: Seeds[K] } = {};
  if (roles.complete.length > 0) {
    seeds.top = query({ rule: PRIMARY_RULE });
    // The main rule, compared with the rule that puts the urgency value back over the schools with every input
    // recorded, as the statement's link and guide 5 show it.
    if (urgencyRule) seeds.urgency = query({ rule: PRIMARY_RULE, compare: SENSITIVITY_RULE });
  }
  const range = roles.ranges[0];
  if (range) seeds.range = query({ school: range.id });
  if (roles.incomplete.length > 0) seeds.queue = query({ view: "queue", qgroup: "evidence" });
  return seeds;
}
