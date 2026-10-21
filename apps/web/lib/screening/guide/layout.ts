/**
 * How much of the window the guide rail takes (notes/final.md, "Layout" and "Responsive layout"): 312 px from 1500 px
 * wide, 288 below, 400 and 360 while presenting. In the narrow layout the rail takes the map band's place instead of
 * a strip of the width, so it takes no width, and Presentation mode is not offered.
 */
import { BREAKPOINTS } from "../workspace/layout";

import { GUIDE_IDS, MEMORY_KEY } from "./machine";

export const WIDE_RAIL_FROM = 1500;

export function railWidth(width: number, open: boolean, presenting: boolean): number {
  if (!open || width < BREAKPOINTS.compact) return 0;
  const wide = width >= WIDE_RAIL_FROM;
  if (presenting) return wide ? 400 : 360;
  return wide ? 312 : 288;
}

/**
 * A script for the page's head that sets `--boot-rail` on the document to the rail's width before the first paint,
 * from the URL and the person's memory, the same decision `stateFromSearch` and `railWidth` make once the page runs.
 * Without it the server's HTML paints with no rail and a first visit's whole screen moves sideways when the rail
 * opens (a layout shift). The client clears it once the guidance store has read the same things.
 */
export function railBootScript(): string {
  const ids = JSON.stringify(GUIDE_IDS);
  return `(function(){try{var w=innerWidth;if(w<${BREAKPOINTS.compact})return;var p=new URLSearchParams(location.search),g=p.get("guide"),step=${ids}.indexOf(g)>=0||g==="views",seen=false;try{var m=JSON.parse(localStorage.getItem(${JSON.stringify(MEMORY_KEY)})||"null");seen=!!m&&m.seen===true}catch(e){}var open=g==="off"?false:g==="start"||step?true:!seen;if(!open)return;var wide=w>=${WIDE_RAIL_FROM},r=step&&p.get("present")==="1"?(wide?400:360):(wide?312:288);document.documentElement.style.setProperty("--boot-rail",r+"px")}catch(e){}})();`;
}

/** Presentation mode needs the room of a desktop window. */
export const canPresent = (width: number): boolean => width >= BREAKPOINTS.compact;
