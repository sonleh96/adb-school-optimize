/**
 * The adapter from the screening API's responses to the records the copy reads.
 *
 * Failure modes, each with the test that catches it:
 *  1. The API changes a response the copy reads and the copy keeps compiling. Every saved response parses with
 *     the copy's schemas, and a field that goes missing fails with its path.
 *  2. A field lands in the wrong place (a renamed area part, the need-first score, the bounds scope). The mapping
 *     is checked field by field against the saved responses, read here as plain JSON.
 *  3. A result under another rule whose group differs is shown as if it matched.
 *  4. A queue school's missing need parts are lost, or invented.
 *  5. A count the list cannot give is stated anyway: from a filtered list, or from rows without the value.
 *  6. A comparison's moves are attached to the wrong direction or the wrong school.
 *  7. A broken response flows into a sentence as undefined instead of failing at the boundary.
 */
import { describe, expect, it } from "vitest";

import { ParseError, parseWith } from "@/lib/screening/schema";
import * as copy from "@/lib/screening/copy";
import {
  countsFromResults,
  copyFor,
  pairwiseFromCompare,
  placedFromResults,
  schoolFromDetail,
} from "@/lib/screening/copy";

import { copy as clone, fixtureIndex, readFixture } from "../fixtures";
import { KEYS, RULES, fixtureCompare, fixtureDetail, fixtureResults } from "./helpers";
import { compareResponse, resultsResponse, schoolDetailResponse } from "@/lib/screening/types";

interface RawRow {
  cohort: string;
  components: Record<string, number | null | undefined>;
  school: { source_school_name: string };
}

describe("the responses the API sent", () => {
  const { requests } = fixtureIndex();
  const schemaFor = (p: string) =>
    p.startsWith("/api/v1/screening/schools/by-key/")
      ? schoolDetailResponse
      : p.endsWith("/results")
        ? resultsResponse
        : p.endsWith("/compare")
          ? compareResponse
          : null;

  it.each(requests.filter((r) => schemaFor(r.path)).map((r) => [r.file, r] as const))(
    "%s parses with the copy's schemas",
    (_file, request) => {
      const schema = schemaFor(request.path);
      expect(schema).not.toBeNull();
      expect(() => parseWith(schema as never, readFixture(request.file), request.file)).not.toThrow();
    }
  );

  it("names the path of a field that went missing", () => {
    const body = clone(readFixture("schools/4e65114f0b8790b6b906088a6d549020.json")) as {
      rules: { result: Record<string, unknown> }[];
    };
    delete body.rules[2].result.need_parts;
    expect(() => parseWith(schoolDetailResponse, body, "Screening school")).toThrow(
      "Screening school: rules[2].result.need_parts: expected an object, got undefined"
    );
    const results = clone(readFixture("results/additive_u.json")) as {
      rows: { components: Record<string, unknown> }[];
    };
    delete results.rows[4].components.Q;
    expect(() => parseWith(resultsResponse, results, "Screening results")).toThrow(
      "rows[4].components.Q: expected a finite number"
    );
  });
});

describe("one school from /schools/by-key", () => {
  const raw = readFixture(`schools/${KEYS.complete}.json`) as {
    school: Record<string, unknown>;
    inputs: Record<string, number | string | null>;
    rules: {
      rule: { rule_id: string };
      result: {
        scores: Record<string, number | null>;
        point_rank: { rank: number | null };
        rank_bounds: { best: number; worst: number };
      };
    }[];
  };
  const s = schoolFromDetail(fixtureDetail(KEYS.complete), "additive_u");

  it("carries who the school is", () => {
    expect([s.id, s.name, s.province, s.district, s.locality]).toEqual([
      KEYS.complete,
      "Sample School 08",
      "South Province",
      "South One",
      "Very remote",
    ]);
    expect(s.cohort).toBe("complete");
  });

  it("renames each stored input to the field the sentences read", () => {
    const i = raw.inputs;
    expect(s.condition).toEqual({
      teachers: i.teachers,
      classrooms_total: i.total_classrooms,
      classrooms_permanent: i.permanent_classrooms,
      teacher_houses: i.teacher_houses,
      libraries: i.libraries,
      workshops: i.workshops,
      practical_skills: i.practical_skills_buildings,
      home_economics: i.home_economics_buildings,
      computer_labs: i.computer_labs,
      specialized_classrooms: i.specialized_classrooms,
      power_source: i.power_source,
      water_source: i.water_source,
    });
    expect(s.condition).toMatchObject({
      teachers: 10,
      classrooms_total: 8,
      classrooms_permanent: 0,
      teacher_houses: 2,
      power_source: "Generator",
      water_source: "Tank Water",
    });
    expect(s.raw).toEqual({
      Q_raw: i.aqi_p95_selected,
      E_raw: i.emissions_co2e_100yr_10km_tonnes,
      L_raw: i.water_flooded_vegetation_fraction_500m,
    });
    expect(s.raw).toEqual({ Q_raw: 83, E_raw: 490, L_raw: 0.35 });
    expect(s.missing_env).toEqual({ aqi: false, emissions: false, land: false });
  });

  it("renames the district parts and carries the need parts and components as they are", () => {
    expect(s.area_parts).toEqual({
      progression10_deficit: 0.41000000000000003,
      progression12_deficit: 0.73,
      secondary_participation_deficit: 0.5729927007299269,
      activity_deficit: 0.5,
      conflict_exposure: 1,
      female_disadvantage: 0.19999999999999996,
    });
    expect(s.need_parts).toEqual({
      permanent_classroom_deficit: 1,
      teacher_housing_deficit: 0.8,
      facility_presence_deficit: 0.6666666666666667,
      service_deficit: 0.6,
      locality_disadvantage: 0.9,
    });
    expect(s.components).toEqual({
      N: 0.7933333333333333,
      A: 0.5502481751824818,
      U: 0.21014492753623193,
      R: 0.6593990253034641,
      Q: 0.46153846153846156,
      E: 0.8181416976481812,
      L: 0.35,
    });
    expect(s.gate_failures).toEqual([]);
  });

  it("maps the place and bounds under each rule, and the need-first score to school need", () => {
    for (const r of RULES) {
      const entry = raw.rules.find((x) => x.rule.rule_id === r);
      if (!entry) throw new Error(`no ${r}`);
      const got = s.results?.[r];
      expect(got?.rank_complete120, r).toBe(entry.result.point_rank.rank);
      expect(got?.rank_best, r).toBe(entry.result.rank_bounds.best);
      expect(got?.rank_worst, r).toBe(entry.result.rank_bounds.worst);
      expect(got?.rank_bounds_scope, r).toBe("eligible124");
      if (r.startsWith("need_first")) {
        expect(got?.school_need, r).toBe(entry.result.scores.sort_key_primary);
        expect(got?.secondary_score_lower, r).toBe(entry.result.scores.lower);
        expect(got).not.toHaveProperty("score_point");
      } else {
        expect(got?.score_point, r).toBe(entry.result.scores.point);
        expect(got).not.toHaveProperty("school_need");
      }
    }
    expect(s.results?.need_first_u?.school_need).toBe(0.7933333333333333);
  });

  it("keeps the recorded contributions of the two combined-factors rules, urgency only where the rule reads it", () => {
    expect(s.contributions?.additive_u?.components).toEqual({
      permanent_classroom_deficit: 0.12,
      teacher_housing_deficit: 0.096,
      facility_presence_deficit: 0.08,
      service_deficit: 0.072,
      locality_disadvantage: 0.10800000000000001,
      area: 0.08253722627737227,
      urgency: 0.010507246376811597,
      reach: 0.03296995126517321,
      aqi_lower: 0.023076923076923078,
      aqi_upper: 0.023076923076923078,
      emissions_lower: 0.040907084882409066,
      emissions_upper: 0.040907084882409066,
      land_lower: 0.017499999999999998,
      land_upper: 0.017499999999999998,
    });
    expect(s.contributions?.additive_no_u?.components).not.toHaveProperty("urgency");
  });

  it("reads a range school's missing air quality as a missing reading with a wide contribution", () => {
    const r = schoolFromDetail(fixtureDetail(KEYS.interval), "additive_u");
    expect(r.cohort).toBe("interval");
    expect(r.raw.Q_raw).toBeNull();
    expect(r.missing_env.aqi).toBe(true);
    expect(r.results?.additive_u).toMatchObject({ rank_complete120: null });
    const c = r.contributions?.additive_u?.components;
    expect(c && c.aqi_lower !== c.aqi_upper).toBe(true);
  });

  it("reads a school held for verification by the need parts that are blank", () => {
    const q = schoolFromDetail(fixtureDetail(KEYS.queueTeacherHouses), "additive_u");
    expect(q.cohort).toBe("queue");
    expect(q.gate_failures).toEqual(["teacher_housing_deficit"]);
    expect(q.results).toEqual({});
    expect(q.contributions).toEqual({});
    expect(copy.missingLabels(q)).toEqual(["Teacher count blank"]);
    expect(copy.missingValueKind(q, "need")).toBe("not_calculable");
  });

  it("names no need part for a school held for a reason about its stored counts when every need part is present", () => {
    // The API names the reason (here a missing stock field) but not the part, so the parts come from the blanks.
    // With every part present there is none to name, and the record says only that it needs checking.
    const body = clone(readFixture(`schools/${KEYS.queueTeacherHouses}.json`)) as {
      rules: { result: { need_parts: Record<string, number | null> } }[];
    };
    for (const r of body.rules) r.result.need_parts.teacher_housing_deficit = 0.4;
    const q = schoolFromDetail(parseWith(schoolDetailResponse, body, "school"), "additive_u");
    expect(q.cohort).toBe("queue");
    expect(q.gate_failures).toEqual([]);
    expect(copy.missingLabels(q)).toEqual(["Record needs checking"]);
  });

  it("carries a place and the range it could take once the range schools are counted", () => {
    const s05 = schoolFromDetail(fixtureDetail(KEYS.completeWithRange), "additive_u");
    expect(s05.results?.additive_u).toMatchObject({
      rank_complete120: 12,
      rank_best: 12,
      rank_worst: 16,
      rank_bounds_scope: "eligible124",
    });
    const P = copyFor({ counts: { complete: 16, range: 5, ranked: 21 } });
    expect(P.rankSentence(s05, "additive_u")).toBe(
      "12th of the 16 schools with every input recorded, and anywhere from 12th to 16th once the five schools that show a range are counted."
    );
  });

  it("reads the group under the rule shown and keeps the result under each other rule as the API gave it", () => {
    // The saved Sample School 17 lacks an air-quality reading: a range under six rules, but one place under the
    // benchmark, which does not read air quality.
    const detail = fixtureDetail(KEYS.interval);
    const shown = schoolFromDetail(detail, "additive_u");
    expect(shown.cohort).toBe("interval");
    expect(shown.results?.benchmark).toMatchObject({ rank_best: 12, rank_worst: 12 });
    expect(copy.rankSentence(shown, "benchmark", { shortlist: 20 })).toBe(
      "12th of the schools that can be put in order. Its air-quality reading is missing, but under this rule that cannot change its place in the list. It is in the top 20 either way."
    );
    const asBenchmark = schoolFromDetail(detail, "benchmark");
    expect(asBenchmark.cohort).toBe("complete");
    expect(Object.keys(asBenchmark.results ?? {}).sort()).toEqual([...RULES].sort());
  });

  it("leaves out a result under a rule that holds the school for verification", () => {
    const body = clone(readFixture(`schools/${KEYS.complete}.json`)) as {
      rules: { rule: { rule_id: string }; result: Record<string, unknown> }[];
    };
    const held = body.rules.find((r) => r.rule.rule_id === "benchmark");
    if (!held) throw new Error("no benchmark");
    held.result.cohort = "verification_queue";
    const shown = schoolFromDetail(parseWith(schoolDetailResponse, body, "school"), "additive_u");
    expect(shown.results).not.toHaveProperty("benchmark");
    expect(copy.rankSentence(shown, "benchmark")).toBe("No result under the conventional benchmark (B).");
  });

  it("ignores a rule the copy has no words for, and refuses a view of one the school has no result under", () => {
    const body = clone(readFixture(`schools/${KEYS.complete}.json`)) as {
      rules: { rule: { rule_id: string; label?: string }; result: unknown }[];
    };
    body.rules.push({
      ...body.rules[0],
      rule: { rule_id: "a_rule_added_later", label: "A rule added later" },
    });
    const detail = parseWith(schoolDetailResponse, body, "school");
    expect(Object.keys(schoolFromDetail(detail, "additive_u").results ?? {}).sort()).toEqual(
      [...RULES].sort()
    );
    const without = parseWith(
      schoolDetailResponse,
      { ...body, rules: body.rules.filter((r) => r.rule.rule_id !== "benchmark") },
      "school"
    );
    expect(() => schoolFromDetail(without, "benchmark")).toThrow(ParseError);
    expect(() => schoolFromDetail(without, "benchmark")).toThrow(
      "rules: the school has no result under benchmark"
    );
  });
});

describe("a stored input or a contribution that is missing", () => {
  const body = () =>
    clone(readFixture(`schools/${KEYS.complete}.json`)) as {
      inputs: Record<string, unknown>;
      rules: {
        rule: { rule_id: string };
        result: {
          contributions: { component: string }[];
          need_part_contributions: Record<string, unknown> | null;
        };
      }[];
    };
  const load = (b: unknown) => parseWith(schoolDetailResponse, b, "school");

  it("fails with the input's name when the API stops sending it", () => {
    const b = body();
    delete b.inputs.total_classrooms;
    expect(() => schoolFromDetail(load(b), "additive_u")).toThrow(
      "inputs.total_classrooms: expected a number or null, got undefined"
    );
  });

  it("fails when a number arrives as text, or a text as a number", () => {
    const b = body();
    b.inputs.teachers = "ten";
    expect(() => schoolFromDetail(load(b), "additive_u")).toThrow(
      'inputs.teachers: expected a number or null, got string "ten"'
    );
    const c = body();
    c.inputs.power_source = 5;
    expect(() => schoolFromDetail(load(c), "additive_u")).toThrow(
      "inputs.power_source: expected a string or null, got number 5"
    );
  });

  it("reads a blank input as blank, not as 0", () => {
    const b = body();
    b.inputs.teachers = null;
    b.inputs.power_source = null;
    const s = schoolFromDetail(load(b), "additive_u");
    expect(s.condition.teachers).toBeNull();
    expect(s.condition.power_source).toBeNull();
  });

  it("fails when an additive result lacks a component's contribution or the need parts' contributions", () => {
    const b = body();
    const additive = b.rules.find((r) => r.rule.rule_id === "additive_u");
    if (!additive) throw new Error("no additive_u");
    additive.result.contributions = additive.result.contributions.filter((c) => c.component !== "R");
    expect(() => schoolFromDetail(load(b), "additive_u")).toThrow(
      "rules.additive_u.result.contributions: no entry for component R"
    );
    const c = body();
    const noParts = c.rules.find((r) => r.rule.rule_id === "additive_no_u");
    if (!noParts) throw new Error("no additive_no_u");
    noParts.result.need_part_contributions = null;
    expect(() => schoolFromDetail(load(c), "additive_no_u")).toThrow(
      "rules.additive_no_u.result.need_part_contributions: expected a value, got null"
    );
  });
});

describe("a list from /results", () => {
  const response = fixtureResults("additive_u");
  const raw = readFixture("results/additive_u.json") as { rows: RawRow[] };

  it("gives each school its group, its place under the rule shown and which readings are blank", () => {
    const list = placedFromResults(response);
    expect(list).toHaveLength(25);
    expect(list.map((s) => s.name).slice(0, 3)).toEqual([
      "Sample School 08",
      "Sample School 15",
      "Sample School 13",
    ]);
    const byName = (n: string) => list.find((s) => s.name === n);
    expect(byName("Sample School 08")).toMatchObject({
      cohort: "complete",
      results: { additive_u: { rank_complete120: 1, rank_best: 1, rank_worst: 1 } },
      missing_env: { aqi: false, emissions: false, land: false },
    });
    expect(byName("Sample School 17")).toMatchObject({
      cohort: "interval",
      results: { additive_u: { rank_complete120: null, rank_best: 11, rank_worst: 18 } },
      missing_env: { aqi: true },
    });
    expect(byName("Sample School 21")).toMatchObject({ cohort: "queue", results: {} });
    // Sample School 18 lacks a reading other than air quality.
    expect(byName("Sample School 18")?.missing_env.aqi).toBe(false);
    expect(
      byName("Sample School 18")?.missing_env.emissions || byName("Sample School 18")?.missing_env.land
    ).toBe(true);
  });

  it("reads a range school whose ends are equal as one place", () => {
    const list = placedFromResults(response);
    const equal = list.find((s) => s.name === "Sample School 25");
    expect(equal?.results?.additive_u).toMatchObject({ rank_best: 21, rank_worst: 21 });
    const P = copyFor({ schools: list, counts: countsFromResults(response) });
    expect(P.placeHeadline(equal as never, "additive_u")).toBe("21st of 21");
    expect(P.rankSentence(equal as never, "additive_u", { shortlist: 20 })).toBe(
      "21st of the 21 schools that can be put in order. Its air-quality reading is missing, but under this rule that cannot change its place in the list. It is outside the top 20 either way."
    );
  });

  it("gives each school a result under every list passed, except where that list holds it for verification", () => {
    const other = clone(readFixture("results/additive_no_u.json")) as {
      rows: {
        cohort: string;
        school: { source_school_name: string };
        point_rank: { rank: number | null };
        rank_bounds: { best: number | null; worst: number | null };
      }[];
    };
    const held = other.rows.find((r) => r.school.source_school_name === "Sample School 08")!;
    held.cohort = "verification_queue";
    held.point_rank.rank = null;
    held.rank_bounds.best = null;
    held.rank_bounds.worst = null;
    const joined = placedFromResults(
      response,
      parseWith(resultsResponse, other, "other"),
      fixtureResults("benchmark")
    );
    const s08 = joined.find((s) => s.name === "Sample School 08");
    expect(Object.keys(s08?.results ?? {}).sort()).toEqual(["additive_u", "benchmark"]);
    const s15 = joined.find((s) => s.name === "Sample School 15");
    expect(Object.keys(s15?.results ?? {}).sort()).toEqual(["additive_no_u", "additive_u", "benchmark"]);
  });

  it("refuses a list for a rule the copy has no words for", () => {
    const b = clone(readFixture("results/additive_u.json")) as { run: { rule_id: string } };
    b.run.rule_id = "a_rule_added_later";
    expect(() => placedFromResults(parseWith(resultsResponse, b, "list"))).toThrow(ParseError);
  });

  it("counts the groups from the run's manifest, the missing air quality and zero urgency from the rows", () => {
    const counts = countsFromResults(response);
    expect(counts).toEqual({
      all: 25,
      complete: 16,
      range: 5,
      queue: 4,
      ranked: 21,
      airMissing: raw.rows.filter((r) => r.cohort !== "verification_queue" && r.components.Q === null).length,
      urgencyZero: raw.rows.filter((r) => r.components.U === 0).length,
    });
    expect(counts.airMissing).toBe(3);
  });

  it("leaves out a count it cannot give", () => {
    const filtered = clone(readFixture("results/additive_u.json")) as {
      returned_schools: number;
      rows: unknown[];
    };
    filtered.returned_schools = 10;
    filtered.rows = filtered.rows.slice(0, 10);
    const counts = countsFromResults(parseWith(resultsResponse, filtered, "filtered"));
    expect(counts).toEqual({ all: 25, complete: 16, range: 5, queue: 4, ranked: 21 });

    const noUrgency = countsFromResults(fixtureResults("additive_no_u"));
    expect(noUrgency).not.toHaveProperty("urgencyZero");
    expect(noUrgency.airMissing).toBe(3);

    const cut = clone(readFixture("results/additive_u.json")) as {
      manifest: { cohort_counts: Record<string, number> };
    };
    delete cut.manifest.cohort_counts.interval;
    const partial = countsFromResults(parseWith(resultsResponse, cut, "partial"));
    expect(partial).not.toHaveProperty("range");
    expect(partial).not.toHaveProperty("ranked");
    expect(partial.complete).toBe(16);
  });

  it("never states the counts only a record-by-record read gives", () => {
    const counts = countsFromResults(response);
    for (const k of ["emissionsNone", "remotenessOnly", "flagged"]) expect(counts).not.toHaveProperty(k);
    const P = copyFor({ counts });
    expect(P.TERMS.emissions.help).toBe(
      "The sum of yearly CO2-equivalent emissions from fixed point sources within 10 km in the Climate TRACE inventory, log-scaled and rescaled. It is not a health or climate measure for the school, and it is never added to air quality or land cover."
    );
    expect(P.TERMS.persistent_flag.help).not.toMatch(/the flag\./);
    expect(P.TERMS.missing_all_but_remoteness.help).toBe(
      "Classroom, teacher, housing, facility, power and water details are all blank."
    );
  });
});

describe("the bounds scope", () => {
  const rowWith = (code: string, label = "a label that says nothing") => {
    const b = clone(readFixture("results/additive_u.json")) as {
      rows: { rank_bounds: { scope: string; scope_code: string } }[];
    };
    b.rows[0].rank_bounds.scope = label;
    b.rows[0].rank_bounds.scope_code = code;
    return placedFromResults(parseWith(resultsResponse, b, "list"))[0];
  };

  it.each([
    ["eligible", "eligible124"],
    ["complete_under_rule", null],
    ["common_complete_cohort", null],
    ["a_scope_added_later", null],
  ])("reads the scope code %j as %j", (code, want) => {
    expect(rowWith(code).results?.additive_u?.rank_bounds_scope).toBe(want);
  });

  it("reads the code and never the label", () => {
    expect(rowWith("eligible", "complete under this rule (16)").results?.additive_u?.rank_bounds_scope).toBe(
      "eligible124"
    );
    expect(rowWith("complete_under_rule", "eligible (21)").results?.additive_u?.rank_bounds_scope).toBe(null);
  });

  it("uses no bounds that do not count the schools that can be put in order", () => {
    const r = rowWith("common_complete_cohort").results?.additive_u;
    expect(r).toMatchObject({ rank_best: null, rank_worst: null });
  });

  it("uses no place that does not count the schools complete under the rule", () => {
    const b = clone(readFixture("results/additive_u.json")) as {
      rows: { point_rank: { scope_code: string } }[];
    };
    b.rows[0].point_rank.scope_code = "eligible";
    const s = placedFromResults(parseWith(resultsResponse, b, "list"))[0];
    expect(s.results?.additive_u?.rank_complete120).toBeNull();
  });

  it("says the rule was not run on all schools when the scope is one it does not know", () => {
    const s = rowWith("a_scope_added_later");
    expect(copy.fullRankingSentence(s, "additive_u")).toMatch(
      /^This rule was not run on all schools that can be put in order/
    );
  });
});

describe("the scope codes of a comparison", () => {
  const body = () =>
    clone(readFixture("compare/additive_u__additive_no_u.json")) as {
      common_cohort_scope: string;
      common_cohort_scope_code: string;
      entrants: { rank_scope: string; rank_scope_code: string }[];
      exits: { rank_scope: string; rank_scope_code: string }[];
    };
  const load = (b: unknown) => pairwiseFromCompare(parseWith(compareResponse, b, "compare"));

  it("are common_complete_cohort in the saved response, and the comparison is used", () => {
    const b = body();
    expect(b.common_cohort_scope_code).toBe("common_complete_cohort");
    expect(load(b).pairwise).toHaveLength(1);
  });

  it("decide whether the comparison is used, whatever the labels say", () => {
    const wrongCohort = body();
    wrongCohort.common_cohort_scope_code = "eligible";
    expect(load(wrongCohort)).toEqual({ pairwise: [], top20Changes: [] });
    const unknown = body();
    unknown.common_cohort_scope_code = "a_scope_added_later";
    expect(load(unknown)).toEqual({ pairwise: [], top20Changes: [] });
    // The label alone is never read: a label that reads like the common cohort with another code is not used.
    const label = body();
    label.common_cohort_scope = "common complete cohort (16)";
    label.common_cohort_scope_code = "complete_under_rule";
    expect(load(label).pairwise).toEqual([]);
  });

  it("must hold for every rank of a move too", () => {
    const b = body();
    b.entrants = [
      {
        status: "entrant",
        school: clone(readFixture("results/additive_u.json") as { rows: { school: unknown }[] }).rows[0]
          .school,
        rank_a: 21,
        rank_b: 18,
        rank_scope: "eligible (21)",
        rank_scope_code: "eligible",
      },
    ] as never;
    expect(load(b)).toEqual({ pairwise: [], top20Changes: [] });
  });
});

describe("a comparison from /compare", () => {
  it("maps the saved response to the study's recorded comparison row", () => {
    const raw = readFixture("compare/additive_u__additive_no_u.json") as {
      metrics: {
        n: number;
        median_absolute_rank_shift: number;
        maximum_absolute_rank_shift: number;
        top_k: { k: number; overlap: number }[];
      };
    };
    const { pairwise, top20Changes } = pairwiseFromCompare(fixtureCompare());
    expect(top20Changes).toEqual([]);
    expect(pairwise).toEqual([
      {
        left_rule: "additive_u",
        right_rule: "additive_no_u",
        n: raw.metrics.n,
        top10_overlap: raw.metrics.top_k.find((t) => t.k === 10)?.overlap,
        top20_overlap: raw.metrics.top_k.find((t) => t.k === 20)?.overlap,
        top30_overlap: raw.metrics.top_k.find((t) => t.k === 30)?.overlap,
        top40_overlap: raw.metrics.top_k.find((t) => t.k === 40)?.overlap,
        median_absolute_rank_shift: raw.metrics.median_absolute_rank_shift,
        maximum_absolute_rank_shift: raw.metrics.maximum_absolute_rank_shift,
      },
    ]);
    expect(pairwise[0]).toMatchObject({
      n: 16,
      top10_overlap: 9,
      top20_overlap: 16,
      median_absolute_rank_shift: 1,
      maximum_absolute_rank_shift: 2,
    });
  });

  it("maps each move to the rules, ranks and school name, exits first", () => {
    const body = clone(readFixture("compare/additive_u__additive_no_u.json")) as {
      entrants: unknown[];
      exits: unknown[];
    };
    const move = (name: string, rank_a: number, rank_b: number, status: string) => ({
      status,
      school: {
        school_key: `key-${name.trim()}`,
        source_school_name: name,
        province: null,
        district: null,
        locality: null,
        latitude: null,
        longitude: null,
      },
      rank_a,
      rank_b,
      rank_scope: "x",
      rank_scope_code: "common_complete_cohort",
    });
    body.entrants = [move("In One", 24, 18, "entrant")];
    body.exits = [move("Out One ", 17, 22, "exit")];
    const { top20Changes } = pairwiseFromCompare(parseWith(compareResponse, body, "compare"));
    expect(top20Changes).toEqual([
      {
        left_rule: "additive_u",
        right_rule: "additive_no_u",
        status: "exit",
        left_rank: 17,
        right_rank: 22,
        "School Name": "Out One ",
        school_key: "key-Out One",
      },
      {
        left_rule: "additive_u",
        right_rule: "additive_no_u",
        status: "entrant",
        left_rank: 24,
        right_rank: 18,
        "School Name": "In One",
        school_key: "key-In One",
      },
    ]);
  });
});
