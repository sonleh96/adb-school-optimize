/**
 * Failure modes: the app and the API disagree about a response.
 *  1. The API changes a shape the page reads and the app keeps compiling against the old one.
 *     Every response the API really sent (saved by the fixture script) must parse with the app's schemas, and a
 *     request that has no schema here fails the test, so a new endpoint cannot slip through unparsed.
 *  2. A field is renamed or removed and `undefined` flows into the page. The parse error must name the path.
 *  3. A row says "interval" but carries one exact place, or says "complete" with none. It is rejected at the
 *     boundary, so no later code has to wonder.
 *  4. The API adds a field, or a new member of an enum the page does not branch on. The page must keep working.
 *  5. The persistence flag appears on a rule it does not describe, or a scope is told apart by its label. The
 *     parser keeps the flag only where the API sent it and carries the scope code the page branches on.
 */
import { describe, expect, it } from "vitest";

import { ParseError, parseWith } from "@/lib/screening/schema";
import {
  compareResponse,
  inputsResponse,
  resultsResponse,
  rulesResponse,
  schoolDetailResponse,
} from "@/lib/screening/types";

import { DATASETS, copy, fixtureIndex, readFixture } from "./fixtures";

const SCHEMAS: Record<string, Parameters<typeof parseWith>[0]> = {
  "/api/v1/screening/rules": rulesResponse,
  "/api/v1/screening/results": resultsResponse,
  "/api/v1/screening/compare": compareResponse,
  "/api/v1/screening/inputs": inputsResponse,
};

function schemaFor(requestPath: string) {
  if (requestPath.startsWith("/api/v1/screening/schools/by-key/")) return schoolDetailResponse;
  const schema = SCHEMAS[requestPath];
  if (!schema)
    throw new Error(`No schema for ${requestPath}: add it to lib/screening/types.ts and this table.`);
  return schema;
}

describe.each(DATASETS)("responses the API sent, dataset %j", (dataset) => {
  const { requests } = fixtureIndex(dataset);

  it("has requests", () => {
    expect(requests.length).toBeGreaterThan(0);
  });

  it.each(requests.map((r) => [r.file, r] as const))("%s parses", (_file, request) => {
    const body = readFixture(request.file, dataset);
    if (request.status !== undefined) {
      // A failed read has no schema of its own: it is the API's error envelope, which the page shows in words.
      expect(request.status).toBeGreaterThanOrEqual(400);
      expect(body).toMatchObject({ error: { code: expect.any(String), message: expect.any(String) } });
      return;
    }
    expect(() => parseWith(schemaFor(request.path), body, request.file)).not.toThrow();
  });
});

describe("the scope codes and the persistence flag", () => {
  it("carries the scope code of every rank and of the manifest", () => {
    const parsed = parseWith(resultsResponse, readFixture("results/additive_u.json"), "results");
    expect(parsed.manifest.point_rank_scope_code).toBe("complete_under_rule");
    expect(parsed.manifest.rank_bounds_scope_code).toBe("eligible");
    for (const row of parsed.rows) {
      expect(row.point_rank.scope_code).toBe("complete_under_rule");
      expect(row.rank_bounds.scope_code).toBe("eligible");
    }
  });

  it("keeps the flag as true, false or null on the circulated rule and has none on any other rule", () => {
    const circulated = parseWith(resultsResponse, readFixture("results/additive_u.json"), "results");
    const flags = circulated.rows.map((row) => row.persistent_candidate);
    expect(flags).toContain(true);
    expect(flags).toContain(false);
    expect(flags).toContain(null);
    for (const rule of ["additive_no_u", "need_first_u", "bottleneck_no_u", "benchmark"]) {
      const other = parseWith(resultsResponse, readFixture(`results/${rule}.json`), rule);
      expect(
        other.rows.every((row) => !("persistent_candidate" in row)),
        rule
      ).toBe(true);
    }
  });

  it("keeps the margin fields where the flag is, and they agree with it", () => {
    const circulated = parseWith(resultsResponse, readFixture("results/additive_u.json"), "results");
    for (const row of circulated.rows) {
      if (row.persistent_candidate === null) {
        expect([row.lowest_top20_frequency, row.threshold_adjacent]).toEqual([null, null]);
      } else {
        expect(typeof row.lowest_top20_frequency).toBe("number");
        // Adjacent only when persistent, and only when just above the 0.80 line.
        if (row.threshold_adjacent) expect(row.persistent_candidate).toBe(true);
        if (row.persistent_candidate === false) expect(row.threshold_adjacent).toBe(false);
      }
    }
    expect(circulated.rows.some((row) => row.threshold_adjacent === true)).toBe(true);
    expect(circulated.rows.some((row) => row.threshold_adjacent === false)).toBe(true);
    const other = parseWith(resultsResponse, readFixture("results/additive_no_u.json"), "results");
    expect(
      other.rows.every((row) => !("lowest_top20_frequency" in row) && !("threshold_adjacent" in row))
    ).toBe(true);
  });

  it("carries the scope code of a comparison's ranks and cohort", () => {
    const compared = parseWith(
      compareResponse,
      readFixture("compare/additive_u__additive_no_u.json"),
      "compare"
    );
    expect(compared.common_cohort_scope_code).toBe("common_complete_cohort");
    for (const rank of [...compared.ranks, ...compared.entrants, ...compared.exits]) {
      expect(rank.rank_scope_code).toBe("common_complete_cohort");
    }
  });

  it("keeps the flag only on the circulated rule's entry of a school's detail", () => {
    const detail = parseWith(
      schoolDetailResponse,
      readFixture(fixtureIndex().requests.find((r) => r.path.includes("/by-key/"))!.file),
      "detail"
    );
    const flagged = detail.rules.filter((entry) => "persistent_candidate" in entry);
    expect(flagged.map((entry) => entry.rule.rule_id)).toEqual(["additive_u"]);
    for (const entry of detail.rules) expect(entry.point_rank_scope_code).toBe("complete_under_rule");
  });

  it("accepts a scope code the page does not know", () => {
    const body = copy(readFixture("results/additive_u.json")) as {
      rows: Array<{ rank_bounds: { scope_code: string } }>;
    };
    body.rows[0].rank_bounds.scope_code = "a_scope_added_later";
    const parsed = parseWith(resultsResponse, body, "results");
    expect(parsed.rows[0].rank_bounds.scope_code).toBe("a_scope_added_later");
  });

  it("rejects a flag that is not true, false or null", () => {
    const body = copy(readFixture("results/additive_u.json")) as { rows: Array<Record<string, unknown>> };
    body.rows[0].persistent_candidate = "yes";
    expect(() => parseWith(resultsResponse, body, "Screening results")).toThrow(
      'rows[0].persistent_candidate: expected a boolean, got string "yes"'
    );
  });
});

describe("the bulk inputs", () => {
  it("holds every school once, with the same inputs as its detail", () => {
    const bulk = parseWith(inputsResponse, readFixture("inputs.json"), "inputs");
    const results = parseWith(resultsResponse, readFixture("results/additive_u.json"), "results");
    expect(bulk.schools.map((s) => s.school_key).sort()).toEqual(
      results.rows.map((row) => row.school.school_key).sort()
    );
    const request = fixtureIndex().requests.find((r) => r.path.includes("/by-key/"))!;
    const detail = readFixture(request.file) as { school: { school_key: string }; inputs: unknown };
    expect(bulk.schools.find((s) => s.school_key === detail.school.school_key)?.inputs).toEqual(
      detail.inputs
    );
  });

  it("keeps an unknown reading as null, never zero", () => {
    const bulk = parseWith(inputsResponse, readFixture("inputs.json"), "inputs");
    const values = bulk.schools.flatMap((s) => Object.values(s.inputs));
    expect(values).toContain(null);
  });

  it("names the path of a removed key", () => {
    const body = copy(readFixture("inputs.json")) as { schools: Array<Record<string, unknown>> };
    delete body.schools[2].school_key;
    expect(() => parseWith(inputsResponse, body, "Screening inputs")).toThrow(
      "Screening inputs: schools[2].school_key: expected a string, got undefined"
    );
  });
});

describe("a response that no longer matches", () => {
  it("names the path of a removed field", () => {
    const body = copy(readFixture("results/additive_u.json")) as {
      rows: Array<{ school: Record<string, unknown> }>;
    };
    delete body.rows[3].school.school_key;
    expect(() => parseWith(resultsResponse, body, "Screening results")).toThrow(
      "Screening results: rows[3].school.school_key: expected a string, got undefined"
    );
  });

  it("names the value of a wrong cohort", () => {
    const body = copy(readFixture("results/additive_u.json")) as { rows: Array<Record<string, unknown>> };
    body.rows[0].cohort = "finished";
    expect(() => parseWith(resultsResponse, body, "Screening results")).toThrow(
      'rows[0].cohort: expected one of "complete", "interval", "verification_queue", got string "finished"'
    );
  });

  it("rejects an interval school that carries one exact place", () => {
    const body = copy(readFixture("results/additive_u.json")) as {
      rows: Array<{ cohort: string; point_rank: { rank: number | null } }>;
    };
    const index = body.rows.findIndex((row) => row.cohort === "interval");
    body.rows[index].point_rank.rank = 3;
    expect(() => parseWith(resultsResponse, body, "Screening results")).toThrow(
      `rows[${index}]: expected ranks that agree with cohort "interval"`
    );
  });

  it("rejects a complete school without a place", () => {
    const body = copy(readFixture("results/additive_u.json")) as {
      rows: Array<{ point_rank: { rank: number | null } }>;
    };
    body.rows[0].point_rank.rank = null;
    expect(() => parseWith(resultsResponse, body, "Screening results")).toThrow(ParseError);
  });
});

describe("an additive API change", () => {
  it("ignores a field the API added", () => {
    const body = copy(readFixture("results/additive_u.json")) as { rows: Array<Record<string, unknown>> };
    body.rows[0].new_field = 1;
    const parsed = parseWith(resultsResponse, body, "Screening results");
    expect(parsed.rows[0]).not.toHaveProperty("new_field");
    expect(parsed.rows).toHaveLength(25);
  });

  it("does not need fields the page does not read", () => {
    const body = copy(readFixture("results/additive_u.json")) as { rows: Array<Record<string, unknown>> };
    for (const row of body.rows) {
      delete row.components;
      delete row.need_parts;
      delete row.area_parts;
      delete row.contributions;
      delete row.scores;
      delete row.placement;
      delete row.display_order;
    }
    expect(parseWith(resultsResponse, body, "Screening results").rows).toHaveLength(25);
  });

  it("accepts a rule role the page does not know", () => {
    const body = copy(readFixture("rules.json")) as { rules: Array<Record<string, unknown>> };
    body.rules[0].policy_role = "a_role_added_later";
    expect(parseWith(rulesResponse, body, "Screening rules").rules[0].policy_role).toBe("a_role_added_later");
  });
});
