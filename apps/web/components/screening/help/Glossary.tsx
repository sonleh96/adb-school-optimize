"use client";

/**
 * The glossary of terms: a drawer at the right, docked left of the school card when one is open, with a search,
 * the copy's glossary groups and the seven rules. An entry opens to its full help and, when the term is on screen,
 * "Show where", which rings it once. The foot links to How this works.
 */
import { ChevronRight, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { DEFAULT_RULE } from "@/lib/screening/copy";
import { markFor } from "@/lib/screening/guide/marks";

import { useWorkspaceState } from "../WorkspaceProvider";
import { reducedMotion, scrollIntoPanel } from "../guide/dom";
import { useLayerStore, useLayers } from "../guide/GuidanceProvider";
import type { GuideData } from "../guide/types";
import { useLater } from "../guide/useLater";
import { useReturnFocus } from "../guide/useReturnFocus";
import styles from "./help.module.css";

interface Entry {
  key: string;
  label: string;
  line: string;
  help: string;
}

export default function Glossary({ root, data }: { root: HTMLElement | null; data: GuideData }) {
  const store = useLayerStore();
  const { state } = useLayers();
  const wsState = useWorkspaceState();
  const later = useLater(data.copy);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus();
  const { copy } = data;
  const { HELP, TERMS } = copy;
  const { q, x } = state.gloss;

  useEffect(() => {
    if (!state.gloss.x) search.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on opening only.
  }, []);

  const ready = later.status === "ready";
  // Opened on an entry (from a card's "In the glossary"), the drawer shows that entry.
  useEffect(() => {
    if (!ready || !x) return;
    const entry = list.current?.querySelector(`[data-entry="${CSS.escape(x)}"]`);
    if (entry) scrollIntoPanel(entry);
    entry?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on load and when the entry changes from outside.
  }, [ready]);

  const rule = data.shown?.rule ?? DEFAULT_RULE;
  const markCtx = { rule, school: wsState.school };
  const groups: { heading: string; items: Entry[] }[] =
    later.status === "ready"
      ? [
          ...later.copy.GLOSSARY_GROUPS.map((g) => ({
            heading: g.heading,
            items: g.keys.map((k) => ({
              key: k,
              label: TERMS[k].label,
              line: TERMS[k].line,
              help: TERMS[k].help,
            })),
          })),
          {
            heading: HELP.rules,
            items: copy.RULE_IDS.map((id) => ({
              key: `rule:${id}`,
              label: copy.ruleLabel(id),
              line: copy.ruleOneLine(id),
              help: `${copy.ruleRelation(id)} ${copy.ruleExplanation(id)} ${copy.urgencyNote(id)}`,
            })),
          },
        ]
      : [];
  const needle = q.trim().toLowerCase();
  const found = groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (it) => !needle || [it.label, it.line, it.help].some((v) => v.toLowerCase().includes(needle))
      ),
    }))
    .filter((g) => g.items.length > 0);
  const single = found.length === 1 && found[0].items.length === 1;

  const showWhere = (key: string) => {
    if (!root) return;
    const element = markFor(root, markCtx, key);
    if (!element) return;
    scrollIntoPanel(element);
    const r = element.getBoundingClientRect();
    const ring = document.createElement("div");
    ring.className = styles.flash;
    ring.setAttribute("aria-hidden", "true");
    Object.assign(ring.style, {
      left: `${r.left - 4}px`,
      top: `${r.top - 4}px`,
      width: `${r.width + 8}px`,
      height: `${r.height + 8}px`,
    });
    document.body.append(ring);
    const animation = ring.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], {
      duration: reducedMotion() ? 600 : 1600,
      easing: "ease-out",
    });
    void animation.finished.then(() => ring.remove());
  };

  return (
    <aside
      className={styles.drawer}
      aria-label={HELP.glossary}
      data-guidance=""
      data-region="glossary"
      data-sheet={data.mode === "narrow" || undefined}
    >
      <div className={styles.drawerTop}>
        <span className={styles.eyebrow}>{HELP.glossary}</span>
        <button
          type="button"
          className={styles.close}
          aria-label={HELP.close}
          title={HELP.close}
          onClick={() => store.dispatch({ type: "gloss", open: false })}
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      <label className={styles.search}>
        <Search size={13} aria-hidden />
        <input
          ref={search}
          type="search"
          value={q}
          placeholder={HELP.find}
          aria-label={HELP.find}
          autoComplete="off"
          onChange={(event) => store.dispatch({ type: "gloss", open: true, q: event.target.value, x: null })}
        />
      </label>
      <div ref={list} className={styles.drawerScroll}>
        {later.status === "failed" ? (
          <div role="alert">
            <p className={styles.empty}>{copy.LAYOUT.loadFailed}</p>
            <button type="button" className={styles.link} onClick={later.retry}>
              {copy.LAYOUT.retry}
            </button>
          </div>
        ) : later.status === "loading" ? (
          <div aria-busy="true">
            <p className={styles.empty} role="status">
              {copy.LAYOUT.loadingGlossary}
            </p>
          </div>
        ) : found.length === 0 ? (
          <p className={styles.empty}>{HELP.none}</p>
        ) : (
          found.map((group) => (
            <section key={group.heading} className={styles.group}>
              <h3 className={styles.groupHead}>{group.heading}</h3>
              {group.items.map((item) => {
                const open = x === item.key || (!!needle && single);
                const where = open && root ? markFor(root, markCtx, item.key) : null;
                return (
                  <div
                    key={item.key}
                    className={styles.entry}
                    data-entry={item.key}
                    data-open={open || undefined}
                  >
                    <button
                      type="button"
                      className={styles.entryHead}
                      aria-expanded={open}
                      onClick={() =>
                        store.dispatch({ type: "gloss", open: true, x: x === item.key ? null : item.key })
                      }
                    >
                      <span>{item.label}</span>
                      <ChevronRight size={12} aria-hidden />
                    </button>
                    <p className={styles.entryLine}>{item.line}</p>
                    {open ? (
                      <>
                        <p className={styles.entryHelp}>{item.help}</p>
                        {where ? (
                          <button type="button" className={styles.link} onClick={() => showWhere(item.key)}>
                            {HELP.showWhere}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
      <div className={styles.drawerFoot}>
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            store.dispatch({ type: "gloss", open: false });
            store.dispatch({ type: "page", page: "how" });
          }}
        >
          {copy.LAYOUT.howTitle}
        </button>
      </div>
    </aside>
  );
}
