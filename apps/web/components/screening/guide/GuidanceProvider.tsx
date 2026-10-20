"use client";

/**
 * The guidance layers' context: the guide rail, the How this works page, help mode and the glossary share one store
 * (lib/screening/guide/store.ts). The provider reads the URL and the person's memory before the first paint, so a
 * first visit paints with the rail open and a returning visit with it closed, and it owns the layers' keys:
 * Page Down and Page Up step a guide, `?` explains the screen, `g` opens the glossary, and Escape closes the
 * innermost layer (the help card, then the glossary, then help mode, then the page) before the workspace sees it.
 */
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { INITIAL_STATE, EMPTY_MEMORY } from "@/lib/screening/guide/machine";
import { railWidth } from "@/lib/screening/guide/layout";
import { type LayerSnapshot, type LayerStore, createLayerStore } from "@/lib/screening/guide/store";

const TEST_HOOKS = process.env.NEXT_PUBLIC_SCREENING_TEST_HOOKS === "true";

declare global {
  interface Window {
    /** Present only in builds made with NEXT_PUBLIC_SCREENING_TEST_HOOKS=true, for the browser tests. */
    __screeningGuide?: Pick<LayerStore, "snapshot" | "dispatch">;
  }
}

interface Context {
  store: LayerStore;
  /** Whether the last action came from the keyboard: keyboard actions never animate. */
  keyboard: { current: boolean };
}

const GuidanceContext = createContext<Context | null>(null);
const SERVER_SNAPSHOT: LayerSnapshot = { state: INITIAL_STATE, memory: EMPTY_MEMORY, catalog: null };

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

export function GuidanceProvider({ children }: { children: ReactNode }) {
  const [value] = useState<Context>(() => ({ store: createLayerStore(), keyboard: { current: false } }));
  const { store, keyboard } = value;

  useLayoutEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    store.attach(window.location, window.history, storage);
    if (!TEST_HOOKS) return;
    window.__screeningGuide = { snapshot: store.snapshot, dispatch: store.dispatch };
    return () => {
      delete window.__screeningGuide;
    };
  }, [store]);

  useEffect(() => {
    const onPointer = () => {
      keyboard.current = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) keyboard.current = true;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const { state } = store.snapshot();
      const take = () => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      if (event.key === "Escape") {
        if (state.card) store.dispatch({ type: "card", id: null });
        else if (state.gloss.open) store.dispatch({ type: "gloss", open: false });
        else if (state.help) store.dispatch({ type: "help", on: false });
        else if (state.page) store.dispatch({ type: "page", page: null });
        else return;
        return take();
      }
      if (typing(event.target)) return;
      if ((event.key === "PageDown" || event.key === "PageUp") && state.rail.kind === "step") {
        take();
        store.dispatch({ type: event.key === "PageDown" ? "pageDown" : "pageUp" });
        return;
      }
      if (event.key === "?") {
        take();
        store.dispatch({ type: "help", on: !state.help });
        return;
      }
      if (event.key === "g" || event.key === "G") {
        take();
        store.dispatch({ type: "gloss", open: !state.gloss.open });
      }
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [store, keyboard]);

  return <GuidanceContext.Provider value={value}>{children}</GuidanceContext.Provider>;
}

function useContextValue(): Context {
  const value = useContext(GuidanceContext);
  if (!value) throw new Error("The guidance hooks must be used inside GuidanceProvider.");
  return value;
}

export const useLayerStore = (): LayerStore => useContextValue().store;
export const useKeyboardRef = (): { current: boolean } => useContextValue().keyboard;

export function useLayers(): LayerSnapshot {
  const store = useLayerStore();
  return useSyncExternalStore(store.subscribe, store.snapshot, () => SERVER_SNAPSHOT);
}

/** What the workspace's layout needs from the layers: the rail's width and which surfaces cover the map. */
export interface GuidanceFrame {
  readonly rail: number;
  readonly railOpen: boolean;
  readonly page: boolean;
  readonly glossary: boolean;
}

export function useGuidanceFrame(width: number): GuidanceFrame {
  const { state } = useLayers();
  const railOpen = state.rail.kind !== "off";
  return {
    rail: railWidth(width, railOpen, state.present && state.rail.kind === "step"),
    railOpen,
    page: state.page !== null,
    glossary: state.gloss.open,
  };
}
