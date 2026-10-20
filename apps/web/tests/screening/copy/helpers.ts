/**
 * Shared pieces of the copy tests: the text guards, an ordinal written independently of the copy, fixtures that
 * come from the API's own saved responses, and a builder for the school shapes the fixtures do not hold.
 */
import { RULE_IDS, ruleName } from "@/lib/screening/copy";
import type { copyFor } from "@/lib/screening/copy";
import { BANNED, type LaterCopy } from "@/lib/screening/copy/later";
import type {
  CopyCohort,
  CopyRuleId,
  CopySchool,
  NeedField,
  PlacedSchool,
  RecordedContribution,
  ResultsByRule,
} from "@/lib/screening/copy";

import { parseWith } from "@/lib/screening/schema";

import { readFixture } from "../fixtures";
import {
  type CompareResponse,
  type InputsResponse,
  type ResultsResponse,
  type SchoolDetailResponse,
  compareResponse,
  inputsResponse,
  resultsResponse,
  schoolDetailResponse,
} from "@/lib/screening/types";

/* ------------------------------------------------------------ text guards */

const TEXT_RULES: [RegExp, string][] = [
  [/undefined|NaN|\bnull\b|\[object|Infinity/, "leaked value"],
  [/ {2,}/, "double space"],
  [/^\s|\s$/, "leading or trailing space"],
  [/\s[,.;:!?]/, "space before punctuation"],
  [/[,;:]\s*[.,;:]/, "empty clause"],
  [/\.\./, "double full stop"],
  [/\(\s*\)/, "empty brackets"],
  [/\b(and|or|of|the|a|an|to|with|for)\s*[.,;:]/i, "dangling word before punctuation"],
  [/[.!?]\s+[a-z]/, "sentence starts in lowercase"],
  [/\d\.\d{4,}/, "unrounded number"],
  [/[\u2013\u2014]/, "en or em dash"],
  [/[\u2018\u2019\u201C\u201D]/, "curly quote"],
];

/** Independent of the copy, so a broken ordinal cannot vouch for itself. */
export function englishOrdinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][n % 10]}`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAME_RES = RULE_IDS.map((id) => new RegExp(escapeRe(ruleName(id)), "ig"));

export interface TextOptions {
  /** Must end with a full stop or a question mark. */
  sentence?: boolean;
  /** Plain copy: no banned words, no bare rule letters, no keyboard hints. */
  plain?: boolean;
  /** Keyboard hints are allowed. */
  keys?: boolean;
  /** Names of schools in the text, which may contain letters that look like rule letters. */
  schoolNames?: readonly string[];
}

/** Every way the text breaks the writing rules. Empty when it is clean. */
export function textProblems(text: unknown, options: TextOptions = {}): string[] {
  const { sentence = true, plain = true, keys = false, schoolNames = [] } = options;
  if (typeof text !== "string" || text.length === 0) return ["empty or not a string"];
  const problems: string[] = [];
  for (const [re, message] of TEXT_RULES) if (re.test(text)) problems.push(message);
  if (sentence && !/[.?]$/.test(text)) problems.push("does not end with a full stop");
  for (const m of text.matchAll(/\b(\d+)(st|nd|rd|th)\b/g)) {
    if (englishOrdinal(Number(m[1])) !== m[0]) problems.push(`wrong ordinal ${m[0]}`);
  }
  if (!plain) return problems;
  for (const b of BANNED) if (b.pattern.test(text)) problems.push(`banned word ${b.pattern}`);
  let bare = text;
  for (const re of NAME_RES) bare = bare.replace(re, "");
  for (const n of [...schoolNames].sort((x, y) => y.length - x.length)) if (n) bare = bare.split(n).join("");
  const letters = bare.match(/\b(S0|NF0|NF|T0)\b|(?<![\w'/-])(S|T|B)(?![\w'/-])/g);
  if (letters) problems.push(`rule letter without its plain name: ${letters.join(", ")}`);
  if (text === "Place" || /\b(its|a|the|same) place\b(?! in the list)/i.test(text))
    problems.push('bare "place"');
  if (/progress|moving on/i.test(text) && !/Grade 7/.test(text))
    problems.push('progression without "Grade 7"');
  if (/×/.test(text)) problems.push("a share shown as a multiplier");
  if (!keys && /PgDn|Page Down|press Enter|Tab to\b|\bEsc\b/.test(text))
    problems.push("keyboard hint in plain copy");
  return problems;
}

/** Collects `label: problem` lines over many strings so a failure names every offender at once. */
export class Corpus {
  readonly problems: string[] = [];
  readonly texts: [string, string][] = [];
  checked = 0;

  add(label: string, text: unknown, options?: TextOptions): void {
    this.checked += 1;
    if (typeof text === "string") this.texts.push([label, text]);
    for (const p of textProblems(text, options))
      this.problems.push(`${label}: ${p}\n    ${JSON.stringify(text)}`);
  }
}

/** The fixed copy of a bound or unbound system, through the writing guards. */
const ANALYST_STRINGS = new Set(["caveat", "caveatAnalyst", "persistentFlagMethod"]);
const LABEL_STRINGS = new Set(["notRecorded", "noReading", "notPlaced", "cannotWorkOut", "noResult"]);

export type FixedCopy = Pick<ReturnType<typeof copyFor>, "TERMS" | "STRINGS" | "IDEAS" | "LAYOUT"> &
  Pick<LaterCopy, "HOW_IT_WORKS" | "FIRST_QUESTIONS">;

/** A bound copy together with the part that loads on demand, for tests that read both. */
export async function withLater<T extends { later(): Promise<LaterCopy> }>(P: T): Promise<T & LaterCopy> {
  return { ...P, ...(await P.later()) };
}

export function addFixedCopy(corpus: Corpus, P: FixedCopy, tag: string): void {
  for (const [k, t] of Object.entries(P.TERMS)) {
    corpus.add(`${tag} TERMS.${k}.label`, t.label, { sentence: false });
    corpus.add(`${tag} TERMS.${k}.line`, t.line);
    corpus.add(`${tag} TERMS.${k}.help`, t.help);
  }
  for (const [k, v] of Object.entries(P.STRINGS)) {
    corpus.add(`${tag} STRINGS.${k}`, v, { sentence: !LABEL_STRINGS.has(k), plain: !ANALYST_STRINGS.has(k) });
  }
  for (const [k, v] of Object.entries(P.IDEAS)) {
    corpus.add(`${tag} IDEAS.${k}.title`, v.title, { sentence: false });
    corpus.add(`${tag} IDEAS.${k}.short`, v.short);
    corpus.add(`${tag} IDEAS.${k}.long`, v.long);
  }
  for (const s of P.HOW_IT_WORKS) {
    corpus.add(`${tag} HOW_IT_WORKS.${s.key}.title`, s.title, { sentence: false });
    s.sentences.forEach((t, i) => corpus.add(`${tag} HOW_IT_WORKS.${s.key}[${i}]`, t));
  }
  for (const q of P.FIRST_QUESTIONS) {
    corpus.add(`${tag} FIRST_QUESTIONS.${q.key}.question`, q.question);
    corpus.add(`${tag} FIRST_QUESTIONS.${q.key}.answer`, q.answer);
  }
  corpus.add(`${tag} LAYOUT.amongAll124`, P.LAYOUT.amongAll124, { sentence: false });
}

/* ---------------------------------------------------- the API's own saved responses */

export const RULES: readonly CopyRuleId[] = RULE_IDS;

export const fixtureResults = (rule: string, upper = false): ResultsResponse =>
  parseWith(resultsResponse, readFixture(`results/${rule}${upper ? ".upper" : ""}.json`), `results/${rule}`);

export const fixtureDetail = (key: string): SchoolDetailResponse =>
  parseWith(schoolDetailResponse, readFixture(`schools/${key}.json`), `schools/${key}`);

export const fixtureInputs = (): InputsResponse =>
  parseWith(inputsResponse, readFixture("inputs.json"), "inputs");

export const fixtureCompare = (): CompareResponse =>
  parseWith(compareResponse, readFixture("compare/additive_u__additive_no_u.json"), "compare");

/** The four saved school details, by what they show. */
export const KEYS = {
  complete: "4e65114f0b8790b6b906088a6d549020", // Sample School 08
  interval: "299ec8fe96b5bb7a121b9d6ff0aaddf9", // Sample School 17
  queueTeacherHouses: "52f5775bbd7f52d844925499e8c3aa83", // Sample School 21
  completeWithRange: "369ff3a44a83d14b6ed9f102fe1b458c", // Sample School 05: one place, and a range once the range schools count
} as const;

/* -------------------------------------------------------- a builder for other shapes */

const NEED_FIELDS: readonly NeedField[] = [
  "permanent_classroom_deficit",
  "teacher_housing_deficit",
  "facility_presence_deficit",
  "service_deficit",
  "locality_disadvantage",
];

const contribution = (urgency: boolean): RecordedContribution => ({
  components: {
    permanent_classroom_deficit: 0.12,
    teacher_housing_deficit: 0.096,
    facility_presence_deficit: 0.08,
    service_deficit: 0.072,
    locality_disadvantage: 0.108,
    area: 0.0825,
    ...(urgency ? { urgency: 0.0105 } : {}),
    reach: 0.033,
    aqi_lower: 0.023,
    aqi_upper: 0.023,
    emissions_lower: 0.041,
    emissions_upper: 0.041,
    land_lower: 0.0175,
    land_upper: 0.0175,
  },
});

export interface SchoolSpec {
  id: string;
  name?: string | null;
  province?: string | null;
  district?: string | null;
  locality?: string | null;
  cohort?: CopyCohort;
  /** The place among the schools with every input recorded, under every rule. */
  place?: number;
  /** The best and worst place among the schools that can be put in order. */
  bounds?: [number, number];
  /** Equal for two schools makes them tie. */
  score?: number;
  need?: number;
  secondary?: number;
  /** Readings left blank. */
  blank?: ("aqi" | "emissions" | "land")[];
  condition?: Partial<CopySchool["condition"]>;
  power?: string | null;
  water?: string | null;
  gate?: NeedField[];
}

const RULE_LIST: readonly CopyRuleId[] = RULE_IDS;

/** A whole school record with every field present and consistent, for the shapes the saved fixtures lack. */
export function school(spec: SchoolSpec): CopySchool {
  const cohort = spec.cohort ?? "complete";
  const blank = new Set(spec.blank ?? []);
  const results: ResultsByRule = {};
  if (cohort !== "queue") {
    for (const r of RULE_LIST) {
      const nf = r === "need_first_u" || r === "need_first_no_u";
      results[r] = {
        rank_complete120: cohort === "complete" ? (spec.place ?? 1) : null,
        rank_best: spec.bounds ? spec.bounds[0] : (spec.place ?? 1),
        rank_worst: spec.bounds ? spec.bounds[1] : (spec.place ?? 1),
        rank_bounds_scope: "eligible124",
        ...(nf
          ? { school_need: spec.need ?? 0.8, secondary_score_lower: spec.secondary ?? 0.2 }
          : { score_point: spec.score ?? 0.5 }),
      };
    }
  }
  const gate = spec.gate ?? [];
  const needParts = Object.fromEntries(NEED_FIELDS.map((f) => [f, gate.includes(f) ? null : 0.5])) as Record<
    NeedField,
    number | null
  >;
  return {
    id: spec.id,
    name: spec.name === undefined ? `School ${spec.id}` : spec.name,
    province: spec.province === undefined ? "Highlands" : spec.province,
    district: spec.district === undefined ? "Middle" : spec.district,
    locality: spec.locality === undefined ? "Remote" : spec.locality,
    cohort,
    missing_env: { aqi: blank.has("aqi"), emissions: blank.has("emissions"), land: blank.has("land") },
    condition: {
      teachers: 10,
      classrooms_total: 8,
      classrooms_permanent: 2,
      teacher_houses: 4,
      libraries: 1,
      workshops: 0,
      practical_skills: 0,
      home_economics: 0,
      computer_labs: 0,
      specialized_classrooms: 1,
      power_source: spec.power === undefined ? "Generator" : spec.power,
      water_source: spec.water === undefined ? "Tank Water" : spec.water,
      ...spec.condition,
    },
    need_parts: needParts,
    area_parts: {
      progression10_deficit: 0.4,
      progression12_deficit: 0.7,
      secondary_participation_deficit: 0.3,
      activity_deficit: 0.2,
      conflict_exposure: 0.1,
      female_disadvantage: 0.2,
    },
    components: {
      N: gate.length ? null : 0.8,
      A: 0.55,
      U: 0.21,
      R: 0.66,
      Q: blank.has("aqi") ? null : 0.46,
      E: blank.has("emissions") ? null : 0.82,
      L: blank.has("land") ? null : 0.35,
    },
    raw: {
      Q_raw: blank.has("aqi") ? null : 83,
      E_raw: blank.has("emissions") ? null : 490,
      L_raw: blank.has("land") ? null : 0.35,
    },
    gate_failures: gate,
    results,
    contributions:
      cohort === "queue" ? {} : { additive_u: contribution(true), additive_no_u: contribution(false) },
  };
}

export const placed = (s: CopySchool): PlacedSchool => s;
