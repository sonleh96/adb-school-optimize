"use client";

import { useEffect, useState } from "react";

import type { BoundCopy, CopyRuleId } from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";

/**
 * The method details' words for the rule shown, loaded on first use (the copy's `methodFor`), so a plain view never
 * ships them. While a new rule's words load, the last rule's stay, so the method layer does not blink.
 */
export function useMethod(copy: BoundCopy | null, rule: CopyRuleId | null, on: boolean) {
  const [loaded, setLoaded] = useState<{ copy: BoundCopy; rule: CopyRuleId; method: Method } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!on || !copy || !rule) return;
    let live = true;
    copy.methodFor(rule).then(
      (method) => {
        if (!live) return;
        setLoaded({ copy, rule, method });
        setFailed(false);
      },
      (error: unknown) => {
        console.error(error);
        if (live) setFailed(true);
      }
    );
    return () => {
      live = false;
    };
  }, [on, copy, rule, attempt]);

  return {
    method: loaded?.method ?? null,
    /** The words are the rule's own, not the last rule's kept while they load. */
    current: loaded !== null && loaded.copy === copy && loaded.rule === rule,
    failed,
    retry: () => setAttempt((n) => n + 1),
  };
}
