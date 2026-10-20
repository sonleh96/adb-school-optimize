"use client";

import { useEffect } from "react";

/**
 * Hands focus back to whatever had it when a layer opened (its trigger), once the layer closes, if focus was inside
 * the layer and so went nowhere. A click elsewhere that closes the layer keeps focus where the click put it.
 */
export function useReturnFocus(): void {
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    return () => {
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost && trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
}
