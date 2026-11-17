import type { BoundCopy } from "@/lib/screening/copy";
import { capitalise } from "@/lib/screening/copy/format";

/**
 * The source for a record row, whose label already says "Source". The copy's source line names itself ("Source: the
 * research paper ..."), so its own lead is left out here and the label is said once.
 */
export function sourceValue({ TERMS, STRINGS }: BoundCopy): string {
  const lead = `${TERMS.source.label}: `;
  return capitalise(STRINGS.source.startsWith(lead) ? STRINGS.source.slice(lead.length) : STRINGS.source);
}
