/**
 * Teaching schools: the schools the guides and help cards use as examples, chosen from the loaded data by the role
 * they play, never by name or id (robustness R13). The repository is public and the data changes, so no school is
 * written into the code, and a guide whose example does not exist in the data is not offered at all.
 *
 * Roles are read under the paper's main rule, the rule without urgency that the screen opens on and whose list the
 * workspace always loads, so they do not change when the screen shows another rule. Ties go to the earlier place, then to the name, so the choice is the same every load.
 */
import type { BoundCopy, CopySchool, InputKey, NeedKey } from "../copy";
import { PRIMARY_RULE } from "../rule-pair";

import type { Catalog, GuideId } from "./machine";

const MAIN = PRIMARY_RULE;
const NEED_KEYS: readonly NeedKey[] = ["classrooms", "housing", "facilities", "services", "locality"];
const NEED_GATES = [
  "permanent_classroom_deficit",
  "teacher_housing_deficit",
  "facility_presence_deficit",
  "service_deficit",
] as const;

/** The copy functions roles read: they take no counts, so they are the same in every binding. */
export type RoleReads = Pick<BoundCopy, "topDrivers" | "missingValueKind" | "displayName">;

export interface Roles {
  /** Schools with every input recorded, in their order under the paper's main rule. */
  readonly complete: readonly CopySchool[];
  /** Schools that show a range, by their best possible place. */
  readonly ranges: readonly CopySchool[];
  /** Schools with incomplete records, by province, district and name. */
  readonly incomplete: readonly CopySchool[];
  /** The first school whose main reasons include a part of school need: the example of a reason in the card. */
  readonly reasons: CopySchool | null;
  /** The first incomplete record that holds a recorded 0, else a blank: the example of what is missing. */
  readonly missing: CopySchool | null;
}

const placeOf = (s: CopySchool) => s.results?.[MAIN]?.rank_complete120;
const bestOf = (s: CopySchool) => s.results?.[MAIN]?.rank_best;
const worstOf = (s: CopySchool) => s.results?.[MAIN]?.rank_worst;
const isInt = (v: unknown): v is number => Number.isInteger(v);

/** The number of parts of school need among a school's main reasons under a rule. */
export function needReasons(copy: Pick<BoundCopy, "topDrivers">, school: CopySchool, rule: string): number {
  if (school.cohort === "queue") return 0;
  const drivers = copy.topDrivers(school, rule as never) as readonly { key: InputKey }[];
  return drivers.filter((d) => (NEED_KEYS as readonly string[]).includes(d.key)).length;
}

/** The roles in the loaded data, or null while the paper's main rule's list has not loaded. */
export function rolesOf(schools: readonly CopySchool[], copy: RoleReads): Roles | null {
  if (!schools.some((s) => s.results?.[MAIN])) return null;
  const name = (s: CopySchool) => copy.displayName(s);
  const complete = schools
    .filter((s) => isInt(placeOf(s)))
    .sort((a, b) => placeOf(a)! - placeOf(b)! || name(a).localeCompare(name(b)));
  const ranges = schools
    .filter((s) => !isInt(placeOf(s)) && isInt(bestOf(s)) && isInt(worstOf(s)))
    .sort((a, b) => bestOf(a)! - bestOf(b)! || worstOf(a)! - worstOf(b)! || name(a).localeCompare(name(b)));
  const text = (v: string | null) => (v ?? "").trim();
  const incomplete = schools
    .filter((s) => !s.results?.[MAIN])
    .sort(
      (a, b) =>
        text(a.province).localeCompare(text(b.province)) ||
        text(a.district).localeCompare(text(b.district)) ||
        name(a).localeCompare(name(b))
    );
  const kindIn = (s: CopySchool, kind: string) =>
    NEED_KEYS.some((key) => copy.missingValueKind(s, key) === kind);
  return {
    complete,
    ranges,
    incomplete,
    reasons: complete.find((s) => needReasons(copy, s, MAIN) > 0) ?? null,
    missing:
      incomplete.find((s) => kindIn(s, "unusable")) ??
      incomplete.find((s) => kindIn(s, "blank")) ??
      incomplete[0] ??
      null,
  };
}

/** The schools of a role, without the one the school card already shows, so a help card never repeats it. */
export const besides = (candidates: readonly CopySchool[], open: string | null): CopySchool | null =>
  candidates.find((s) => s.id !== open) ?? candidates[0] ?? null;

/** Which incomplete records lack every part of school need but remoteness. */
export const onlyRemoteness = (s: CopySchool): boolean =>
  NEED_GATES.every((gate) => s.gate_failures.includes(gate));

/* ------------------------------------------------------------------ the guides the data can teach */

/** What the build offers beside the data: the export arrives with the method details. */
export interface Features {
  /** "Download the top list" is on screen. */
  readonly export: boolean;
  /** The API offers the circulated rule with urgency, so the urgency guide can compare the main rule with it. */
  readonly urgencyRule: boolean;
  /** The incomplete records can be grouped by what is missing. */
  readonly grouping: boolean;
}

/** Each guide's steps, by key, as the data and the build allow them. */
export type Plan = Readonly<Partial<Record<GuideId, readonly string[]>>>;

export function planOf(roles: Roles, features: Features): Plan {
  const plan: Partial<Record<GuideId, readonly string[]>> = {};
  if (roles.complete.length > 0) plan.q1 = ["first", "rule", "map", ...(features.export ? ["download"] : [])];
  // Guide 2 needs a school whose reasons include school need for its middle step; without one it still explains
  // the card's reasons and the inputs.
  if (roles.complete.length > 0) plan.q2 = roles.reasons ? ["why", "need", "adds"] : ["why", "adds"];
  if (roles.ranges.length > 0) plan.q3 = ["range", "order", "map"];
  if (roles.incomplete.length > 0) plan.q4 = ["list", ...(features.grouping ? ["group"] : []), "school"];
  if (features.urgencyRule && roles.complete.length > 0)
    plan.q5 = ["agree", "why", ...(roles.ranges.length > 0 ? ["ranges"] : []), "use"];
  return plan;
}

export const catalogOf = (plan: Plan): Catalog =>
  (["q1", "q2", "q3", "q4", "q5"] as const).flatMap((id) =>
    plan[id] ? [{ id, steps: plan[id]!.length }] : []
  );
