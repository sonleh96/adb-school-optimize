"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { EXPLORE } from "@/lib/screening/copy/explore";

import styles from "./question-index.module.css";

interface Question {
  readonly id: string;
  readonly text: string;
}

/** The questions the page asks: every question heading, an `<h2>` with an id, in the page's order. */
const questionsIn = (root: Element): Question[] =>
  [...root.querySelectorAll("h2[id]")].map((h) => ({ id: h.id, text: h.textContent ?? "" }));

const same = (a: readonly Question[], b: readonly Question[]) =>
  a.length === b.length && a.every((q, i) => q.id === b[i].id && q.text === b[i].text);

/**
 * The list of the page's questions at its top, each a link to its section. It reads the questions off the sections
 * themselves, so a section added to the page is listed with no change here: each section's question is an `<h2>` with
 * an id, as set 1's is, and nothing else on the page is an `<h2>`. It is read before the browser paints, and again
 * when a section comes or goes, so the list never shows a question the page does not.
 */
export function QuestionIndex() {
  const nav = useRef<HTMLElement>(null);
  const [questions, setQuestions] = useState<readonly Question[]>([]);
  useLayoutEffect(() => {
    const root = nav.current?.parentElement;
    if (!root) return;
    const read = () => setQuestions((was) => (same(was, questionsIn(root)) ? was : questionsIn(root)));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      ref={nav}
      className={styles.index}
      aria-label={EXPLORE.index}
      data-region="question-index"
      hidden={questions.length < 2 || undefined}
    >
      <p className={styles.label} aria-hidden="true">
        {EXPLORE.index}
      </p>
      <ol className={styles.list}>
        {questions.map((q) => (
          <li key={q.id}>
            <a href={`#${q.id}`}>{q.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
