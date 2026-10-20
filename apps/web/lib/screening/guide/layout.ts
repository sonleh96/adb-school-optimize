/**
 * How much of the window the guide rail takes (notes/final.md, "Layout" and "Responsive layout"): 312 px from 1500 px
 * wide, 288 below, 400 and 360 while presenting. In the narrow layout the rail takes the map band's place instead of
 * a strip of the width, so it takes no width, and Presentation mode is not offered.
 */
import { BREAKPOINTS } from "../workspace/layout";

export const WIDE_RAIL_FROM = 1500;

export function railWidth(width: number, open: boolean, presenting: boolean): number {
  if (!open || width < BREAKPOINTS.compact) return 0;
  const wide = width >= WIDE_RAIL_FROM;
  if (presenting) return wide ? 400 : 360;
  return wide ? 312 : 288;
}

/** Presentation mode needs the room of a desktop window. */
export const canPresent = (width: number): boolean => width >= BREAKPOINTS.compact;
