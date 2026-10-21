"use client";

/**
 * A saved view for meetings as a rail step (notes/final.md, "Saved view step"): the same anatomy as a guide's step,
 * with "Saved view n of m" as its one counter. Landing on a view sets the whole workspace state it was saved with,
 * through the controller; Next, Back, Page Down, Page Up and Presentation mode step through the views as through a
 * guide (the guidance reducer holds that), and the rail says when the screen has moved on from the view.
 */
import { SquareDashed } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { LaterCopy } from "@/lib/screening/copy/later";
import { canPresent } from "@/lib/screening/guide/layout";
import { plainViewTitle, viewStep } from "@/lib/screening/views/step";
import { applyPatch } from "@/lib/screening/workspace/state";

import { Sentence } from "../Sentence";
import { useWorkspaceState, useWorkspaceStore } from "../WorkspaceProvider";
import { scrollIntoPanel, scrollPanelToTop, whenPresent } from "../guide/dom";
import { useActed, useKeyboardRef, useLayerStore, useLayers } from "../guide/GuidanceProvider";
import { Rings } from "../guide/Rings";
import type { GuideData } from "../guide/types";
import styles from "../guide/guide.module.css";
import { useSavedViews } from "./useSavedViews";

export function ViewStepper({
  root,
  data,
  later,
}: {
  root: HTMLElement | null;
  data: GuideData;
  later: LaterCopy;
}) {
  const layers = useLayerStore();
  const { state } = useLayers();
  const workspace = useWorkspaceStore();
  // Read so the step re-renders, and says whether the screen has moved on, after every change.
  const current = useWorkspaceState();
  const keyboard = useKeyboardRef();
  const acted = useActed();
  const ringStores = useMemo(() => [workspace, layers], [workspace, layers]);
  const { views } = useSavedViews(data.copy, data.shown?.schools ?? null);
  const count = views?.length ?? null;
  useEffect(() => {
    if (count !== null) layers.setViews(count);
  }, [layers, count]);

  const rail = state.rail.kind === "view" ? state.rail : null;
  const view = views && rail ? (views[rail.step - 1] ?? null) : null;
  const { shown } = data;
  const ctx = useMemo(
    () =>
      shown && data.ready
        ? { copy: shown.copy, later, known: workspace.known(), schools: shown.schools, ordered: data.ordered }
        : null,
    // `known` follows the loaded data, which `shown` stands for.
    [shown, data.ready, data.ordered, later, workspace]
  );
  const step = useMemo(() => (ctx && view ? viewStep(ctx, view) : null), [ctx, view]);

  // Landing on a view sets the screen for it, then brings what it points at into view.
  const [landed, setLanded] = useState(0);
  const scrolling = useRef<(() => void)[]>([]);
  useEffect(() => () => scrolling.current.forEach((stop) => stop()), []);
  useEffect(() => {
    if (!step || landed === state.apply.seq) return;
    setLanded(state.apply.seq);
    workspace.setState(step.patch);
    scrolling.current.forEach((stop) => stop());
    scrolling.current = [];
    if (!root) return;
    const wait = (selector: string, then: (element: Element) => void) =>
      scrolling.current.push(whenPresent(root, selector, then));
    if (step.scroll === "top")
      for (const selector of ['[data-region="ranked-list"]', '[data-region="queue-list"]'])
        wait(selector, scrollPanelToTop);
    if (step.scroll === "card") wait('[data-region="inspector-place"]', scrollPanelToTop);
    const lastGroup = step.targets[step.targets.length - 1];
    const lastTarget = lastGroup?.[lastGroup.length - 1];
    if (step.scroll === "target" && lastTarget) wait(lastTarget, scrollIntoPanel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per landing; `seq` names the landing.
  }, [step, state.apply.seq]);

  // The screen has moved on when setting the view's state again would change anything.
  const drift =
    !!step && landed === state.apply.seq && applyPatch(current, step.patch, workspace.known()) !== current;

  // Announce each view. Opening the views from the start list moves focus to the first title, as opening a guide does;
  // stepping leaves focus on Next or Back.
  const title = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  const [said, setSaid] = useState("");
  const name = view ? plainViewTitle(later, view) : "";
  const n = views?.length ?? 0;
  const counter = rail ? data.copy.LAYOUT.viewOf(rail.step, n) : "";
  useEffect(() => {
    if (name) setSaid(`${counter}. ${name}`);
  }, [counter, name]);
  useLayoutEffect(() => {
    if (focused.current || !step) return;
    focused.current = true;
    if (acted()) title.current?.focus({ preventScroll: true });
  }, [step, acted]);

  if (!rail) return null;
  const { GUIDE } = later;
  const { LAYOUT, KEYS } = data.copy;
  const last = rail.step >= n;
  const presentable = canPresent(data.width);
  const presenting = state.present && presentable;
  const next = views?.[rail.step];
  const upNext = presenting && next ? plainViewTitle(later, next) : null;
  const close = last ? GUIDE.finishClose : GUIDE.close;

  return (
    <>
      <p className={styles.live} aria-live="polite">
        {said}
      </p>
      <div className={styles.railHead}>
        <div className={styles.headRow}>
          <span className={styles.guideName}>{LAYOUT.savedViews}</span>
          <button
            type="button"
            className={`${styles.link} ${styles.headSkip}`}
            onClick={() => layers.dispatch({ type: "skip" })}
          >
            {close}
          </button>
          <button
            type="button"
            className={styles.link}
            onClick={() => layers.dispatch({ type: "allGuides" })}
          >
            {GUIDE.allGuides}
          </button>
        </div>
        <div className={styles.progress} aria-hidden="true">
          {Array.from({ length: n }, (_, i) => (
            <i key={i} data-at={i + 1 < rail.step ? "done" : i + 1 === rail.step ? "current" : undefined} />
          ))}
        </div>
        <p className={styles.counter} data-testid="view-counter">
          {counter}
        </p>
      </div>
      <div className={styles.railBody}>
        {step ? (
          <>
            <h2 ref={title} className={styles.stepTitle} tabIndex={-1} data-testid="guide-step-title">
              <Sentence segments={step.title} />
            </h2>
            <div className={styles.stepBody} data-testid="guide-step-body">
              {step.body.map((p, i) => (
                <p key={i}>
                  <Sentence segments={p.text} />
                </p>
              ))}
            </div>
            <p className={styles.onScreen}>
              <SquareDashed size={14} aria-hidden />
              <span>
                <span className={styles.label}>{GUIDE.onScreen}</span>
                {step.onScreen}
              </span>
            </p>
            {drift ? (
              <p className={styles.drift} data-testid="guide-drift">
                {GUIDE.drift}{" "}
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => layers.dispatch({ type: "restore" })}
                >
                  {GUIDE.driftRestore}
                </button>
              </p>
            ) : null}
          </>
        ) : (
          <div aria-busy="true">
            <p role="status">{LAYOUT.loadingGuide}</p>
          </div>
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
          <button
            type="button"
            className={styles.quiet}
            disabled={rail.step === 1}
            onClick={() => layers.dispatch({ type: "back" })}
          >
            {GUIDE.back}
          </button>
          <button type="button" className={styles.primary} onClick={() => layers.dispatch({ type: "next" })}>
            {last ? GUIDE.finish : GUIDE.next}
            {presenting ? <kbd>{KEYS.pageDown}</kbd> : null}
          </button>
        </div>
        <div className={styles.foot2}>
          <button type="button" className={styles.link} onClick={() => layers.dispatch({ type: "skip" })}>
            {close}
          </button>
          {presentable ? (
            <span className={styles.footRight}>
              <button
                type="button"
                className={styles.link}
                aria-pressed={presenting}
                onClick={() => layers.dispatch({ type: "present", on: !presenting })}
              >
                {presenting ? LAYOUT.stopPresentationMode : LAYOUT.presentationMode}
              </button>
              {presenting ? <span className={styles.hint}>{KEYS.pageHint}</span> : null}
            </span>
          ) : null}
        </div>
      </div>
      {root && step && !state.page && step.targets.length > 0 ? (
        <Rings root={root} targets={step.targets} keyboard={keyboard} stores={ringStores} />
      ) : null}
    </>
  );
}
