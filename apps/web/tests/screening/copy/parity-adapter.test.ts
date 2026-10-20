/**
 * Local-only parity through the adapter: the design records are turned into the screening API's response shapes,
 * parsed with the copy's schemas, mapped back by the adapter, and every sentence is compared with the prototype's
 * for the original records. It proves the adapter loses nothing the sentences read.
 *
 *   RISE_PNG_DESIGN_ROOT=/Users/sonle/Documents/work/ADB/adb-school-optimize/.audit-work/design/ui-20261020 npm test
 *
 * The inverse (design record to API response) is written here, apart from the adapter, from the API's own field
 * names (`services/api/app/models/screening.py`). It cannot say three things, so these are left out and counted:
 *  - a rule the design left no result for, which has no entry in an API response (the sentences then read "Not
 *    computed", as the prototype does for a null result);
 *  - the circulated candidate flag, which the API does not carry (both sides run without it);
 *  - a record whose list of blank need parts contradicts its own need parts, which the API cannot produce.
 *
 * Failure modes this guards:
 *  1. A field is renamed or regrouped wrongly, so a sentence quotes the wrong figure. Every sentence is compared.
 *  2. A blank turns into 0, or a 0 into a blank, on the way through. The worst-case sets hold both.
 *  3. A list row and a whole record disagree about a place. Both routes are compared with the prototype.
 *  4. The comparison rows lose a move or swap a direction. Every pair's sentences are compared.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- the design records are foreign JSON */
// @vitest-environment node
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as port from "@/lib/screening/copy";
import {
  countsFromResults,
  pairwiseFromCompare,
  placedFromResults,
  schoolFromDetail,
  wireCompare,
  wireResults,
  wireSchoolDetail,
} from "@/lib/screening/copy";
import { parseWith } from "@/lib/screening/schema";

import {
  type Api,
  DATASET_DIRS,
  type Dataset,
  ROOT,
  flush,
  loadDatasets,
  loadPrototype,
  mismatches,
  note,
  prototypeValue,
  ready,
  run,
  same,
  sameOutcome,
  tally,
} from "./parity-support";

const suite = describe.skipIf(!ready);
const VIEW = "additive_u";
const NEED_FIELDS = [
  "permanent_classroom_deficit",
  "teacher_housing_deficit",
  "facility_presence_deficit",
  "service_deficit",
  "locality_disadvantage",
];
const URGENCY_RULES = new Set(["additive_u", "need_first_u", "bottleneck_u", "benchmark"]);
const COHORT: Record<string, string> = {
  complete: "complete",
  interval: "interval",
  queue: "verification_queue",
};

let proto: Api;
let datasets: Dataset[] = [];
const skipped = { noResult: 0, inconsistentGate: 0, noAreaParts: 0, noPairRow: 0 };
/** What each left-out case was, so a test can say why it is left out rather than only how many. */
const leftOut = {
  noResult: [] as { cohort: string; rule: string }[],
  inconsistentGate: [] as { cohort: string; blank: string[]; gate: string[] }[],
  noAreaParts: [] as { cohort: string }[],
  noPairRow: [] as { n: unknown; median: unknown; maximum: unknown }[],
};

beforeAll(() => {
  if (!ready) return;
  proto = loadPrototype(path.join(ROOT as string, "prototype/shared/copy.js"));
  datasets = loadDatasets();
});

afterAll(() => {
  if (ready)
    console.log(
      `copy parity through the adapter: ${tally.strings} strings compared over ${tally.calls} calls; left out and counted: ${JSON.stringify(skipped)}`
    );
});

/* ------------------------------------------------- design record to API response */

const wireIdentity = (s: any) => ({
  school_key: s.id,
  source_school_name: s.name ?? "",
  province: s.province ?? null,
  district: s.district ?? null,
  locality: s.locality ?? null,
});

const wireComponents = (s: any, rule: string) => ({
  N: s.components.N ?? null,
  A: s.components.A ?? null,
  R: s.components.R ?? null,
  Q: s.components.Q ?? null,
  E: s.components.E ?? null,
  L: s.components.L ?? null,
  ...(URGENCY_RULES.has(rule) ? { U: s.components.U ?? null } : {}),
});

function wireScores(res: any, rule: string) {
  if (!res) return { lower: null, upper: null, point: null, sort_key_primary: null };
  if (rule.startsWith("need_first")) {
    return {
      lower: res.secondary_score_lower ?? null,
      upper: res.secondary_score_upper ?? null,
      point: null,
      sort_key_primary: res.school_need ?? null,
    };
  }
  return {
    lower: res.score_lower ?? null,
    upper: res.score_upper ?? null,
    point: res.score_point ?? null,
    sort_key_primary: null,
  };
}

// The adapter reads neither the label nor the count of a scope, only whether a bounds label is "eligible (N)".
const wirePoint = (res: any) => ({
  rank: res && Number.isInteger(res.rank_complete120) ? res.rank_complete120 : null,
  scope: "complete under this rule (1)",
  count: 1,
});
const wireBounds = (res: any) => ({
  best: res && Number.isInteger(res.rank_best) ? res.rank_best : null,
  worst: res && Number.isInteger(res.rank_worst) ? res.rank_worst : null,
  scope: "eligible (1)",
  count: 1,
});

/** One /results row, or null where the design has no result for the school under the rule. */
function wireRow(s: any, rule: string) {
  const res = s.results ? s.results[rule] : null;
  if (s.cohort !== "queue" && !res) return null;
  return {
    cohort: COHORT[s.cohort],
    components: wireComponents(s, rule),
    scores: wireScores(res, rule),
    point_rank: wirePoint(res),
    rank_bounds: wireBounds(res),
    school: wireIdentity(s),
  };
}

function wireResultsFor(data: Dataset["data"], rule: string) {
  const rows = data.schools.map((s) => wireRow(s, rule)).filter((r) => r !== null);
  const count = (c: string) => data.schools.filter((s) => s.cohort === c).length;
  return parseWith(
    wireResults,
    {
      run: { rule_id: rule },
      manifest: {
        cohort_counts: {
          records: data.schools.length,
          complete: count("complete"),
          interval: count("interval"),
          verification_queue: count("queue"),
        },
      },
      total_schools: rows.length,
      returned_schools: rows.length,
      rows,
    },
    `results/${rule}`
  );
}

/** The area parts under the API's own names. */
const wireArea = (a: any) => ({
  progression_g10_deficit: a.progression10_deficit ?? null,
  progression_g12_deficit: a.progression12_deficit ?? null,
  secondary_participation_deficit: a.secondary_participation_deficit ?? null,
  activity_scale_deficit: a.activity_deficit ?? null,
  conflict_exposure: a.conflict_exposure ?? null,
  female_disadvantage: a.female_disadvantage ?? null,
});

function wireContributions(s: any, rule: string) {
  const rec =
    s.cohort !== "queue" && (rule === "additive_u" || rule === "additive_no_u")
      ? s.contributions?.[rule]
      : null;
  if (!rec) return { contributions: [], need_part_contributions: null };
  const x = rec.components;
  const entry = (component: string, lower: number, upper = lower) => ({ component, lower, upper });
  return {
    contributions: [
      entry("N", 0),
      entry("A", x.area),
      ...(rule === "additive_u" ? [entry("U", x.urgency)] : []),
      entry("R", x.reach),
      entry("Q", x.aqi_lower, x.aqi_upper),
      entry("E", x.emissions_lower, x.emissions_upper),
      entry("L", x.land_lower, x.land_upper),
    ],
    need_part_contributions: Object.fromEntries(NEED_FIELDS.map((f) => [f, x[f]])),
  };
}

const INPUT_NAMES: Record<string, string> = {
  teachers: "teachers",
  classrooms_total: "total_classrooms",
  classrooms_permanent: "permanent_classrooms",
  teacher_houses: "teacher_houses",
  libraries: "libraries",
  workshops: "workshops",
  practical_skills: "practical_skills_buildings",
  home_economics: "home_economics_buildings",
  computer_labs: "computer_labs",
  specialized_classrooms: "specialized_classrooms",
  power_source: "power_source",
  water_source: "water_source",
};

/** One /schools/by-key response, or null when the API could not send this record. */
function wireDetail(s: any, rules: readonly string[]) {
  if (!s.area_parts) {
    leftOut.noAreaParts.push({ cohort: s.cohort });
    return skip("noAreaParts");
  }
  const nulls = NEED_FIELDS.filter((f) => s.need_parts[f] == null);
  if (JSON.stringify(nulls) !== JSON.stringify(s.cohort === "queue" ? s.gate_failures : [])) {
    leftOut.inconsistentGate.push({ cohort: s.cohort, blank: nulls, gate: s.gate_failures });
    return skip("inconsistentGate");
  }
  const inputs: Record<string, unknown> = {
    aqi_p95_selected: s.raw.Q_raw ?? null,
    emissions_co2e_100yr_10km_tonnes: s.raw.E_raw ?? null,
    water_flooded_vegetation_fraction_500m: s.raw.L_raw ?? null,
  };
  for (const [from, to] of Object.entries(INPUT_NAMES)) inputs[to] = s.condition[from] ?? null;
  const entries = rules.flatMap((rule) => {
    const res = s.results ? s.results[rule] : null;
    if (s.cohort !== "queue" && !res) {
      skipped.noResult += 1;
      leftOut.noResult.push({ cohort: s.cohort, rule });
      return [];
    }
    return [
      {
        rule: { rule_id: rule },
        result: {
          cohort: COHORT[s.cohort],
          components: wireComponents(s, rule),
          need_parts: s.need_parts,
          area_parts: wireArea(s.area_parts),
          ...wireContributions(s, rule),
          scores: wireScores(res, rule),
          point_rank: wirePoint(res),
          rank_bounds: wireBounds(res),
        },
      },
    ];
  });
  return parseWith(wireSchoolDetail, { school: wireIdentity(s), inputs, rules: entries }, `school/${s.id}`);
}

function skip(why: keyof typeof skipped): null {
  skipped[why] += 1;
  return null;
}

/** One /compare response per recorded pair, with the top-20 moves recorded for it. */
function wireCompares(data: Dataset["data"]) {
  return data.pairwise.flatMap((row: any) => {
    if (
      !Number.isInteger(row.n) ||
      row.median_absolute_rank_shift == null ||
      row.maximum_absolute_rank_shift == null
    ) {
      skipped.noPairRow += 1;
      leftOut.noPairRow.push({
        n: row.n,
        median: row.median_absolute_rank_shift,
        maximum: row.maximum_absolute_rank_shift,
      });
      return [];
    }
    const move = (c: any) => ({
      status: c.status,
      school: { source_school_name: c["School Name"] },
      rank_a: c.left_rank,
      rank_b: c.right_rank,
    });
    const changes = data.top20Changes.filter(
      (c: any) => c.left_rule === row.left_rule && c.right_rule === row.right_rule
    );
    return [
      parseWith(
        wireCompare,
        {
          run_a: { rule_id: row.left_rule },
          run_b: { rule_id: row.right_rule },
          metrics: {
            n: row.n,
            median_absolute_rank_shift: row.median_absolute_rank_shift,
            maximum_absolute_rank_shift: row.maximum_absolute_rank_shift,
            top_k: [10, 20, 30, 40].map((k) => ({ k, overlap: row[`top${k}_overlap`] })),
          },
          entrants: changes.filter((c: any) => c.status === "entrant").map(move),
          exits: changes.filter((c: any) => c.status === "exit").map(move),
        },
        `compare/${row.left_rule}/${row.right_rule}`
      ),
    ];
  });
}

/* ------------------------------------------------------------------ the checks */

/** The original records, without the one field the API does not carry. */
const withoutFlag = (schools: any[]) =>
  schools.map((s) => ({ ...s, persistent_candidate_circulated: false }));

suite("the adapter loses nothing the sentences read [needs RISE_PNG_DESIGN_ROOT]", () => {
  describe.each(DATASET_DIRS.map(([name]) => name))("%s data", (name) => {
    const dataset = () => datasets.find((d) => d.name === name) as Dataset;

    it("gives the counts it can give, equal to the prototype's", () => {
      const { data } = dataset();
      const truth = proto.countsFrom(withoutFlag(data.schools));
      const got = countsFromResults(wireResultsFor(data, VIEW));
      expect(Object.keys(got).sort()).toEqual([
        "airMissing",
        "all",
        "complete",
        "queue",
        "range",
        "ranked",
        "urgencyZero",
      ]);
      for (const [k, v] of Object.entries(got)) expect(v, k).toBe(truth[k]);
    });

    it("says the same from the list rows as the prototype says from the records", () => {
      const { data } = dataset();
      const schools = withoutFlag(data.schools);
      const counts = proto.countsFrom(schools);
      const rows = port.RULE_IDS.map((r) => wireResultsFor(data, r));
      const view = rows[port.RULE_IDS.indexOf(VIEW)];
      const placed = placedFromResults(view, ...rows.filter((r) => r !== view));
      expect(placed.map((s) => s.id)).toEqual(schools.map((s) => s.id));

      const Q: Api = port.copyFor({ schools: placed, counts, pairwise: [], top20Changes: [] });
      const R: Api = proto.copyFor({ schools, pairwise: [], top20Changes: [] });
      const byId = new Map(schools.map((s) => [s.id, s]));
      for (const s of placed) {
        const o = byId.get(s.id);
        const tag = s.id;
        const one = (label: string, f: (api: Api, school: any) => unknown) =>
          sameOutcome(
            `${tag} ${label}`,
            run(() => f(R, o)),
            run(() => f(Q, s))
          );
        one("displayName", (api, x) => api.displayName(x));
        one("distinctName", (api, x) => api.distinctName(x, api === Q ? placed : schools));
        one("locationLine", (api, x) => api.locationLine(x));
        for (const r of port.RULE_IDS) {
          for (const opts of [{}, { name: true, shortlist: 20 }, { shortlist: 3 }])
            one(`${r} rankSentence ${JSON.stringify(opts)}`, (api, x) => api.rankSentence(x, r, opts));
          one(`${r} placeHeadline`, (api, x) => api.placeHeadline(x, r));
          for (const opts of [{}, { method: true }, { shortlist: 20 }])
            one(`${r} placeContext ${JSON.stringify(opts)}`, (api, x) => api.placeContext(x, r, opts));
          one(`${r} fullRankingSentence`, (api, x) => api.fullRankingSentence(x, r));
          for (const form of ["card", "row"])
            one(`${r} tieNote ${form}`, (api, x) => api.tieNote(x, r, api === Q ? placed : schools, form));
        }
        for (const a of port.RULE_IDS)
          for (const b of port.RULE_IDS)
            if (a !== b)
              one(`${a}>${b} rangeComparisonSentence`, (api, x) => api.rangeComparisonSentence(x, a, b));
      }
      for (const r of port.RULE_IDS)
        sameOutcome(
          `${r} listStartsSentence`,
          run(() => R.listStartsSentence(schools, r)),
          run(() => Q.listStartsSentence(placed, r))
        );
      flush();
    });

    it("says the same from a whole record as the prototype says from the original", () => {
      const { data } = dataset();
      const schools = withoutFlag(data.schools);
      const counts = proto.countsFrom(schools);
      const R: Api = proto.copyFor({ schools, pairwise: [], top20Changes: [] });
      const Q: Api = port.copyFor({ schools: [], counts });
      let covered = 0;
      for (const o of schools) {
        const detail = wireDetail(o, port.RULE_IDS);
        if (!detail) continue;
        covered += 1;
        const s = schoolFromDetail(detail, VIEW);
        const tag = o.id;
        const one = (label: string, f: (api: Api, school: any) => unknown) =>
          sameOutcome(
            `${tag} ${label}`,
            run(() => f(R, o)),
            run(() => f(Q, s))
          );
        one("cohort", (_api, x) => x.cohort);
        one("gate_failures", (_api, x) => x.gate_failures);
        one("missingSentence", (api, x) => api.missingSentence(x));
        one("missingSentences", (api, x) => api.missingSentences(x));
        one("missingLabels", (api, x) => api.missingLabels(x));
        for (const k of ["need", ...proto.INPUT_KEYS]) {
          one(`missingValueKind(${k})`, (api, x) => api.missingValueKind(x, k));
          one(`missingValueNote(${k})`, (api, x) => api.missingValueNote(x, k));
        }
        for (const k of proto.INPUT_KEYS) one(`inputSentence(${k})`, (api, x) => api.inputSentence(x, k));
        for (const r of port.RULE_IDS) {
          one(`${r} reasonSentence`, (api, x) => api.reasonSentence(x, r));
          one(`${r} topDrivers`, (api, x) => api.topDrivers(x, r));
          one(`${r} contributions`, (api, x) => api.contributions(x, r));
          for (const opts of [{}, { name: true, shortlist: 20 }])
            one(`${r} rankSentence`, (api, x) => api.rankSentence(x, r, opts));
          one(`${r} placeContext(method)`, (api, x) => api.placeContext(x, r, { method: true }));
          one(`${r} fullRankingSentence`, (api, x) => api.fullRankingSentence(x, r));
        }
        for (const a of port.RULE_IDS)
          for (const b of port.RULE_IDS)
            if (a !== b)
              one(`${a}>${b} rangeComparisonSentence`, (api, x) => api.rangeComparisonSentence(x, a, b));
        if (mismatches.length >= 40) break;
      }
      if (data.schools.length > 0 && covered === 0)
        note(`${name}: no record could be sent through the adapter`);
      flush();
    });

    it("says the same about every pair of rules from /compare responses", () => {
      const { data } = dataset();
      const schools = withoutFlag(data.schools);
      const counts = proto.countsFrom(schools);
      const compares = wireCompares(data);
      const adapted = compares.map((c) => pairwiseFromCompare(c));
      const pairwise = adapted.flatMap((a) => a.pairwise);
      const top20Changes = adapted.flatMap((a) => a.top20Changes);
      const rows = port.RULE_IDS.map((r) => wireResultsFor(data, r));
      const view = rows[port.RULE_IDS.indexOf(VIEW)];
      const placed = placedFromResults(view, ...rows.filter((r) => r !== view));

      const kept = data.pairwise.filter(
        (row: any) =>
          Number.isInteger(row.n) &&
          row.median_absolute_rank_shift != null &&
          row.maximum_absolute_rank_shift != null
      );
      const R: Api = proto.copyFor({ schools, pairwise: kept, top20Changes: data.top20Changes });
      const Q: Api = port.copyFor({ schools: placed, counts, pairwise, top20Changes });

      for (const k of ["TERMS", "STRINGS", "IDEAS", "HOW_IT_WORKS", "FIRST_QUESTIONS", "LAYOUT"])
        same(k, prototypeValue(k, R[k], counts), Q[k]);
      for (const a of port.RULE_IDS) {
        for (const b of port.RULE_IDS) {
          for (const top of [undefined, 10, 20])
            sameOutcome(
              `${a}>${b} top ${top}`,
              run(() => R.comparisonSentence(a, b, undefined, { top })),
              run(() => Q.comparisonSentence(a, b, undefined, { top }))
            );
        }
      }
      for (const f of ["urgencyReassurance", "defaultListStatement", "defaultListStatementLong"])
        sameOutcome(
          f,
          run(() => R[f]()),
          run(() => Q[f]())
        );
      flush();
    });
  });

  it("sends something through every route", () => {
    expect(tally.calls).toBeGreaterThan(0);
  });

  it("leaves out only what the API cannot say, and says why for each", () => {
    // The API sends no entry for a rule that does not run on a school, and the design records that as a null result.
    // Only a school with a range (it lacks a reading the rule reads) can be in that position.
    expect(skipped.noResult).toBe(leftOut.noResult.length);
    expect(leftOut.noResult.filter((x) => x.cohort !== "interval")).toEqual([]);
    // A record whose gate list names more need parts than it has blank ones contradicts itself.
    expect(skipped.inconsistentGate).toBe(leftOut.inconsistentGate.length);
    for (const x of leftOut.inconsistentGate) {
      expect(x.cohort).toBe("queue");
      expect(x.blank.length).toBeLessThan(x.gate.length);
      expect(x.blank.every((f) => x.gate.includes(f))).toBe(true);
    }
    // A record with no district parts cannot be sent, and the design always has them.
    expect(leftOut.noAreaParts).toEqual([]);
    // A recorded pair without a school count or a shift has nothing to compare.
    expect(skipped.noPairRow).toBe(leftOut.noPairRow.length);
    for (const x of leftOut.noPairRow)
      expect(!Number.isInteger(x.n) || x.median == null || x.maximum == null).toBe(true);
  });
});
