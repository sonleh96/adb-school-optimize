/**
 * A saved view as a rail step, with the same anatomy as a guide's (notes/final.md, "Saved view step"): its title,
 * what it says, its "On screen" line, the regions its rings point at, and the whole workspace state it sets.
 *
 * Every word is the copy's. The seeds borrow two lines from the guides, as copy round 6 maps them: the urgency seed's
 * "On screen" line is guide 5's first step's, and the range seed's line and body are guide 3's first step's. A view a
 * person saved says its rule ("Rule: {label}. {role line}.", glue the copy round names) and, with a school open, what
 * the card shows.
 */
import { type BoundCopy, type CopyRuleId, type CopySchool, type Segments, savedViewSegments } from "../copy";
import type { LaterCopy } from "../copy/later";
import type { GuideId } from "../guide/machine";
import type { Paragraph, StepView } from "../guide/guides";
import { type Known, type StateKey, shownRule, stateFromSearch } from "../workspace/state";

import { droppedKeys } from "./pack";
import type { SavedView } from "./views";

export interface ViewContext {
  readonly copy: BoundCopy;
  readonly later: LaterCopy;
  /** What the loaded data holds, so a view's state is read as the workspace reads a link. */
  readonly known: Known;
  readonly schools: readonly CopySchool[];
  /** The list's own order, as the rows show it. */
  readonly ordered: readonly string[];
}

const region = (name: string) => `[data-region="${name}"]`;
const row = (key: string) => `[data-school-key="${key.replace(/["\\]/g, "\\$&")}"]`;
const CARD = [region("inspector-place"), region("inspector-why")];
const para = (text: string): Paragraph => ({ text: [text] });
const firstSentences = (value: string, n: number) =>
  value
    .split(/(?<=\.) /)
    .slice(0, n)
    .join(" ");

/** A guide step's copy, read loosely, for the lines the seeds borrow. */
function guideLine(later: LaterCopy, guide: GuideId, key: string, field: "onScreen" | "body"): string {
  const task = later.GUIDE.tasks.find((t) => t.id === guide);
  const step = (task?.steps as readonly Record<string, unknown>[] | undefined)?.find((s) => s.key === key);
  const value = step?.[field];
  return typeof value === "function" ? String((value as () => unknown)()) : String(value ?? "");
}

/** A view's name: a seed's from the copy, or the person's own, marked as a name. */
export function viewTitle(later: LaterCopy, view: SavedView): Segments {
  return view.seed ? [later.GUIDE.seedViews[view.seed].name] : savedViewSegments(view.name ?? "");
}

export const plainViewTitle = (later: LaterCopy, view: SavedView): string =>
  viewTitle(later, view)
    .map((s) => (typeof s === "string" ? s : s.name))
    .join("");

/** A saved view's step: a guide step's anatomy, and what its stored state named that the data no longer holds. */
export interface ViewStep extends StepView {
  readonly dropped: readonly StateKey[];
}

export function viewStep(ctx: ViewContext, view: SavedView): ViewStep {
  const { copy, later, known } = ctx;
  const { GUIDE } = later;
  const { TERMS, IDEAS } = copy;
  const state = stateFromSearch(view.q, known);
  // The API's rule ids are the copy's; the workspace reads only ids the API listed.
  const rule = shownRule(state, known) as CopyRuleId;
  const ruleLine = para(`${TERMS.rule.label}: ${copy.ruleLabel(rule)}. ${copy.ruleRoleLine(rule)}.`);
  const base = {
    key: view.id,
    title: viewTitle(later, view),
    tryIt: null,
    // The whole state, so every key lands where the view was saved and nothing from the screen before stays.
    patch: state,
    onMap: false,
    dropped: droppedKeys(view.q, known),
  } as const;
  switch (view.seed) {
    case "top": {
      const firstThree = ctx.ordered
        .map((id) => ctx.schools.find((s) => s.id === id))
        .filter((s): s is CopySchool => !!s && s.cohort === "complete")
        .slice(0, 3);
      return {
        ...base,
        body: [para(IDEAS.notVerdict.short), ruleLine],
        onScreen: GUIDE.seedViews.top.onScreen,
        targets: firstThree.length ? [firstThree.map((s) => row(s.id))] : [],
        scroll: "top",
      };
    }
    case "urgency":
      return {
        ...base,
        body: [para(TERMS.urgency.line), para(guideLine(later, "q5", "agree", "body"))],
        onScreen: guideLine(later, "q5", "agree", "onScreen"),
        targets: [[region("changed-lead")]],
        scroll: "top",
      };
    case "range":
      return {
        ...base,
        body: [para(IDEAS.ranges.short), para(guideLine(later, "q3", "range", "body"))],
        onScreen: guideLine(later, "q3", "range", "onScreen"),
        targets: [CARD],
        scroll: "card",
      };
    case "queue":
      return {
        ...base,
        body: [para(firstSentences(TERMS.queue.help, 2))],
        onScreen: GUIDE.seedViews.queue.onScreen(copy.LAYOUT.incompleteTab),
        targets: [[region("queue-tab")], [`${region("queue-list")} > li:first-child`]],
        scroll: "top",
      };
    case null: {
      const school = state.school ? ctx.schools.find((s) => s.id === state.school) : undefined;
      const card = school
        ? school.cohort === "queue"
          ? GUIDE.pointToMissing
          : GUIDE.pointToCard(copy.topDrivers(school, rule).length)
        : null;
      return {
        ...base,
        body: card ? [ruleLine, para(card)] : [ruleLine],
        // Said from the state the view opens on: a school card only when a school opens.
        onScreen: school ? GUIDE.viewFallbackOnScreen : GUIDE.seedViews.top.onScreen,
        // The line names the whole screen, so no ring singles a part of it out.
        targets: [],
        scroll: school ? "card" : "top",
      };
    }
  }
}
