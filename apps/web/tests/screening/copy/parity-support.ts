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
export type Outcome = { ok: true; value: unknown } | { ok: false; message: string };

export const run = (fn: () => unknown): Outcome => {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
};

/** Sample arguments for every function a static object holds, so a new function cannot go unchecked. */
export const FN_ARGS: Record<string, unknown[][]> = {
  "LAYOUT.otherRulesCount": [[5], [0]],
  "LAYOUT.backToCirculated": [["Combined factors, with urgency"], ["x"]],
  "LAYOUT.notComputedGroup": [["Need first, no urgency", 4]],
  "LAYOUT.listTitle": [[20, "the combined-factors rule with urgency (S)"]],
  "LAYOUT.fingerprints": [[15]],
  "LAYOUT.afterDownload": [["the top list"]],
  "LAYOUT.viewOf": [[2, 4]],
  "HELP.liveOn": [[25]],
  "GUIDE.stepOf": [[1, 3]],
  "GUIDE.stepCounter": [[2, 5, 1, 3]],
  "GUIDE.pointToCard": [[3], [0], [12]],
  "GUIDE.needNumbered": [
    [2, 3],
    [3, 3],
  ],
  "GUIDE.needDots": [
    [2, 3],
    [3, 3],
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
  "GUIDE.tasks[3].steps[0].title": [[31], [1]],
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
    // Two different throws are two different behaviours, so the messages must agree too.
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

export function loadDatasets(): Dataset[] {
  return DATASET_DIRS.map(([name, dir]) => ({
    name,
    data: {
      schools: read(`${dir}/schools.json`).schools,
      pairwise: read(`${dir}/pairwise.json`),
      top20Changes: read(`${dir}/top20_changes.json`),
    },
  }));
}

export const flush = () => {
  const found = mismatches.splice(0);
  expect(found).toEqual([]);
};
