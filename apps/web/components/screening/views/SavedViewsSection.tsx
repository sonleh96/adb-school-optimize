"use client";

/**
 * Saved views for meetings in the rail's start list: each view opens as a rail step, Presentation mode beside the
 * heading starts at view 1, Save this view keeps the screen under a name, and each view can be removed.
 */
import { X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import type { LaterCopy } from "@/lib/screening/copy/later";
import { canPresent } from "@/lib/screening/guide/layout";
import { plainViewTitle, viewTitle } from "@/lib/screening/views/step";
import { NAME_MAX, cleanName, viewQuery } from "@/lib/screening/views/views";

import { Sentence } from "../Sentence";
import { useWorkspaceStore } from "../WorkspaceProvider";
import { useLayerStore } from "../guide/GuidanceProvider";
import type { GuideData } from "../guide/types";
import rail from "../guide/guide.module.css";
import { useSavedViews } from "./useSavedViews";
import styles from "./views.module.css";

export function SavedViewsSection({ data, later }: { data: GuideData; later: LaterCopy }) {
  const layers = useLayerStore();
  const workspace = useWorkspaceStore();
  const { views, store } = useSavedViews(data.copy, data.shown?.schools ?? null);
  const { LAYOUT, TERMS } = data.copy;
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const count = views?.length ?? null;

  useEffect(() => {
    if (count !== null) layers.setViews(count);
  }, [layers, count]);
  // "Saved as view n" stays a moment beside the form, then clears so it is not read again.
  useEffect(() => {
    if (saved === null) return;
    const timer = setTimeout(() => setSaved(null), 4000);
    return () => clearTimeout(timer);
  }, [saved]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!views || !cleanName(name)) {
      input.current?.focus();
      return;
    }
    store.save(name, viewQuery(workspace.snapshot()));
    setName("");
    setSaved(views.length + 1);
  };
  // Removing a view hands focus to the row that takes its place, or the name field when none is left.
  const remove = (index: number) => {
    if (!views) return;
    store.remove(views[index].at);
    setSaved(null);
    requestAnimationFrame(() => {
      const buttons = list.current?.querySelectorAll<HTMLButtonElement>("button[data-remove]") ?? [];
      (buttons[Math.min(index, buttons.length - 1)] ?? input.current)?.focus();
    });
  };

  const ready = data.ready && views !== null;
  return (
    <section className={styles.section} aria-labelledby="saved-views-heading" data-region="saved-views">
      <div className={styles.head}>
        <h3 id="saved-views-heading" className={styles.heading}>
          {LAYOUT.savedViews}
        </h3>
        {ready && views.length > 0 && canPresent(data.width) ? (
          <button
            type="button"
            className={`${rail.link} ${styles.present}`}
            data-region="present-views"
            onClick={() => layers.dispatch({ type: "openView", step: 1, present: true })}
          >
            {LAYOUT.presentationMode}
          </button>
        ) : null}
      </div>
      <p className={styles.note}>
        {TERMS.briefing_stops.line} {TERMS.briefing_stops.help}
      </p>
      <ol ref={list} className={styles.list} aria-label={LAYOUT.savedViews} aria-busy={!ready}>
        {(views ?? []).map((view, index) => {
          const title = viewTitle(later, view);
          return (
            <li key={`${view.at}:${view.seed ?? view.name}`} className={styles.row}>
              <button
                type="button"
                className={styles.go}
                disabled={!ready}
                data-view={index + 1}
                onClick={() => layers.dispatch({ type: "openView", step: index + 1 })}
              >
                <span className={styles.n} aria-hidden="true">
                  {index + 1}
                </span>
                <span className={styles.name}>
                  <Sentence segments={title} />
                </span>
              </button>
              <button
                type="button"
                className={styles.remove}
                data-remove=""
                aria-label={LAYOUT.removeView(plainViewTitle(later, view))}
                title={LAYOUT.removeView(plainViewTitle(later, view))}
                onClick={() => remove(index)}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
      <form className={styles.save} onSubmit={save} data-region="save-view">
        <input
          ref={input}
          className={styles.input}
          type="text"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="off"
          placeholder={LAYOUT.viewName}
          aria-label={LAYOUT.viewName}
          disabled={!ready}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className={`${rail.quiet} ${styles.saveButton}`} disabled={!ready}>
          {LAYOUT.saveView}
        </button>
      </form>
      <p className={styles.saved} role="status">
        {saved !== null ? LAYOUT.savedToast(saved) : ""}
      </p>
    </section>
  );
}
