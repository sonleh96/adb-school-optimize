"use client";

/**
 * The saved views the rail and the export sheet list: what the browser keeps, with the seeds the loaded data can show
 * chosen by role. Both load with their own chunk (the rail, the sheet), so none of this is in the page's up-front
 * script. The rail also tells the guidance store how many views there are, so it can step through them.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { type BoundCopy, type CopySchool, PROPOSED_RULE } from "@/lib/screening/copy";
import { rolesOf } from "@/lib/screening/guide/roles";
import { useScreeningRules } from "@/lib/screening/hooks";
import { seedsOf } from "@/lib/screening/views/seeds";
import { type ViewsStore, viewsStore } from "@/lib/screening/views/store";
import { type SavedView, resolve } from "@/lib/screening/views/views";

const TEST_HOOKS = process.env.NEXT_PUBLIC_SCREENING_TEST_HOOKS === "true";

declare global {
  interface Window {
    /** Present only in builds made with NEXT_PUBLIC_SCREENING_TEST_HOOKS=true, for the browser tests. */
    __screeningViews?: Pick<ViewsStore, "entries" | "save" | "remove" | "reset">;
  }
}

const noEntries = () => null;

export interface SavedViews {
  /** The views in order; null until the data says which seeds it can show. */
  readonly views: readonly SavedView[] | null;
  readonly store: ViewsStore;
}

export function useSavedViews(copy: BoundCopy, schools: readonly CopySchool[] | null): SavedViews {
  const store = useMemo(() => viewsStore(), []);
  const entries = useSyncExternalStore(store.subscribe, store.entries, noEntries);
  const rules = useScreeningRules().data?.rules ?? null;
  const proposed = !!rules?.some((rule) => rule.rule_id === PROPOSED_RULE);
  const roles = useMemo(() => (schools ? rolesOf(schools, copy) : null), [schools, copy]);
  const views = useMemo(
    () => (roles && rules ? resolve(entries, seedsOf(roles, proposed)) : null),
    [roles, rules, entries, proposed]
  );
  useEffect(() => {
    if (!TEST_HOOKS) return;
    window.__screeningViews = {
      entries: store.entries,
      save: store.save,
      remove: store.remove,
      reset: store.reset,
    };
  }, [store]);
  return { views, store };
}
