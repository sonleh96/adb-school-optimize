"use client";

import {
  type ReactNode,
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { RuleId } from "@/lib/screening/types";
import { DEFAULT_STATE, type WorkspaceState } from "@/lib/screening/workspace/state";
import {
  type WorkspaceController,
  type WorkspaceStore,
  createWorkspaceStore,
} from "@/lib/screening/workspace/store";

/**
 * The rule the API lists first. Its list is asked for at the same time as the rules, so the first list does not
 * wait a round trip for them. If the API's default turns out to be another rule, the rules say so and the store
 * follows.
 */
export const EXPECTED_DEFAULT_RULE = RuleId.parse("additive_u", "expected default rule");

const TEST_HOOKS = process.env.NEXT_PUBLIC_SCREENING_TEST_HOOKS === "true";

declare global {
  interface Window {
    /** Present only in builds made with NEXT_PUBLIC_SCREENING_TEST_HOOKS=true, for the browser tests. */
    __screeningWorkspace?: WorkspaceController;
  }
}

interface Context {
  store: WorkspaceStore;
  /** False until the URL has been read, so nothing is fetched for a rule the URL is about to change. */
  urlRead: boolean;
}

const WorkspaceContext = createContext<Context | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createWorkspaceStore(EXPECTED_DEFAULT_RULE));
  const [urlRead, setUrlRead] = useState(false);

  // The server renders the defaults. The URL is read before the browser paints the first frame, so a pasted link
  // never flashes the default screen, and React's hydration still sees the markup the server sent.
  useLayoutEffect(() => {
    store.attachUrl(window.location, window.history);
    setUrlRead(true);
    // Back and Forward bring back an earlier URL; the screen follows it.
    window.addEventListener("popstate", store.readUrl);
    if (TEST_HOOKS) window.__screeningWorkspace = store;
    return () => {
      window.removeEventListener("popstate", store.readUrl);
      if (TEST_HOOKS) delete window.__screeningWorkspace;
    };
  }, [store]);

  const value = useMemo(() => ({ store, urlRead }), [store, urlRead]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

function useContextValue(): Context {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("The screening workspace hooks must be used inside WorkspaceProvider.");
  return value;
}

export const useWorkspaceStore = (): WorkspaceStore => useContextValue().store;
export const useUrlRead = (): boolean => useContextValue().urlRead;

/** The workspace's state; the component re-renders when it changes. */
export function useWorkspaceState(): WorkspaceState {
  const store = useWorkspaceStore();
  return useSyncExternalStore(store.subscribe, store.snapshot, () => DEFAULT_STATE);
}

/** The controller the guide rail and help mode drive the workspace through. */
export const useWorkspace = (): WorkspaceController => useWorkspaceStore();
