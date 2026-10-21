/**
 * The seed views, chosen from the loaded data by role (notes/final.md, R13), never by name or id: the top of the list
 * under the paper's main rule, the two main rules with and without urgency, the first school with possible places,
 * and the incomplete records grouped by what is missing. A seed whose subject the data lacks is not offered.
 */
import { DEFAULT_RULE, PROPOSED_RULE } from "../copy";
import type { Roles } from "../guide/roles";

import type { Seeds } from "./views";

const query = (pairs: Record<string, string>) => new URLSearchParams(pairs).toString();

export function seedsOf(roles: Roles, proposed: boolean): Seeds {
  const seeds: { -readonly [K in keyof Seeds]: Seeds[K] } = {};
  if (roles.complete.length > 0) {
    seeds.top = query({ rule: DEFAULT_RULE });
    // The proposed revision is compared over the schools with every input recorded, as guide 5 is.
    if (proposed) seeds.urgency = query({ rule: PROPOSED_RULE, compare: DEFAULT_RULE });
  }
  const range = roles.ranges[0];
  if (range) seeds.range = query({ school: range.id });
  if (roles.incomplete.length > 0) seeds.queue = query({ view: "queue", qgroup: "evidence" });
  return seeds;
}
