/**
 * What the two parity suites share: the prototype loader, the design data, and the leaf-by-leaf comparison.
 * Everything here is test code; the design folder holds real school data and is never committed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- the prototype is a foreign JavaScript module */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect } from "vitest";

export const ROOT = process.env.RISE_PNG_DESIGN_ROOT;
export const ready = !!ROOT && existsSync(path.join(ROOT, "prototype/shared/copy.js"));

export type Api = Record<string, any>;
export type Outcome = { ok: true; value: unknown } | { ok: false; name: string; message: string };

export const run = (fn: () => unknown): Outcome => {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    // The class matters as well as the message: a ParseError and an Error are two behaviours for a caller.
    return e instanceof Error
      ? { ok: false, name: e.name, message: e.message }
      : { ok: false, name: typeof e, message: String(e) };
  }
};

/** Sample arguments for every function a static object holds, so a new function cannot go unchecked. */
export const FN_ARGS: Record<string, unknown[][]> = {
  "LAYOUT.otherRulesCount": [[5], [0]],
  "LAYOUT.backToCirculated": [["Combined factors, with urgency"], ["x"]],
  "LAYOUT.notComputedGroup": [["Need first, no urgency", 4]],
  "LAYOUT.listTitle": [[20, "the combined-factors rule with urgency (S)"]],
  "LAYOUT.fingerprints": [[15], [1]],
  "LAYOUT.afterDownload": [["the top list"]],
  "LAYOUT.viewOf": [[2, 4]],
  "LAYOUT.positionOf": [[3, 20]],
  "LAYOUT.placeRange": [["3rd", "12th"]],
  "LAYOUT.valueRange": [["0.487", "0.537"]],
  "LAYOUT.underRule": [["Place in the list", "the combined-factors rule with urgency (S)"]],
  "LAYOUT.groupMany": [[2], [5], [1]],
  "LAYOUT.addedBy": [["School need"], ["Air quality"]],
  "LAYOUT.tooltipMissing": [["classroom count blank, power source blank"]],
  "LAYOUT.tipNotComputed": [["Need first"]],
  "LAYOUT.savedToast": [[3]],
  "LAYOUT.removeView": [["Top of the list"], ["J"]],
  "METHOD.list.wasUnder": [["14th", "the benchmark"]],
  "METHOD.list.rankUnder": [["the benchmark", 9]],
  "METHOD.samePlaceUnder": [["the benchmark"]],
  "METHOD.moved.eyebrow": [["the benchmark"]],
  "METHOD.queue.order": [
    [true, 3, 9],
    [false, 9, 9],
  ],
  "METHOD.compare.pickAria": [["on the left"]],
  "METHOD.compare.enteringK": [[10], [20]],
  "METHOD.compare.leavingK": [[10], [20]],
  "METHOD.compare.slopeMid": [[16], [1], [0], [undefined]],
  "METHOD.compare.slopeBreak": [
    [10, 16],
    [20, 16],
    [10, undefined],
    [10, 8],
  ],
  "METHOD.compare.rangesSub": [
    [],
    [{ ranked: 21 }, { ranked: 21 }],
    [{ ranked: 21 }, { ranked: 22 }],
    [{ ranked: 21 }, undefined],
  ],
  "METHOD.compare.rangesNote": [[20]],
  "METHOD.compare.moveWords": [
    [-1, "the benchmark"],
    [3, "the benchmark"],
  ],
  "METHOD.compare.topBoth": [[10]],
  "METHOD.compare.topEnters": [[20]],
  "METHOD.compare.topLeaves": [[20]],
  "METHOD.compare.legendTitle": [["S", "B"]],
  "METHOD.compare.legendSub": [
    [16, 10],
    [undefined, 10],
    [4, 4],
  ],
  "METHOD.compare.legendSize": [[10, "S", "B"]],
  "METHOD.compare.tipMove": [["S", "3rd", "B", "5th", "Up 2 places under B"]],
  "METHOD.compare.tipRange": [
    ["S", "3rd to 5th", "B", "4th", { ranked: 21 }, { ranked: 21 }],
    ["S", "a", "B", "b", { ranked: 21 }, { ranked: 22 }],
  ],
  "METHOD.compare.sameTop": [
    ["S", "B", 10, 16],
    ["S", "B", 20, undefined],
  ],
  "METHOD.compare.shareTop": [
    ["S", "B", 9, 10, 16],
    ["S", "B", 9, 10, undefined],
  ],
  "METHOD.compare.moveBins": [[], [[2, 9]]],
  "METHOD.insp.amongComplete": [["the benchmark"]],
  "METHOD.insp.bestToWorst": [["the benchmark"]],
  "METHOD.insp.coincide": [["the benchmark"]],
  "METHOD.insp.noResultUnder": [["the benchmark"]],
  "METHOD.insp.inputsUnder": [["the benchmark"]],
  "METHOD.insp.trackNote": [["the benchmark"]],
  "METHOD.insp.addsBetween": [["0.10", "0.20"]],
  "METHOD.insp.across": [[], [7], [3]],
  "METHOD.insp.noSplitBoth": [["the benchmark"]],
  "METHOD.insp.times": [["12/19"]],
  "METHOD.insp.partRecorded": [["Teacher housing"]],
  "METHOD.legend.title": [["the benchmark"]],
  "METHOD.legend.sub": [[10], [3]],
  "METHOD.layers.items.numerals": [[10], [3]],
  "METHOD.filter.chipProvince": [["Highlands"]],
  "METHOD.filter.remove": [["Province: Highlands"]],
  "METHOD.sheet.title": [[20, "the benchmark"]],
  "METHOD.sheet.lede": [
    [20, "the benchmark", true],
    [20, "the benchmark", false],
  ],
  "METHOD.sheet.ledeCompare": [["the benchmark"]],
  "METHOD.sheet.noneTop": [[20]],
  "METHOD.sheet.possible": [[20]],
  "METHOD.sheet.possibleNone": [[20]],
  "METHOD.sheet.normalizationV": [[25], [undefined]],
  "METHOD.sheet.showsCompare": [["S", "B"]],
  "METHOD.sheet.comparedWith": [["the benchmark"]],
  "METHOD.sheet.generatedAt": [["2026-10-21"]],
  "METHOD.manifest.rule": [["B", "benchmark", "Conventional benchmark"]],
  "METHOD.manifest.role": [["Reference"]],
  "METHOD.manifest.formula": [["B = 0.55N"]],
  "METHOD.manifest.weights": [["N 0.55"]],
  "METHOD.manifest.urgency": [["additive_u"], ["additive_no_u"]],
  "METHOD.manifest.shortlist": [[20]],
  "METHOD.manifest.ranges": [[true], [false]],
  "METHOD.manifest.filters": [["province Highlands"], [""]],
  "METHOD.manifest.filterProvince": [["Highlands"]],
  "METHOD.manifest.filterLocality": [["Remote"]],
  "METHOD.manifest.compared": [["B", "benchmark"]],
  "METHOD.manifest.normalization": [[25], [undefined]],
  "METHOD.manifest.fixture": [["2026-10-21"]],
  "METHOD.manifest.input": [["schools.json", "abc123"]],
  "METHOD.shareFraction": [[12, 19]],
  "METHOD.shareDenominator": [
    [{ N: 12 / 19, A: 3 / 19, R: 1 / 19 }],
    [{ N: 0.6, A: 0.15, U: 0.05 }],
    [{ N: 0.333, A: 0.5 }],
    [{}],
  ],
  "GUIDE.stepCount": [[1], [4]],
  "GUIDE.howCount": [[1], [6]],
  "GUIDE.seenCount": [[2, 5]],
  "GUIDE.rangeWords": [
    [5, 6],
    [5, 5],
  ],
  "GUIDE.seedViews.queue.onScreen": [["Incomplete records"]],
  "HELP.liveOn": [[25], [1]],
  "GUIDE.stepOf": [[1, 3]],
  "GUIDE.stepCounter": [[2, 5, 1, 3]],
  "GUIDE.pointToCard": [[3], [0], [12], [1]],
  "GUIDE.needNumbered": [
    [2, 3],
    [3, 3],
    [1, 1],
    [1, 3],
  ],
  "GUIDE.tasks[1].steps[0].title": [
    ["Alder Junior High School", "1st"],
    ["Alder Junior High School", null],
  ],
  "GUIDE.tasks[1].steps[1].title": [[true], [false]],
  "GUIDE.tasks[2].steps[0].title": [
    ["Larch High School", "anywhere from 12th to 18th"],
    ["Larch High School", null],
  ],
  "GUIDE.tasks[2].steps[0].tryIt": [
    ["A, B and C", 3],
    ["A, B and C", 0],
    ["A", 1],
  ],
  "GUIDE.tasks[2].steps[1].body": [["Birch", "Alder", "16th", "Hazel", "17th"]],
  "GUIDE.tasks[2].steps[2].body": [["Birch"]],
  "GUIDE.tasks[3].steps[0].title": [[31], [1], [0]],
  "GUIDE.tasks[3].steps[2].title": [["Rowan High"]],
  "GUIDE.tasks[4].steps[0].title": [[40], [null]],
  "GUIDE.tasks[4].steps[2].body": [["Larch High School"]],
  "GUIDE.tasks[4].steps[3].tryIt": [["Combined factors, with urgency"]],
};

/**
 * The prototype's value for `key` as the port must say it. Two differences are deliberate, because the port is
 * not to carry the design data's sizes into module-level copy:
 *  - an analyst label for a group names its size only when the counts are bound, and names none otherwise;
 *  - the reason a retired word is banned says "these are", not a count.
 */
/** The lines the port binds per rule instead of keeping on the fixed strings. */
export const SCOPE_KEYS = [
  "groups",
  "scopeComplete",
  "scopeRanked",
  "scopeShort",
  "scopeDetail",
  "filterNote",
  "listOrder",
  "listOrderUpper",
  "notComputedNote",
] as const;

/** The counts without the sizes of the groups, which belong to one rule; the port words the bound TERMS without them. */
export const groupFree = (counts: Record<string, number>): Record<string, number> =>
  Object.fromEntries(
    Object.entries(counts).filter(([k]) => !["complete", "range", "ranked", "queue"].includes(k))
  );
export const withoutScope = (strings: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(strings).filter(([k]) => !(SCOPE_KEYS as readonly string[]).includes(k)));

export function prototypeValue(key: string, value: any, counts?: Record<string, number>): any {
  if (key === "TERMS") {
    const groups: Record<string, [string, string]> = {
      cohort_complete: ["Complete-primary cohort", "complete"],
      cohort_ranked: ["Condition-eligible cohort", "ranked"],
      queue: ["Verification queue", "queue"],
    };
    const out: Record<string, any> = { ...value };
    for (const [term, [label, count]] of Object.entries(groups)) {
      const n = counts?.[count];
      const suffix =
        n !== undefined && Number.isInteger(n)
          ? `, ${n.toLocaleString("en-US")} ${n === 1 ? "school" : "schools"}`
          : "";
      out[term] = { ...value[term], technical: `${label}${suffix}` };
    }
    return out;
  }
  // The port keeps the group lines out of the fixed strings, so that they are said per rule (see `scope`).
  if (key === "STRINGS" || key === "buildStrings") return withoutScope(value);
  // The port binds the size of the ranked group per rule (`scope(ruleId).amongAll`).
  if (key === "LAYOUT") return { ...value, amongAll124: "Among all schools that can be put in order" };
  if (key === "BANNED") {
    return value.map((b: any) => ({ ...b, why: b.why.replace(/\bthe \d+ are\b/, "these are") }));
  }
  return value;
}

export const mismatches: string[] = [];
export const tally = { strings: 0, calls: 0, bothThrew: 0 };
export const note = (message: string) => {
  if (mismatches.length < 40) mismatches.push(message);
};
export const show = (v: unknown) =>
  typeof v === "string" ? JSON.stringify(v) : (JSON.stringify(v) ?? String(v));

/** Compares two values leaf by leaf and counts every string compared. */
export function same(label: string, a: unknown, b: unknown): void {
  if (typeof a === "function" || typeof b === "function") {
    if (typeof a !== typeof b) return note(`${label}: one side is a function`);
    const samples = FN_ARGS[label];
    if (!samples) return note(`${label}: no sample arguments for this function`);
    for (const args of samples)
      same(`${label}(${args.map(show).join(", ")})`, (a as any)(...args), (b as any)(...args));
    return;
  }
  if (typeof a === "string") {
    tally.strings += 1;
    if (a !== b) note(`${label}\n   prototype: ${show(a)}\n   port:      ${show(b)}`);
    return;
  }
  if (a instanceof RegExp) {
    if (!(b instanceof RegExp) || a.source !== b.source || a.flags !== b.flags)
      note(`${label}: pattern differs`);
    return;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length)
      return note(`${label}: array length ${a.length} vs ${Array.isArray(b) ? b.length : show(b)}`);
    a.forEach((x, i) => same(`${label}[${i}]`, x, b[i]));
    return;
  }
  if (a && typeof a === "object") {
    if (!b || typeof b !== "object") return note(`${label}: ${show(a)} vs ${show(b)}`);
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join("|") !== kb.join("|")) return note(`${label}: keys ${ka.join(",")} vs ${kb.join(",")}`);
    for (const k of ka) same(label ? `${label}.${k}` : k, (a as any)[k], (b as any)[k]);
    return;
  }
  if (!Object.is(a, b)) note(`${label}: ${show(a)} vs ${show(b)}`);
}

export function sameOutcome(label: string, a: Outcome, b: Outcome): void {
  tally.calls += 1;
  if (a.ok !== b.ok)
    return note(
      `${label}: the prototype ${a.ok ? "returned" : "threw"}, the port ${b.ok ? "returned" : "threw"}`
    );
  if (a.ok && b.ok) same(label, a.value, b.value);
  else if (!a.ok && !b.ok) {
    tally.bothThrew += 1;
    // Two different throws are two different behaviours, so the class and the message must agree.
    if (a.name !== b.name)
      note(`${label}: both threw, with different classes\n   prototype: ${a.name}\n   port:      ${b.name}`);
    if (a.message !== b.message)
      note(
        `${label}: both threw, with different messages\n   prototype: ${show(a.message)}\n   port:      ${show(b.message)}`
      );
  }
}

/**
 * The prototype is one dependency-free ES module outside this project, with only inline `export`s. Its source is
 * evaluated as it is, with the keyword dropped, so no loader or transform touches it.
 */
export function loadPrototype(file: string): Api {
  const source = readFileSync(file, "utf8");
  const names = [...source.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
  if (/^export (?!const |function )/m.test(source))
    throw new Error("copy.js has an export form this loader does not know");
  const body = source.replace(/^export (const|function) /gm, "$1 ");
  return new Function(`${body}\nreturn { ${names.join(", ")} };`)() as Api;
}

const read = (rel: string) => JSON.parse(readFileSync(path.join(ROOT as string, rel), "utf8"));

export interface Dataset {
  name: string;
  data: { schools: any[]; pairwise: any[]; top20Changes: any[] };
}
export const DATASET_DIRS: [string, string][] = [
  ["fixture", "data"],
  ["worst", "data/worst-case"],
  ["empty", "data/worst-case/empty"],
  ["one", "data/worst-case/one"],
  ["huge", "data/worst-case/huge"],
];

const LARGEST_RULES = ["bottleneck_u", "bottleneck_no_u"] as const;

/**
 * The record the API sends for a largest-factor rule, built from the design's combined-factors record and
 * components: 60% of each figure, and the 40% share of the largest of school need, district context and (with
 * urgency) the urgency value, naming every factor that ties for it. Undefined where the school lacks a part.
 */
export function largestRecord(s: any, id: (typeof LARGEST_RULES)[number]): any {
  const base = s.contributions?.[id === "bottleneck_u" ? "additive_u" : "additive_no_u"];
  if (!base || !s.components) return undefined;
  const { N, A, U } = s.components;
  const values: Record<string, number> = id === "bottleneck_u" ? { N, A, U } : { N, A };
  if (Object.values(values).some((v) => typeof v !== "number")) return undefined;
  const value = Math.max(...Object.values(values));
  return {
    components: Object.fromEntries(Object.entries(base.components).map(([k, v]) => [k, 0.6 * (v as number)])),
    largest: {
      factors: Object.keys(values).filter((k) => values[k] === value),
      value,
      share: 0.4,
      contribution: 0.4 * value,
    },
  };
}

/** The design data holds the combined-factors records only; the API also sends one for each largest-factor rule. */
export const withLargestRecords = (s: any): any => {
  if (s.cohort === "queue" || !s.contributions) return s;
  const added = LARGEST_RULES.flatMap((id) => {
    const rec = largestRecord(s, id);
    return rec ? [[id, rec]] : [];
  });
  return { ...s, contributions: { ...s.contributions, ...Object.fromEntries(added) } };
};

export function loadDatasets(): Dataset[] {
  return DATASET_DIRS.map(([name, dir]) => ({
    name,
    data: {
      schools: read(`${dir}/schools.json`).schools.map(withLargestRecords),
      pairwise: read(`${dir}/pairwise.json`),
      top20Changes: read(`${dir}/top20_changes.json`),
    },
  }));
}

export const flush = () => {
  const found = mismatches.splice(0);
  expect(found).toEqual([]);
};
