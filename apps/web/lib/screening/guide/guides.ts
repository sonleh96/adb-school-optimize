/**
 * The five guides, step by step: what each step says, the workspace state it sets, and the regions its ring points
 * at. Every word is the copy system's (the guide copy, loaded with `later()`, and the bound copy); every school a step
 * names is a teaching school chosen by role (roles.ts), or the school the person selected when the step follows the
 * selection.
 *
 * A step sets the whole state that matters to it, from the same base, so Back, Next and a pasted link land on the
 * same screen. Rings point at `data-region` hooks the workspace exposes; nothing here reaches into its markup to act.
 */
import {
  type BoundCopy,
  type CopyRuleId,
  type CopySchool,
  DEFAULT_RULE,
  PROPOSED_RULE,
  type Segments,
} from "../copy";
import type { LaterCopy } from "../copy/later";
import { DEFAULT_STATE, type Patch, type StateKey } from "../workspace/state";

import type { GuideId } from "./machine";
import { type Plan, type Roles, needReasons } from "./roles";

/** A paragraph of a step: a sentence with names marked, and an optional lead set in medium weight. */
export interface Paragraph {
  readonly lead?: string;
  readonly text: Segments;
}

/** One step as the rail shows it, for one subject. */
export interface StepView {
  readonly key: string;
  readonly title: Segments;
  readonly body: readonly Paragraph[];
  readonly onScreen: string;
  readonly tryIt: Segments | null;
  /** The workspace state the step sets, on top of `BASE`. */
  readonly patch: Patch;
  /** Groups of selectors; each group is one ring round the union of its elements. */
  readonly targets: readonly (readonly string[])[];
  /** What to scroll when the step lands: the list to its top, the card to its top, or the target into view. */
  readonly scroll: "top" | "card" | "target" | null;
  /** The step points at the map, so the narrow layout shows the map band and a one-line guide bar. */
  readonly onMap: boolean;
}

export interface GuideView {
  readonly id: GuideId;
  readonly title: string;
  readonly sub: string;
  readonly steps: readonly string[];
}

export interface GuideContext {
  readonly copy: BoundCopy;
  readonly later: LaterCopy;
  /** The rule on screen. */
  readonly rule: CopyRuleId;
  /** The records of the list on screen. */
  readonly schools: readonly CopySchool[];
  /** The list's own order: the schools that can be put in order, as the rows show them. */
  readonly ordered: readonly string[];
  readonly roles: Roles;
  readonly plan: Plan;
  /** The largest top k the two main rules agree on, from the recorded comparison; null when it is not known. */
  readonly agreeK: number | null;
  /** The school What changed uses as its example between the two main rules. */
  readonly example: CopySchool | null;
  /** The incomplete records can be filtered by what is missing (a method-details control). */
  readonly filters: boolean;
}

/** The state every step starts from: the paper's main rule, the list, nothing selected, nothing compared. */
/**
 * The state every step starts from, and the one list of keys a step owns: a step sets each of them, and a change
 * to any of them later means the screen has moved on from the step. It names every key of the workspace's state, so
 * a key the workspace gains (the method details' `analyst`, `mode`, `panel` and the rest) fails the typecheck here
 * until it is given its starting value.
 */
export const BASE: { readonly [K in StateKey]: Patch[K] } = Object.freeze({
  rule: DEFAULT_RULE,
  compare: null,
  view: "ranked",
  school: null,
  hover: null,
  qgroup: "province",
  place: "lower",
  scope: false,
  // The method details are off, so a step shows the plain screen with nothing open.
  analyst: false,
  mode: "screen",
  k: 20,
  panel: null,
  n: 20,
  prov: null,
  loc: null,
  formula: false,
  parts: false,
  hide: DEFAULT_STATE.hide,
  pop: null,
});

/** The keys a step owns, in `BASE`'s order. */
export const STEP_KEYS = Object.keys(BASE) as StateKey[];

const text = (value: string): Segments => [value];
const para = (value: string | Segments, lead?: string): Paragraph => ({
  text: typeof value === "string" ? text(value) : value,
  ...(lead ? { lead } : {}),
});
const row = (key: string) => `[data-school-key="${key.replace(/["\\]/g, "\\$&")}"]`;
const region = (name: string) => `[data-region="${name}"]`;
const CARD = [region("inspector-place"), region("inspector-why")];
const firstSentences = (value: string, n: number) =>
  value
    .split(/(?<=\.) /)
    .slice(0, n)
    .join(" ");

/** The guide copy for one step, read loosely: its title and lines are strings or functions of the data. */
interface StepCopy {
  readonly key: string;
  readonly title: unknown;
  readonly onScreen: string;
  readonly body?: unknown;
  readonly tryIt?: unknown;
}
function stepCopy(later: LaterCopy, guide: GuideId, key: string): StepCopy {
  const task = later.GUIDE.tasks.find((t) => t.id === guide);
  const step = (task?.steps as readonly StepCopy[] | undefined)?.find((s) => s.key === key);
  if (!step) throw new Error(`The guide copy has no step ${guide}.${key}`);
  return step;
}
const call = <T>(value: unknown, ...args: unknown[]): T =>
  (typeof value === "function" ? (value as (...a: unknown[]) => T)(...args) : value) as T;

/** The guides the data can teach, in order, with their titles. */
export function guidesOf(ctx: Pick<GuideContext, "later" | "plan">): GuideView[] {
  return ctx.later.GUIDE.tasks.flatMap((task) => {
    const steps = ctx.plan[task.id as GuideId];
    return steps ? [{ id: task.id as GuideId, title: task.title, sub: task.sub, steps }] : [];
  });
}

/** The guide's own example school, before the person selects another. */
export function subjectOf(ctx: GuideContext, guide: GuideId): CopySchool | null {
  const { roles } = ctx;
  switch (guide) {
    case "q1":
      return null;
    case "q2":
      return roles.reasons ?? roles.complete[0] ?? null;
    case "q3":
      return roles.ranges[0] ?? null;
    case "q4":
      return roles.missing;
    case "q5":
      return ctx.example;
  }
}

/** Whether a step follows the school the person selects, and which schools it can follow. */
export function follows(ctx: GuideContext, guide: GuideId, key: string, school: CopySchool): boolean {
  switch (`${guide}.${key}`) {
    case "q2.why":
      return true;
    case "q2.need":
      return school.cohort === "complete" && needReasons(ctx.copy, school, ctx.rule) > 0;
    case "q2.adds":
      return school.cohort !== "queue";
    case "q3.range":
    case "q3.order":
    case "q3.map":
      return school.cohort === "interval";
    case "q4.school":
      return school.cohort === "queue";
    default:
      return false;
  }
}

/** A school's place under the rule on screen, in the words a step title uses, or null when it has none. */
function placeWords(ctx: GuideContext, school: CopySchool): string | null {
  const r = school.results?.[ctx.rule];
  if (!r || school.cohort === "queue") return null;
  if (Number.isInteger(r.rank_complete120)) return ctx.copy.ordinal(r.rank_complete120!);
  if (Number.isInteger(r.rank_best) && Number.isInteger(r.rank_worst))
    return ctx.later.GUIDE.rangeWords(r.rank_best!, r.rank_worst!);
  return null;
}

/** The two schools with every input recorded either side of a range school in the list on screen. */
function neighbours(ctx: GuideContext, school: CopySchool): [CopySchool, CopySchool] | null {
  const byId = new Map(ctx.schools.map((s) => [s.id, s]));
  const rows = ctx.ordered.map((id) => byId.get(id)).filter((s): s is CopySchool => !!s);
  const at = rows.findIndex((s) => s.id === school.id);
  if (at < 0) return null;
  const placed = (s: CopySchool) =>
    s.cohort === "complete" && Number.isInteger(s.results?.[ctx.rule]?.rank_complete120);
  const up = rows.slice(0, at).reverse().find(placed);
  const down = rows.slice(at + 1).find(placed);
  return up && down ? [up, down] : null;
}

/** The step `key` of `guide`, worded for `subject` (the school it follows, or its own example). */
export function stepView(
  ctx: GuideContext,
  guide: GuideId,
  key: string,
  subject: CopySchool | null
): StepView {
  const { copy, later, rule, roles } = ctx;
  const { GUIDE, GUIDE_SEGMENTS } = later;
  const { TERMS, STRINGS, IDEAS } = copy;
  const sc = stepCopy(later, guide, key);
  const name = subject ? copy.distinctName(subject) : "";
  const drivers = subject && subject.cohort !== "queue" ? copy.topDrivers(subject, rule).length : 0;
  const base = {
    key,
    onScreen: sc.onScreen,
    tryIt: typeof sc.tryIt === "string" ? text(sc.tryIt) : null,
    patch: {},
    scroll: null,
    onMap: false,
  } as const;
  const staticTitle = typeof sc.title === "string" ? text(sc.title) : text("");
  const id = `${guide}.${key}`;
  switch (id) {
    case "q1.first": {
      const firstThree = ctx.ordered
        .map((sid) => ctx.schools.find((s) => s.id === sid))
        .filter((s): s is CopySchool => !!s && s.cohort === "complete")
        .slice(0, 3);
      return {
        ...base,
        title: staticTitle,
        body: [para(copy.segments.listStartsSentence(ctx.schools, rule, 3)), para(IDEAS.notVerdict.short)],
        targets: [firstThree.map((s) => row(s.id))],
        scroll: "top",
      };
    }
    case "q1.rule":
      return {
        ...base,
        title: staticTitle,
        body: [para(TERMS.rule.line), para(copy.ruleExplanation(rule))],
        targets: [[region("rule-identity")]],
        scroll: "top",
      };
    case "q1.map":
      return {
        ...base,
        title: staticTitle,
        body: [para(call<string>(sc.body))],
        patch: roles.complete[0] ? { hover: roles.complete[0].id } : {},
        targets: [[region("legend")]],
        onMap: true,
      };
    case "q1.download":
      return {
        ...base,
        title: staticTitle,
        body: [para(TERMS.export.line), para(TERMS.shortlist_size.help), para(TERMS.manifest.line)],
        // The narrow layout keeps Download the top list in its menu; a ring takes in whichever of the two shows.
        targets: [[region("export-button"), '[aria-controls="screening-menu"]']],
      };
    case "q2.why":
      return {
        ...base,
        title: subject ? GUIDE_SEGMENTS.whyTitle(name, placeWords(ctx, subject)) : staticTitle,
        body: [
          para(subject?.cohort === "queue" ? GUIDE.pointToMissing : GUIDE.pointToCard(drivers)),
          para(IDEAS.notVerdict.short),
        ],
        patch: subject ? { school: subject.id, view: subject.cohort === "queue" ? "queue" : "ranked" } : {},
        targets: [CARD],
        scroll: "card",
      };
    case "q2.need": {
      const n = subject ? needReasons(copy, subject, rule) : 0;
      return {
        ...base,
        title: text(call<string>(sc.title, n > 0)),
        body: [para(STRINGS.schoolNeedDefinition), ...(n > 0 ? [para(GUIDE.needNumbered(n, drivers))] : [])],
        patch: subject ? { school: subject.id } : {},
        targets: [[region("need-box")]],
        scroll: "target",
      };
    }
    case "q2.adds":
      return {
        ...base,
        title: staticTitle,
        body: [para(copy.shareSentence(rule, "N")), para(copy.shareSentence(rule, "A"))],
        patch: subject ? { school: subject.id } : {},
        targets: [[region("inspector-breakdown")]],
        scroll: "target",
      };
    case "q3.range": {
      const names = roles.ranges.map((s) => copy.distinctName(s));
      return {
        ...base,
        title: subject ? GUIDE_SEGMENTS.rangeTitle(name, placeWords(ctx, subject)) : staticTitle,
        body: [para(IDEAS.ranges.short), para(call<string>(sc.body))],
        tryIt: names.length > 0 ? GUIDE_SEGMENTS.rangeTryIt(names, names.length) : null,
        patch: subject ? { school: subject.id } : {},
        targets: [CARD],
        scroll: "card",
      };
    }
    case "q3.order": {
      const near = subject ? neighbours(ctx, subject) : null;
      const place = (s: CopySchool) => copy.ordinal(s.results![rule]!.rank_complete120!);
      return {
        ...base,
        title: staticTitle,
        body: [
          ...(near && subject
            ? [
                para(
                  GUIDE_SEGMENTS.orderBody(
                    name,
                    copy.distinctName(near[0]),
                    place(near[0]),
                    copy.distinctName(near[1]),
                    place(near[1])
                  )
                ),
              ]
            : []),
          para(TERMS.list_order.help),
        ],
        // The row, not the card: an open card can make the list step aside, and this step points at the list.
        patch: subject ? { hover: subject.id } : {},
        targets: [subject ? [region("list-order"), row(subject.id)] : [region("list-order")]],
        scroll: "target",
      };
    }
    case "q3.map":
      return {
        ...base,
        title: staticTitle,
        body: subject ? [para(GUIDE_SEGMENTS.mapBody(name))] : [],
        patch: subject ? { hover: subject.id } : {},
        targets: [[region("legend-range")]],
        onMap: true,
      };
    case "q4.list": {
      const count = copy.counts.queue ?? roles.incomplete.length;
      return {
        ...base,
        title: text(call<string>(sc.title, count)),
        body: [para(firstSentences(TERMS.queue.help, 2))],
        patch: { view: "queue" },
        targets: [[region("queue-tab")], [region("queue-list")]],
        scroll: "top",
      };
    }
    case "q4.group": {
      const term = (k: "missing_all_but_remoteness" | "missing_classrooms") =>
        para(`${TERMS[k].line} ${TERMS[k].help}`, TERMS[k].label);
      return {
        ...base,
        title: staticTitle,
        body: [term("missing_all_but_remoteness"), term("missing_classrooms")],
        // Its Try it is about the filter by what is missing, which arrives with the method details.
        tryIt: ctx.filters ? base.tryIt : null,
        patch: { view: "queue", qgroup: "evidence" },
        // Group by in the column (the card names its own chips `queue-missing` too), then the first group.
        targets: [
          [`[data-slot="column"] ${region("queue-missing")}`],
          [`${region("queue-list")} > li:first-child`],
        ],
        scroll: "top",
      };
    }
    case "q4.school":
      return {
        ...base,
        title: subject ? GUIDE_SEGMENTS.schoolTitle(name) : staticTitle,
        body: [para(GUIDE.pointToMissing)],
        patch: subject ? { view: "queue", school: subject.id } : { view: "queue" },
        targets: [CARD],
        scroll: "card",
      };
    case "q5.agree":
      return {
        ...base,
        title: text(call<string>(sc.title, ctx.agreeK)),
        body: [para(STRINGS.urgencyDefinition), para(call<string>(sc.body))],
        patch: { rule: PROPOSED_RULE, compare: DEFAULT_RULE },
        targets: [[region("changed-lead")]],
        scroll: "top",
      };
    case "q5.why":
      return {
        ...base,
        title: staticTitle,
        body: [para(TERMS.urgency.help)],
        patch: { rule: PROPOSED_RULE, compare: DEFAULT_RULE },
        targets: [[region("rule-switch")]],
        scroll: "top",
      };
    case "q5.ranges": {
      const limits = later.HOW_IT_WORKS.find((s) => s.key === "limits")?.sentences ?? [];
      return {
        ...base,
        title: staticTitle,
        body: [
          ...(limits[2] ? [para(limits[2])] : []),
          ...(subject ? [para(GUIDE_SEGMENTS.rangesBody(name))] : []),
        ],
        patch: { rule: PROPOSED_RULE, compare: DEFAULT_RULE },
        targets: [[region("changed-example")]],
        scroll: "top",
      };
    }
    case "q5.use":
      return {
        ...base,
        title: staticTitle,
        body: [para(copy.ruleExplanation(PROPOSED_RULE))],
        tryIt: text(call<string>(sc.tryIt, copy.ruleLabel(DEFAULT_RULE))),
        patch: { rule: PROPOSED_RULE, compare: DEFAULT_RULE },
        targets: [[region("rule-switch")]],
        scroll: "top",
      };
    default:
      throw new Error(`No guide step ${id}`);
  }
}

/** A step's title as plain text, for the live region and Up next. */
export const plainTitle = (view: Pick<StepView, "title">): string =>
  view.title.map((s) => (typeof s === "string" ? s : s.name)).join("");
