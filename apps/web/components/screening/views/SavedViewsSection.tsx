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
import { NAME_MAX, VIEWS_MAX, canSave, cleanName, isStarting, viewQuery } from "@/lib/screening/views/views";

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
  // What the status line under the form says: that a view was saved, or that the starting views are back.
  const [status, setStatus] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // The guidance store steps through the views by id; the ids change only when the list does.
  const ids = views ? views.map((view) => view.id).join(" ") : null;
  useEffect(() => {
    if (ids !== null) layers.setViews(ids ? ids.split(" ") : []);
  }, [layers, ids]);
  // "Saved as view n" stays a moment beside the form, then clears so it is not read again.
  useEffect(() => {
    if (status === null) return;
    const timer = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!views || !cleanName(name)) {
      input.current?.focus();
      return;
    }
    store.save(name, viewQuery(workspace.snapshot(), workspace.known()));
    setName("");
    setStatus(LAYOUT.savedToast(views.length + 1));
  };
  // Removing a view hands focus to the row that takes its position, or the name field when none is left.
  const remove = (index: number) => {
    if (!views) return;
    store.remove(views[index].entry);
    setStatus(null);
    requestAnimationFrame(() => {
      const buttons = list.current?.querySelectorAll<HTMLButtonElement>("button[data-remove]") ?? [];
      (buttons[Math.min(index, buttons.length - 1)] ?? input.current)?.focus();
    });
  };

  // Back to the starting views. A view a person saved is only dropped after a second press; removing a starting
  // view alone costs nothing that cannot be brought back, so it restores at once.
  const kept = store.entries();
  // At the cap the form is closed, and the note beside it says what to do.
  const full = !canSave(kept);
  const hasOwn = !!kept?.some((entry) => "name" in entry);
  const restore = () => {
    if (hasOwn && !confirming) {
      setConfirming(true);
      return;
    }
    store.reset();
    setConfirming(false);
    setStatus(LAYOUT.viewsRestored);
    requestAnimationFrame(() =>
      (list.current?.querySelector<HTMLButtonElement>("button[data-view]") ?? input.current)?.focus()
    );
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
            onClick={() => layers.dispatch({ type: "openView", id: views[0].id, present: true })}
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
            <li key={view.id} className={styles.row}>
              <button
                type="button"
                className={styles.go}
                disabled={!ready}
                data-view={index + 1}
                onClick={() => layers.dispatch({ type: "openView", id: view.id })}
              >
                <span className={styles.n} aria-hidden="true">
                  {index + 1}
                </span>
                <span className={styles.name} dir="auto">
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
      {ready && views.length === 0 ? (
        <p className={styles.note} data-region="no-views">
          {LAYOUT.noViews}
        </p>
      ) : null}
      {ready && !isStarting(kept) ? (
        <div className={styles.resetRow}>
          <button
            type="button"
            className={`${rail.link} ${styles.reset}`}
            data-region="reset-views"
            onClick={restore}
          >
            {confirming ? LAYOUT.resetViewsConfirm : LAYOUT.resetViews}
          </button>
          {confirming ? (
            <button
              type="button"
              className={`${rail.link} ${styles.reset}`}
              data-region="keep-views"
              onClick={() => setConfirming(false)}
            >
              {LAYOUT.keepViews}
            </button>
          ) : null}
        </div>
      ) : null}
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
          disabled={!ready || full}
          aria-describedby={full ? "views-full" : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="submit"
          className={`${rail.quiet} ${styles.saveButton}`}
          disabled={!ready || full}
          aria-describedby={full ? "views-full" : undefined}
        >
          {LAYOUT.saveView}
        </button>
      </form>
      {full ? (
        <p id="views-full" className={styles.note} data-region="views-full">
          {LAYOUT.viewsFull(VIEWS_MAX)}
        </p>
      ) : null}
      <p className={styles.saved} role="status">
        {status ?? ""}
      </p>
    </section>
  );
}
