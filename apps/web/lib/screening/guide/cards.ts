/**
 * Help mode's cards: what a marked term, rule, place or comparison explains, with an "In this data" example from a
 * teaching school chosen by role (R13). When the example's school is the one already open in the school card, the
 * next school of the same role stands in, so a card never repeats a sentence the screen already shows.
 */
import type { BoundCopy, CopyRuleId, CopySchool, InputKey, Segments, TermKey } from "../copy";
import { isCopyRuleId } from "../copy";
import { RULE_PAIR } from "../rule-pair";

import type { CardId } from "./machine";
import { type Roles, besides, onlyRemoteness } from "./roles";

export interface Example {
  /** The school's name above an example that does not name it. */
  readonly who?: string;
  /** A short label before the example, such as the rule it is under. */
  readonly label?: string;
  readonly text: Segments;
  /** The school the example is about, which "Show on map" selects. */
  readonly school?: string;
}

export interface CardModel {
  readonly eyebrow: string;
  readonly title: string;
  /** What is missing from an incomplete record, as chips. */
  readonly chips?: readonly string[];
  readonly line: string;
  readonly body?: string;
  /** What adds most to a school's score. */
  readonly receipt?: {
    readonly rows: readonly { readonly label: string; readonly value: number }[];
    readonly rest: number;
    readonly total: number;
  };
  readonly examples: readonly Example[];
  readonly note?: string;
  /** Read more. */
  readonly help?: string;
  /** The glossary entry: a term key or `rule:<id>`. */
  readonly gloss: string;
  /** The school "Show on map" selects. */
  readonly school?: string;
}

export interface CardContext {
  readonly copy: BoundCopy;
  readonly roles: Roles;
  /** The rule on screen. */
  readonly rule: CopyRuleId;
  readonly schools: readonly CopySchool[];
  /** The school open in the school card. */
  readonly open: string | null;
  /** The glossary's group headings, for a term card's eyebrow. */
  readonly groups: readonly { readonly heading: string; readonly keys: readonly string[] }[];
}

const NEED_INPUT: Partial<Record<TermKey, InputKey>> = {
  need_classrooms: "classrooms",
  need_housing: "housing",
  need_facilities: "facilities",
  need_services: "services",
  need_locality: "locality",
};
const GATE_OF: Partial<Record<TermKey, string>> = {
  missing_classrooms: "permanent_classroom_deficit",
  missing_housing: "teacher_housing_deficit",
  missing_facilities: "facility_presence_deficit",
  missing_services: "service_deficit",
};
const DRIVER_TERM: Record<InputKey, TermKey> = {
  classrooms: "need_classrooms",
  housing: "need_housing",
  facilities: "need_facilities",
  services: "need_services",
  locality: "need_locality",
  area: "area_context",
  urgency: "urgency",
  reach: "reach",
  air: "air_quality",
  emissions: "emissions",
  land: "land_cover",
};
const NEED_KEYS = ["classrooms", "housing", "facilities", "services", "locality"] as const;

const plain = (text: string): Segments => [text];

/** The examples for a term, and the note under them. */
function examplesFor(ctx: CardContext, key: string): { examples: Example[]; note?: string } {
  const { copy, roles, rule, open } = ctx;
  const { STRINGS, IDEAS } = copy;
  const first = besides(roles.complete, open);
  const range = besides(roles.ranges, open);
  const placeOf = (s: CopySchool | null, opts: { shortlist?: number } = {}): Example[] =>
    s ? [{ text: copy.segments.rankSentence(s, rule, { name: true, ...opts }), school: s.id }] : [];
  // An example about another school can still say word for word what the open card says (two schools with no
  // facility of the six read the same), so the example is the first school of its role whose sentence differs.
  const openSchool = open ? (ctx.schools.find((x) => x.id === open) ?? null) : null;
  const said = (school: CopySchool, text: (s: CopySchool) => string): string | null => {
    try {
      return text(school);
    } catch {
      return null;
    }
  };
  const about = (
    candidates: CopySchool | null | undefined | readonly CopySchool[],
    text: (s: CopySchool) => string
  ): Example[] => {
    const list: readonly CopySchool[] = Array.isArray(candidates)
      ? candidates
      : candidates
        ? [candidates as CopySchool]
        : [];
    const onCard = openSchool ? said(openSchool, text) : null;
    const s =
      list.find((x) => x.id !== open && said(x, text) !== null && said(x, text) !== onCard) ??
      list.find((x) => x.id !== open) ??
      null;
    return s ? [{ who: copy.distinctName(s), text: plain(text(s)), school: s.id }] : [];
  };
  const incomplete = roles.missing
    ? [roles.missing, ...roles.incomplete.filter((s) => s !== roles.missing)]
    : [];
  switch (key) {
    case "rank":
    case "mark_dot":
      return { examples: placeOf(first), note: IDEAS.notVerdict.short };
    case "rank_range":
    case "mark_range":
      return { examples: placeOf(range, { shortlist: 20 }), note: IDEAS.ranges.short };
    case "list_order":
      return { examples: placeOf(range, { shortlist: 20 }) };
    case "cohort_complete":
    case "cohort_ranked":
      return { examples: placeOf(range), note: STRINGS.groupsMeaning };
    case "score":
      return { examples: about(roles.complete, (s) => copy.reasonSentence(s, rule)) };
    case "queue":
    case "mark_ring":
    case "not_placed":
      return {
        examples: about(incomplete, (s) => copy.missingSentence(s, rule)),
        note: IDEAS.queue.short,
      };
    case "missing_all_but_remoteness":
      return { examples: about(roles.incomplete.find(onlyRemoteness), (s) => copy.missingSentence(s, rule)) };
    case "missing_classrooms":
    case "missing_housing":
    case "missing_facilities":
    case "missing_services": {
      const gate = GATE_OF[key as TermKey]!;
      const only = roles.incomplete.find((s) => s.gate_failures.length === 1 && s.gate_failures[0] === gate);
      const any = roles.incomplete.find((s) => (s.gate_failures as readonly string[]).includes(gate));
      return { examples: about(only ?? any, (s) => copy.missingSentence(s, rule)) };
    }
    case "unknown_value": {
      const s = roles.incomplete.find((x) => NEED_KEYS.some((k) => copy.missingValueKind(x, k) === "blank"));
      const k = s ? NEED_KEYS.find((n) => copy.missingValueKind(s, n) === "blank")! : "classrooms";
      return { examples: about(s, (x) => copy.missingValueNote(x, k)) };
    }
    case "unusable_value": {
      const s = roles.incomplete.find((x) =>
        NEED_KEYS.some((k) => copy.missingValueKind(x, k) === "unusable")
      );
      const k = s ? NEED_KEYS.find((n) => copy.missingValueKind(s, n) === "unusable")! : "classrooms";
      return { examples: about(s, (x) => copy.missingValueNote(x, k)) };
    }
    case "not_calculable":
      return { examples: about(incomplete, (s) => copy.missingValueNote(s, "need")) };
    case "source":
      return { examples: [{ text: plain(STRINGS.source) }] };
    case "school_need": {
      const s = roles.reasons ? [roles.reasons, ...roles.complete] : roles.complete;
      return { examples: about(s, (x) => copy.reasonSentence(x, "need_first_no_u")) };
    }
    case "need_classrooms":
    case "need_housing":
    case "need_facilities":
    case "need_services":
    case "need_locality":
      return { examples: about(roles.complete, (s) => copy.inputSentence(s, NEED_INPUT[key as TermKey]!)) };
    case "area_context":
    case "area_grade10":
    case "area_grade12":
    case "area_secondary":
    case "area_activity":
    case "area_conflict":
    case "area_girls":
      return { examples: about(roles.complete, (s) => copy.inputSentence(s, "area")) };
    case "urgency": {
      const s = besides(
        roles.complete.filter((x) => (x.components.U ?? 0) > 0),
        open
      );
      return {
        examples: s
          ? [
              ...about(s, (x) => copy.inputSentence(x, "urgency")),
              ...RULE_PAIR.map((id) => ({
                label: copy.ruleShortName(id),
                text: plain(copy.rankSentence(s, id)),
              })),
            ]
          : [],
        note: copy.urgencyNote(rule),
      };
    }
    case "reach":
      return { examples: about(roles.complete, (s) => copy.inputSentence(s, "reach")) };
    case "air_quality":
      return {
        examples: [
          ...about(roles.complete, (s) => copy.inputSentence(s, "air")),
          ...about(roles.ranges, (s) => copy.inputSentence(s, "air")),
        ],
        note: STRINGS.separateMeasures,
      };
    case "emissions":
      return {
        examples: about(
          roles.complete.find((s) => (s.raw.E_raw ?? 0) > 0),
          (s) => copy.inputSentence(s, "emissions")
        ),
        note: STRINGS.separateMeasures,
      };
    case "land_cover":
      return {
        examples: about(
          roles.complete.find((s) => (s.raw.L_raw ?? 0) > 0.05) ??
            roles.complete.find((s) => (s.raw.L_raw ?? 0) > 0),
          (s) => copy.inputSentence(s, "land")
        ),
        note: STRINGS.separateMeasures,
      };
    case "rule_roles":
      return {
        examples: RULE_PAIR.map((id) => ({
          label: copy.ruleLabel(id),
          text: plain(copy.ruleRelation(id)),
        })),
      };
    case "filters":
      return { examples: [{ text: plain(copy.scope(rule).filterNote) }] };
    case "screening":
    case "inspection":
      return { examples: [{ text: plain(STRINGS.caveatPlain) }] };
    case "persistent_flag":
      // Each rule the test ran for has its own words; they are never read as the other's.
      return {
        examples: (["additive_no_u", "additive_u"] as const).map((id) => ({
          label: copy.ruleLabel(id),
          text: plain(STRINGS.persistentFlag[id]),
        })),
      };
    case "rule":
      return { examples: [{ text: plain(STRINGS.defaultRuleNote) }] };
    default:
      return { examples: [] };
  }
}

const schoolOf = (ctx: CardContext, id: string) => ctx.schools.find((s) => s.id === id) ?? null;

/** The card a mark opens, or null for an id the data does not hold. */
export function cardModel(ctx: CardContext, id: CardId): CardModel | null {
  const { copy, rule } = ctx;
  const { TERMS, STRINGS, IDEAS } = copy;
  const [kind, ...rest] = id.split(":");
  const arg = rest.join(":");
  if (kind === "term") {
    const t = (TERMS as Record<string, (typeof TERMS)[TermKey] | undefined>)[arg];
    if (!t) return null;
    const { examples, note } = examplesFor(ctx, arg);
    const group = ctx.groups.find((g) => g.keys.includes(arg));
    return {
      eyebrow: group?.heading ?? "",
      title: t.label,
      line: t.line,
      examples,
      note,
      help: t.help,
      gloss: arg,
    };
  }
  if (kind === "rule") {
    if (!isCopyRuleId(arg)) return null;
    const top = ctx.schools.find((s) => s.results?.[arg]?.rank_complete120 === 1) ?? null;
    return {
      eyebrow: copy.ruleRoleLine(arg),
      title: copy.ruleLabel(arg),
      line: copy.ruleOneLine(arg),
      body: copy.ruleExplanation(arg),
      examples:
        top && top.id !== ctx.open ? [{ text: copy.segments.rankSentence(top, arg, { name: true }) }] : [],
      note: copy.urgencyNote(arg),
      gloss: `rule:${arg}`,
    };
  }
  if (kind === "place") {
    const s = schoolOf(ctx, arg);
    if (!s) return null;
    const title = copy.distinctName(s);
    if (s.cohort === "queue")
      return {
        eyebrow: STRINGS.notPlaced,
        title,
        chips: copy.missingLabels(s),
        line: TERMS.queue.line,
        body: IDEAS.queue.long,
        examples: [],
        note: STRINGS.queueOrder,
        gloss: "queue",
        school: s.id,
      };
    if (s.cohort === "interval")
      return {
        eyebrow: TERMS.rank_range.label,
        title,
        line: TERMS.rank_range.line,
        body: IDEAS.ranges.long,
        examples: [],
        note: TERMS.list_order.line,
        gloss: "rank_range",
        school: s.id,
      };
    const drivers = copy.topDrivers(s, rule);
    const all = copy.contributions(s, rule);
    const total = s.results?.[rule]?.score_point;
    const named = new Set(drivers.map((d) => d.key));
    const receipt =
      all && typeof total === "number" && !rule.startsWith("need_first")
        ? {
            rows: drivers.map((d) => ({ label: TERMS[DRIVER_TERM[d.key]].label, value: d.value })),
            rest: Object.entries(all)
              .filter(([k, v]) => !named.has(k as InputKey) && typeof v === "number")
              .reduce((sum, [, v]) => sum + (v as number), 0),
            total,
          }
        : undefined;
    return {
      eyebrow: TERMS.rank.label,
      title,
      line: TERMS.rank.line,
      receipt,
      examples: [],
      note: IDEAS.notVerdict.short,
      help: TERMS.rank.help,
      gloss: "rank",
      school: s.id,
    };
  }
  if (id === "compare-main") {
    const s = besides(
      ctx.roles.complete.filter((x) => (x.components.U ?? 0) > 0),
      ctx.open
    );
    return {
      eyebrow: TERMS.compare.label,
      title: TERMS.urgency.label,
      line: copy.defaultListStatementLong(),
      body: TERMS.urgency.help,
      examples: s
        ? [
            { who: copy.distinctName(s), text: plain(copy.inputSentence(s, "urgency")) },
            ...RULE_PAIR.map((r) => ({
              label: copy.ruleShortName(r),
              text: plain(copy.rankSentence(s, r)),
            })),
          ]
        : [],
      note: STRINGS.comparisonSource,
      gloss: "urgency",
    };
  }
  if (id === "compare")
    return {
      eyebrow: TERMS.compare.label,
      title: TERMS.compare.label,
      line: TERMS.compare.line,
      body: TERMS.compare.help,
      examples: [],
      note: STRINGS.comparisonSource,
      gloss: "compare",
    };
  return null;
}
