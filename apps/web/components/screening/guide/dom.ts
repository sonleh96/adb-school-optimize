/**
 * Reading the screen for the guidance layers: where a region is, which panel scrolls it, and bringing it into view.
 * Read-only towards the workspace except for scrolling a panel, which is what a person would do.
 */

/** The nearest ancestor that scrolls vertically, or null. */
export function scrollParent(element: Element): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight)
      return node;
  }
  return null;
}

/** Scrolls `element`'s panel so it shows, a third of the way down, unless it already does. Never animates. */
export function scrollIntoPanel(element: Element): void {
  const box = scrollParent(element);
  if (!box) return;
  const a = element.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (a.top >= b.top + 8 && a.bottom <= b.bottom - 8) return;
  box.scrollTop += a.top - b.top - Math.max(16, (b.height - a.height) / 3);
}

export function scrollPanelToTop(element: Element): void {
  const box = scrollParent(element);
  if (box) box.scrollTop = 0;
}

/** Whether an element is laid out and not hidden. */
export function shows(element: Element): boolean {
  const r = element.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(element).visibility !== "hidden";
}

/** Calls `found` with the first element matching `selector` under `root` once it exists, for up to `ms`. */
export function whenPresent(
  root: ParentNode,
  selector: string,
  found: (element: Element) => void,
  ms = 2000
): () => void {
  const until = performance.now() + ms;
  let frame = 0;
  const look = () => {
    const element = root.querySelector(selector);
    if (element && shows(element)) return found(element);
    if (performance.now() < until) frame = requestAnimationFrame(look);
  };
  frame = requestAnimationFrame(look);
  return () => cancelAnimationFrame(frame);
}

export const reducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
