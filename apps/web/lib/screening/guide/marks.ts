/**
 * What help mode marks: about 25 key concepts on a screen with a school open (notes/final.md, "Decisions made while
 * combining", 7). Rows, chips and chrome stay unmarked, except the first row's place and the first range row's place.
 * Each rule names a hook the workspace exposes (`data-region`, `data-term`, `data-rule`) and the card the mark opens.
 */
import type { CardId } from "./machine";

export interface MarkContext {
  /** The rule on screen. */
  readonly rule: string;
  /** The school open in the school card. */
  readonly school: string | null;
}

export interface MarkRule {
  readonly selector: string;
  /** The card for the `index`th visible match, or null to leave it unmarked. */
  readonly card: (element: Element, index: number, ctx: MarkContext) => CardId | null;
  /** A block of text: it gets a rule in the margin instead of an underline. */
  readonly block?: boolean;
}

const term = (key: string) => (): CardId => `term:${key}`;
const firstOnly =
  (key: string) =>
  (_: Element, index: number): CardId | null =>
    index === 0 ? `term:${key}` : null;

export const MARKS: readonly MarkRule[] = [
  {
    selector: '[data-region="rule-switch"] [data-rule]',
    card: (e) => `rule:${(e as HTMLElement).dataset.rule}`,
  },
  { selector: '[data-region="list-statement"]', card: () => "compare-main", block: true },
  { selector: '[data-region="rule-role"]', card: (_, __, ctx) => `rule:${ctx.rule}`, block: true },
  { selector: "#screening-tab-ranked", card: term("cohort_ranked") },
  { selector: '[data-region="queue-tab"]', card: term("queue") },
  { selector: '[data-region="scope"] > p:first-child', card: firstOnly("cohort_complete"), block: true },
  { selector: '[data-region="list-order"]', card: term("list_order"), block: true },
  { selector: '[data-region="ranked-list"] [data-place="point"]', card: firstOnly("rank") },
  {
    selector: '[data-region="ranked-list"] :is([data-place="range"], [data-place="scoped"])',
    card: firstOnly("rank_range"),
  },
  { selector: '[data-region="changed-lead"]', card: () => "compare", block: true },
  { selector: '[data-region="caveat"]', card: term("inspection"), block: true },
  { selector: '[data-region="export-button"]', card: term("export") },
  {
    selector: '[data-region="inspector-place"]',
    card: (_, __, ctx) => (ctx.school ? `place:${ctx.school}` : null),
    block: true,
  },
  { selector: '[data-region="persistent-flag"]', card: term("persistent_flag"), block: true },
  // The method details: their scope line, compare mode's statement, and the two controls only they have.
  {
    selector: '[data-region="scope"] > p[data-term]',
    card: (e) => `term:${(e as HTMLElement).dataset.term}`,
    block: true,
  },
  { selector: '[data-region="compare-statement"] > p:first-child', card: () => "compare", block: true },
  { selector: '[data-region="layers"]', card: term("layers") },
  { selector: '[data-region="filters"]', card: term("filters") },
  // Terms the workspace names where they appear: the key, the queue's lead, the card's reasons and its total.
  { selector: "[data-term]", card: (e) => `term:${(e as HTMLElement).dataset.term}` },
];

export interface Marked {
  readonly element: Element;
  readonly card: CardId;
  readonly block: boolean;
}

/** Every element help mode marks under `root`, in screen order of the rules, visible ones only. */
export function marksIn(root: ParentNode, ctx: MarkContext): Marked[] {
  const out: Marked[] = [];
  const seen = new Set<Element>();
  for (const rule of MARKS) {
    let index = 0;
    for (const element of root.querySelectorAll(rule.selector)) {
      if (seen.has(element) || element.getClientRects().length === 0) continue;
      if (element.closest("[data-guidance]")) continue;
      const card = rule.card(element, index, ctx);
      index += 1;
      if (!card) continue;
      seen.add(element);
      out.push({ element, card, block: !!rule.block });
    }
  }
  return out;
}

/** The marked element for a glossary entry (a term key or `rule:<id>`), for Show where; null when none shows. */
export function markFor(root: ParentNode, ctx: MarkContext, entry: string): Element | null {
  const card = entry.startsWith("rule:") ? entry : `term:${entry}`;
  return marksIn(root, ctx).find((m) => m.card === card)?.element ?? null;
}
