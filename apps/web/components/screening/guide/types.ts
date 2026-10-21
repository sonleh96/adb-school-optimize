import type { BoundCopy } from "@/lib/screening/copy";
import type { LayoutMode } from "@/lib/screening/workspace/layout";

import type { ShownList } from "../useScreeningData";

/** What the workspace hands the guidance layers at their mount point: its data, read-only, and its layout. */
export interface GuideData {
  /** The copy of the list on screen, or the copy with no data bound while nothing has loaded. */
  readonly copy: BoundCopy;
  readonly shown: ShownList | null;
  /** The keys of the schools that can be put in order, in the list's order. */
  readonly ordered: readonly string[];
  /** The list, its statement and its comparison have loaded: the guides can run. */
  readonly ready: boolean;
  /** The API offers the circulated rule with urgency, so guide 5 can compare the main rule with it. */
  readonly urgencyRule: boolean;
  /**
   * What the workspace shows that some guide steps point at: "Download the top list" (`export-button`) and the
   * incomplete records' Group by control (`queue-group`). A step is offered only when its region exists.
   */
  readonly features: { readonly export: boolean; readonly grouping: boolean };
  readonly mode: LayoutMode;
  readonly width: number;
}
