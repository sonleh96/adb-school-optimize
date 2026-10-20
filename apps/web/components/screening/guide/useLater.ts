"use client";

import { useCallback, useEffect, useState } from "react";

import type { BoundCopy } from "@/lib/screening/copy";
import type { LaterCopy } from "@/lib/screening/copy/later";

export type Later =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly retry: () => void }
  | { readonly status: "ready"; readonly copy: LaterCopy };

/**
 * The copy the guidance layers load on demand (the guide, How this works, the glossary), bound to the same data as
 * `copy`. A failed download can be tried again: the copy system forgets a failed load.
 */
export function useLater(copy: BoundCopy): Later {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ copy: BoundCopy; value: LaterCopy | "failed" } | null>(null);
  useEffect(() => {
    let live = true;
    copy.later().then(
      (value) => live && setResult({ copy, value }),
      () => live && setResult({ copy, value: "failed" })
    );
    return () => {
      live = false;
    };
  }, [copy, attempt]);
  const retry = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);
  // A result for another binding is stale; keep showing it while the new one loads, so nothing flickers.
  if (!result) return { status: "loading" };
  if (result.value === "failed") return { status: "failed", retry };
  return { status: "ready", copy: result.value };
}
