"use client";

import { useEffect, useState } from "react";

/**
 * Whether `element` holds more than it shows, so it scrolls. A part that scrolls is a stop for the keyboard, which can
 * then scroll it, and a part that does not is no stop at all. Kept current as the element or its content changes size.
 */
export function useOverflows(element: HTMLElement | null): boolean {
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    if (!element) return;
    const check = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    // The element's own size, and its children's: content that grows inside a box of fixed height changes no size of
    // the box itself.
    const sizes = new ResizeObserver(check);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(element);
      for (const child of element.children) sizes.observe(child);
      check();
    };
    const children = new MutationObserver(watch);
    children.observe(element, { childList: true });
    watch();
    return () => {
      sizes.disconnect();
      children.disconnect();
    };
  }, [element]);
  return element !== null && overflows;
}
