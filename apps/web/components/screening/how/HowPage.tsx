"use client";

/**
 * How this works: a full page (`page=how`) beside the rail, with its contents, the six sections in paragraphs of up
 * to three sentences, a "Show me on the screen" link that opens the guide for each section, and the plain caveat.
 * Every sentence is `HOW_IT_WORKS`, in order; the worked example's school name is set apart (R18).
 */
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { type Segments, textOf } from "@/lib/screening/copy";
import type { GuideId } from "@/lib/screening/guide/machine";

import { Sentence } from "../Sentence";
import { useActed, useLayerStore, useLayers } from "../guide/GuidanceProvider";
import type { GuideData } from "../guide/types";
import { useLater } from "../guide/useLater";
import { useReturnFocus } from "../guide/useReturnFocus";
import styles from "./how.module.css";

/** Which guide shows each section on the screen. */
const SHOW_ME: Record<string, GuideId> = {
  purpose: "q1",
  placed: "q4",
  need: "q2",
  inputs: "q2",
  rules: "q5",
  limits: "q3",
};
const SOURCE = /^Source:/;

/** Sentences in paragraphs of up to three; the source line stands on its own. */
function paragraphs(sentences: readonly string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  for (const sentence of sentences) {
    if (SOURCE.test(sentence)) {
      if (run.length) out.push(run.join(" "));
      out.push(sentence);
      run = [];
      continue;
    }
    run.push(sentence);
    if (run.length === 3) {
      out.push(run.join(" "));
      run = [];
    }
  }
  if (run.length) out.push(run.join(" "));
  return out;
}

/** A paragraph with the worked example's names marked, when it holds the example. */
function withNames(paragraph: string, example: Segments | null): ReactNode {
  if (!example) return paragraph;
  const plain = textOf(example);
  const at = paragraph.indexOf(plain);
  if (at < 0) return paragraph;
  return (
    <>
      {paragraph.slice(0, at)}
      <Sentence segments={example} />
      {paragraph.slice(at + plain.length)}
    </>
  );
}

export default function HowPage({ data }: { data: GuideData }) {
  const store = useLayerStore();
  const { catalog } = useLayers();
  const later = useLater(data.copy);
  const page = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const acted = useActed();
  useReturnFocus();
  const { copy } = data;

  const ready = later.status === "ready";
  useEffect(() => {
    if (ready && acted()) title.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once the page's words have loaded.
  }, [ready]);

  // The contents mark the section being read; at the end of the page, the last one.
  useEffect(() => {
    const element = page.current;
    if (!element || !ready) return;
    const onScroll = () => {
      const sections = [...element.querySelectorAll<HTMLElement>("section[data-key]")];
      let at = sections[0]?.dataset.key ?? null;
      for (const section of sections)
        if (section.getBoundingClientRect().top < 160) at = section.dataset.key!;
      if (element.scrollTop + element.clientHeight >= element.scrollHeight - 4)
        at = sections[sections.length - 1]?.dataset.key ?? at;
      setCurrent(at);
    };
    onScroll();
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [ready]);

  const close = () => store.dispatch({ type: "page", page: null });
  const offered = (guide: GuideId) => !!catalog?.some((g) => g.id === guide);

  return (
    <main ref={page} className={styles.page} aria-labelledby="how-title" data-region="how-page">
      {later.status === "failed" ? (
        <div className={styles.state} role="alert">
          <p>{copy.LAYOUT.loadFailed}</p>
          <button type="button" className={styles.link} onClick={later.retry}>
            {copy.LAYOUT.retry}
          </button>
        </div>
      ) : later.status === "loading" ? (
        <div className={styles.state} aria-busy="true">
          <p role="status">{copy.LAYOUT.loadingHow}</p>
        </div>
      ) : (
        <div className={styles.wrap}>
          <nav className={styles.nav} aria-label={later.copy.GUIDE.sectionsAria}>
            <button type="button" className={`${styles.link} ${styles.back}`} onClick={close}>
              <ArrowLeft size={14} aria-hidden />
              {copy.LAYOUT.howBack}
            </button>
            <span className={styles.eyebrow}>{later.copy.GUIDE.howTitle}</span>
            <ol>
              {later.copy.HOW_IT_WORKS.map((section, index) => (
                <li key={section.key}>
                  <button
                    type="button"
                    aria-current={(current ?? later.copy.HOW_IT_WORKS[0].key) === section.key}
                    onClick={() => {
                      const target = page.current?.querySelector<HTMLElement>(
                        `section[data-key="${section.key}"]`
                      );
                      if (target && page.current)
                        page.current.scrollTop += target.getBoundingClientRect().top - 24;
                      setCurrent(section.key);
                    }}
                  >
                    <span className={styles.n} aria-hidden="true">
                      {index + 1}
                    </span>
                    {section.title}
                  </button>
                </li>
              ))}
            </ol>
            <p className={styles.glossary}>
              <button
                type="button"
                className={styles.link}
                onClick={() => store.dispatch({ type: "gloss", open: true })}
              >
                {copy.HELP.glossary}
              </button>
            </p>
          </nav>
          <article className={styles.main}>
            <h1 ref={title} id="how-title" tabIndex={-1}>
              {later.copy.GUIDE.howTitle}
            </h1>
            <p className={styles.lede}>{copy.TERMS.screening.line}</p>
            {later.copy.HOW_IT_WORKS.map((section, index) => (
              <section key={section.key} data-key={section.key} aria-labelledby={`how-${section.key}`}>
                <h2 id={`how-${section.key}`}>
                  <span className={styles.n} aria-hidden="true">
                    {index + 1}
                  </span>
                  {section.title}
                </h2>
                {paragraphs(section.sentences).map((text, i) => (
                  <p key={i}>{withNames(text, later.copy.howExample)}</p>
                ))}
                {offered(SHOW_ME[section.key]) && data.ready ? (
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => store.dispatch({ type: "openGuide", guide: SHOW_ME[section.key] })}
                  >
                    {copy.LAYOUT.showMe}
                  </button>
                ) : null}
              </section>
            ))}
            <div className={styles.foot}>
              <p>{copy.STRINGS.caveatPlain}</p>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
