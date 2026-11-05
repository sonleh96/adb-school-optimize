"use client";

import { useEffect, useState } from "react";

import { isEmptyStore } from "@/lib/screening/errors";
import { useScreeningInputs, useScreeningResults, useScreeningRules } from "@/lib/screening/hooks";
import type { RuleId } from "@/lib/screening/types";

import styles from "./explore.module.css";

type Body = typeof import("./ExploreBody").ExploreBody;

/** The words the page shows before the charts load, passed from the server so this chunk carries no copy module. */
export interface WaitingWords {
  readonly loading: string;
  readonly failed: string;
  readonly retry: string;
  readonly empty: string;
}

/**
 * The data boundary of the explore page. It reads the rules, the list of the main rule and every school's stored
 * inputs, all at once, from the routes the workspace already reads; the list is the main rule's unless the API does
 * not offer it, as in the workspace. The charts, the school picker and the words that bind the data are one chunk,
 * asked for at the same moment, so the page's first load carries none of them and they never wait for the data.
 */
export function ExploreData({ rule, words }: { rule: string; words: WaitingWords }) {
  const [body, setBody] = useState<{ Body: Body } | "failed" | null>(null);
  useEffect(() => {
    import("./ExploreBody").then(
      (mod) => setBody({ Body: mod.ExploreBody }),
      () => setBody("failed")
    );
  }, []);

  const rules = useScreeningRules();
  const offered = !rules.data || rules.data.rules.some((r) => r.rule_id === rule);
  const shown = (offered ? rule : rules.data!.default_rule_id) as RuleId;
  const results = useScreeningResults({ rule: shown });
  const inputs = useScreeningInputs(true);

  if (isEmptyStore(results.error) || isEmptyStore(inputs.error) || results.data?.rows.length === 0)
    return <p className={styles.state}>{words.empty}</p>;
  if (body === "failed" || rules.error || results.error || inputs.error)
    return (
      <div className={styles.state} role="alert">
        <p>{words.failed}</p>
        <button
          type="button"
          className={styles.retry}
          onClick={() => {
            // A chunk that did not arrive comes with a fresh page; a read that failed is asked for again.
            if (body === "failed") window.location.reload();
            void rules.refetch();
            void results.refetch();
            void inputs.refetch();
          }}
        >
          {words.retry}
        </button>
      </div>
    );
  if (!body || !rules.data || !results.data || !inputs.data || results.data.run.rule_id !== shown)
    return (
      <p className={styles.state} role="status">
        {words.loading}
      </p>
    );
  return <body.Body rules={rules.data} results={results.data} inputs={inputs.data} failed={words.failed} />;
}
