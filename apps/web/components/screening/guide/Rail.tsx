"use client";

/**
 * The guide rail: "What do you want to find out?", five guides that drive the live screen, and Presentation mode.
 * It loads with the guide copy when the rail first opens, so the list and the card ship without it.
 *
 * Each step sets the workspace through its controller when the rail lands on it (`apply` in the layer state), then
 * watches the screen: a step that follows the person's selection retitles for the school they chose, and a step
 * whose screen has moved on says so and offers to show it again.
 */
import { ArrowRight, Check, SquareDashed } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type CopySchool, DEFAULT_RULE, PROPOSED_RULE, pairwiseFromCompare } from "@/lib/screening/copy";
import type { LaterCopy } from "@/lib/screening/copy/later";
import {
  BASE,
  type GuideContext,
  type StepView,
  follows,
  guidesOf,
  plainTitle,
  stepView,
  subjectOf,
} from "@/lib/screening/guide/guides";
import { canPresent } from "@/lib/screening/guide/layout";
import { type GuideId, statusOf } from "@/lib/screening/guide/machine";
import type { Plan, Roles } from "@/lib/screening/guide/roles";
import { useScreeningCompare } from "@/lib/screening/hooks";
import type { RuleId } from "@/lib/screening/types";
import { exampleSchool } from "@/lib/screening/workspace/teaching";

import { Sentence } from "../Sentence";
import { useWorkspace, useWorkspaceState } from "../WorkspaceProvider";
import { acted, scrollIntoPanel, scrollPanelToTop, whenPresent } from "./dom";
import { useKeyboardRef, useLayerStore, useLayers } from "./GuidanceProvider";
import { Rings } from "./Rings";
import type { GuideData } from "./types";
import { useLater } from "./useLater";
import styles from "./guide.module.css";

const MAIN_PAIR = { a: DEFAULT_RULE as RuleId, b: PROPOSED_RULE as RuleId };

interface RailProps {
  root: HTMLElement | null;
  data: GuideData;
  roles: Roles | null;
  plan: Plan | null;
}

export default function Rail({ root, data, roles, plan }: RailProps) {
  const later = useLater(data.copy);
  const { state } = useLayers();
  if (later.status === "failed") {
    return (
      <div className={styles.railBody} role="alert">
        <p className={styles.failed}>{data.copy.LAYOUT.loadFailed}</p>
        <button type="button" className={styles.quiet} onClick={later.retry}>
          {data.copy.LAYOUT.retry}
        </button>
      </div>
    );
  }
  if (later.status === "loading") return <div className={styles.railBody} aria-busy="true" />;
  return (
    <aside className={styles.railInner} aria-label={later.copy.GUIDE.railAria}>
      {state.rail.kind === "step" ? (
        <Stepper root={root} data={data} roles={roles} plan={plan} later={later.copy} />
      ) : (
        <Start data={data} plan={plan} later={later.copy} />
      )}
    </aside>
  );
}

/* ---------------------------------------------------------------- the start */

function Start({ data, plan, later }: { data: GuideData; plan: Plan | null; later: LaterCopy }) {
  const store = useLayerStore();
  const { memory } = useLayers();
  const { copy } = data;
  const { GUIDE } = later;
  const returning = memory.seen;
  const title = useRef<HTMLHeadingElement>(null);
  const keyboard = useKeyboardRef();
  useEffect(() => {
    if (acted()) title.current?.focus({ preventScroll: true });
  }, [keyboard]);
  const guides = plan ? guidesOf({ later, plan }) : [];
  return (
    <>
      <div className={styles.railHead}>
        <span className={styles.eyebrow}>{returning ? GUIDE.returningEyebrow : GUIDE.startEyebrow}</span>
      </div>
      <div className={styles.railBody}>
        <h2 ref={title} className={styles.startTitle} tabIndex={-1}>
          {GUIDE.startTitle}
        </h2>
        <p className={styles.lede}>{copy.TERMS.screening.help}</p>
        <ol className={styles.tasks} aria-busy={!plan}>
          {guides.map((guide, index) => {
            const status = statusOf(memory, guide.id, guide.steps.length);
            return (
              <li key={guide.id}>
                <button
                  type="button"
                  className={styles.task}
                  disabled={!data.ready}
                  data-guide={guide.id}
                  onClick={() => store.dispatch({ type: "openGuide", guide: guide.id })}
                >
                  <span className={styles.taskN} aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className={styles.taskText}>
                    <span className={styles.taskTitle}>{guide.title}</span>
                    <span className={styles.taskSub}>{guide.sub}</span>
                  </span>
                  <span className={styles.taskStatus} data-seen={status.kind === "seen" || undefined}>
                    {status.kind === "seen" ? (
                      <>
                        <Check size={12} aria-hidden />
                        {GUIDE.seen}
                      </>
                    ) : status.kind === "left" ? (
                      GUIDE.stepOf(status.step, status.of)
                    ) : (
                      GUIDE.stepCount(status.steps)
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className={styles.howLink}
          data-region="how-link"
          onClick={() => store.dispatch({ type: "page", page: "how" })}
        >
          <span className={styles.howTitle}>{GUIDE.howTitle}</span>
          <span className={styles.taskSub}>{GUIDE.howCount(later.HOW_IT_WORKS.length)}</span>
          <ArrowRight size={14} aria-hidden />
        </button>
      </div>
      <div className={styles.railFoot}>
        <button
          type="button"
          className={`${styles.quiet} ${styles.wide}`}
          onClick={() => store.dispatch({ type: "close" })}
        >
          {returning ? GUIDE.close : GUIDE.explore}
        </button>
        <p className={styles.note}>{returning ? GUIDE.returningNote : GUIDE.firstNote}</p>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- a step */

/** The keys a step sets that a person can change; a difference on any of them means the screen has moved on. */
const WATCHED = ["rule", "compare", "view", "school", "qgroup", "place"] as const;

function Stepper({
  root,
  data,
  roles,
  plan,
  later,
}: {
  root: HTMLElement | null;
  data: GuideData;
  roles: Roles | null;
  plan: Plan | null;
  later: LaterCopy;
}) {
  const store = useLayerStore();
  const { state } = useLayers();
  const ws = useWorkspace();
  const wsState = useWorkspaceState();
  const keyboard = useKeyboardRef();
  const compare = useScreeningCompare(data.proposed ? MAIN_PAIR : null);

  const ctx = useMemo((): GuideContext | null => {
    const { shown } = data;
    if (!shown || !roles || !plan || !data.ready) return null;
    const pairwise = compare.data ? pairwiseFromCompare(compare.data).pairwise : [];
    const row = pairwise.find(
      (p) =>
        (p.left_rule === DEFAULT_RULE && p.right_rule === PROPOSED_RULE) ||
        (p.left_rule === PROPOSED_RULE && p.right_rule === DEFAULT_RULE)
    );
    const agree = row ? [10, 20, 30, 40].filter((k) => row[`top${k}_overlap` as "top10_overlap"] === k) : [];
    return {
      copy: shown.copy,
      later,
      rule: shown.rule,
      schools: shown.schools,
      ordered: data.ordered,
      roles,
      plan,
      agreeK: agree.length ? Math.max(...agree) : null,
      example: exampleSchool(shown.schools, DEFAULT_RULE, PROPOSED_RULE),
    };
  }, [data, roles, plan, later, compare.data]);

  const rail = state.rail.kind === "step" ? state.rail : null;
  const guides = useMemo(() => (plan ? guidesOf({ later, plan }) : []), [later, plan]);
  const guide = rail ? (guides.find((g) => g.id === rail.guide) ?? null) : null;
  const key = guide && rail ? (guide.steps[rail.step - 1] ?? null) : null;

  // The school each guide follows, once the person has chosen one it can follow.
  const [kept, setKept] = useState<Partial<Record<GuideId, string>>>({});
  const byId = useMemo(() => new Map((ctx?.schools ?? []).map((s) => [s.id, s])), [ctx]);
  const subjectFor = (
    g: GuideId,
    k: string,
    selected: string | null,
    keep: Partial<Record<GuideId, string>>
  ): CopySchool | null => {
    if (!ctx) return null;
    const chosen = selected ? byId.get(selected) : undefined;
    if (chosen && follows(ctx, g, k, chosen)) return chosen;
    const keptSchool = keep[g] ? byId.get(keep[g]!) : undefined;
    if (keptSchool) return keptSchool;
    const own = subjectOf(ctx, g);
    return own ? (byId.get(own.id) ?? own) : null;
  };
  const subject = rail && key ? subjectFor(rail.guide, key, wsState.school, kept) : null;
  const view: StepView | null = ctx && rail && key ? stepView(ctx, rail.guide, key, subject) : null;

  // A step that follows the selection keeps the school the person chose for the steps after it.
  useEffect(() => {
    if (!rail || !subject || !key || !ctx || !follows(ctx, rail.guide, key, subject)) return;
    if (kept[rail.guide] !== subject.id) setKept((k) => ({ ...k, [rail.guide]: subject.id }));
  }, [rail, subject, key, ctx, kept]);

  // Landing on a step sets the screen for it, then brings what it points at into view.
  const [landed, setLanded] = useState(0);
  const scrolling = useRef<(() => void)[]>([]);
  useEffect(() => () => scrolling.current.forEach((stop) => stop()), []);
  useEffect(() => {
    if (!ctx || !rail || !key || landed === state.apply.seq) return;
    const keep = state.apply.fresh ? {} : kept;
    const selected = state.apply.fresh ? null : ws.getState().school;
    const who = subjectFor(rail.guide, key, selected, keep);
    setLanded(state.apply.seq);
    setKept(who ? { ...keep, [rail.guide]: who.id } : keep);
    const step = stepView(ctx, rail.guide, key, who);
    ws.setState({ ...BASE, ...step.patch });
    scrolling.current.forEach((stop) => stop());
    scrolling.current = [];
    if (!root) return;
    const lastGroup = step.targets[step.targets.length - 1];
    const lastTarget = lastGroup?.[lastGroup.length - 1];
    const wait = (selector: string, then: (element: Element) => void) =>
      scrolling.current.push(whenPresent(root, selector, then));
    if (step.scroll === "top") for (const group of step.targets) wait(group[0], scrollPanelToTop);
    if (step.scroll === "card") wait('[data-region="inspector-place"]', scrollPanelToTop);
    if (step.scroll === "target" && lastTarget) wait(lastTarget, scrollIntoPanel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per landing; `seq` names the landing.
  }, [ctx, state.apply.seq, key]);

  // The screen has moved on when a key the step set has changed, except the school a following step follows.
  const expected = view ? { ...BASE, ...view.patch } : null;
  const current = ws.getState();
  const drift =
    !!expected &&
    landed === state.apply.seq &&
    WATCHED.some((k) => {
      if (!(k in expected)) return false;
      if (k === "school" && subject && current.school === subject.id) return false;
      return (expected as Record<string, unknown>)[k] !== current[k];
    });

  // Announce each step; a guide opened by pointer moves focus to the step's title.
  const title = useRef<HTMLHeadingElement>(null);
  const [said, setSaid] = useState("");
  const stepName = view ? plainTitle(view) : "";
  const stepId = rail ? `${rail.guide}.${rail.step}` : "";
  useEffect(() => {
    if (!guide || !rail || !stepName) return;
    setSaid(`${guide.title}. ${later.GUIDE.stepOf(rail.step, guide.steps.length)}. ${stepName}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- announced once per step, not on each retitle.
  }, [stepId, Boolean(stepName)]);
  useLayoutEffect(() => {
    if (acted() && !keyboard.current && rail?.step === 1) title.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a guide's first step, once.
  }, [rail?.guide]);

  if (!rail || !guide) return null;
  const { GUIDE, KEYS } = { GUIDE: later.GUIDE, KEYS: data.copy.KEYS };
  const n = guide.steps.length;
  const last = rail.step >= n;
  const index = guides.findIndex((g) => g.id === guide.id);
  const nextGuide = guides[index + 1] ?? null;
  const previousGuide = guides[index - 1] ?? null;
  const presentable = canPresent(data.width);
  const presenting = state.present && presentable;
  const upNext =
    presenting || last
      ? !last && ctx
        ? plainTitle(stepView(ctx, guide.id, guide.steps[rail.step], subject))
        : (nextGuide?.title ?? null)
      : null;
  const compactOnMap = data.mode === "narrow" && !!view?.onMap;

  const back = (
    <button
      type="button"
      className={styles.quiet}
      disabled={rail.step === 1 && !(presenting && previousGuide)}
      onClick={() => store.dispatch({ type: "back" })}
    >
      {GUIDE.back}
    </button>
  );
  const next = (
    <button type="button" className={styles.primary} onClick={() => store.dispatch({ type: "next" })}>
      {last ? (nextGuide ? GUIDE.nextGuide : GUIDE.finish) : GUIDE.next}
      {presenting ? <kbd>{KEYS.pageDown}</kbd> : null}
    </button>
  );

  return (
    <>
      <p className={styles.live} aria-live="polite">
        {said}
      </p>
      {compactOnMap ? (
        <div className={styles.mapBarStep} data-testid="guide-compact">
          <p className={styles.compactTitle}>{view ? <Sentence segments={view.title} /> : null}</p>
          {back}
          {next}
        </div>
      ) : (
        <>
          <div className={styles.railHead}>
            <div className={styles.headRow}>
              <span className={styles.guideName}>{guide.title}</span>
              {/* In a short narrow window the foot keeps only Back and Next, so Skip sits up here. */}
              <button
                type="button"
                className={`${styles.link} ${styles.headSkip}`}
                onClick={() => store.dispatch({ type: "skip" })}
              >
                {last ? GUIDE.finishClose : GUIDE.skip}
              </button>
              <button
                type="button"
                className={styles.link}
                onClick={() => store.dispatch({ type: "allGuides" })}
              >
                {GUIDE.allGuides}
              </button>
            </div>
            <div className={styles.progress} aria-hidden="true">
              {guide.steps.map((s, i) => (
                <i
                  key={s}
                  data-at={i + 1 < rail.step ? "done" : i + 1 === rail.step ? "current" : undefined}
                />
              ))}
            </div>
            <p className={styles.counter}>{GUIDE.stepOf(rail.step, n)}</p>
          </div>
          <div className={styles.railBody}>
            {view ? (
              <>
                <h2 ref={title} className={styles.stepTitle} tabIndex={-1} data-testid="guide-step-title">
                  <Sentence segments={view.title} />
                </h2>
                <div className={styles.stepBody} data-testid="guide-step-body">
                  {view.body.map((p, i) => (
                    <p key={i}>
                      {p.lead ? <b>{p.lead}. </b> : null}
                      <Sentence segments={p.text} />
                    </p>
                  ))}
                </div>
                <p className={styles.onScreen}>
                  <SquareDashed size={14} aria-hidden />
                  <span>
                    <span className={styles.label}>{GUIDE.onScreen}</span>
                    {view.onScreen}
                  </span>
                </p>
                {view.tryIt ? (
                  <p className={styles.tryIt}>
                    <span className={styles.label}>{GUIDE.tryIt}</span>
                    <Sentence segments={view.tryIt} />
                  </p>
                ) : null}
                {drift ? (
                  <p className={styles.drift} data-testid="guide-drift">
                    {GUIDE.drift}{" "}
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => store.dispatch({ type: "restore" })}
                    >
                      {GUIDE.driftRestore}
                    </button>
                  </p>
                ) : null}
              </>
            ) : (
              <div aria-busy="true" />
            )}
          </div>
          <div className={styles.railFoot}>
            {upNext ? (
              <p className={styles.upNext}>
                <span className={styles.label}>{GUIDE.upNext}</span>
                {upNext}
              </p>
            ) : null}
            <div className={styles.nav}>
              {back}
              {next}
            </div>
            <div className={styles.foot2}>
              <button type="button" className={styles.link} onClick={() => store.dispatch({ type: "skip" })}>
                {last ? GUIDE.finishClose : GUIDE.skip}
              </button>
              {presentable ? (
                <span className={styles.footRight}>
                  <button
                    type="button"
                    className={styles.link}
                    aria-pressed={presenting}
                    onClick={() => store.dispatch({ type: "present", on: !presenting })}
                  >
                    {presenting ? data.copy.LAYOUT.stopPresentationMode : data.copy.LAYOUT.presentationMode}
                  </button>
                  {presenting ? <span className={styles.hint}>{KEYS.pageHint}</span> : null}
                </span>
              ) : null}
            </div>
          </div>
        </>
      )}
      {root && view && !state.page ? <Rings root={root} targets={view.targets} keyboard={keyboard} /> : null}
    </>
  );
}
