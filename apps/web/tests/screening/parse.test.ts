/**
 * Failure modes: the app and the API disagree about a response.
 *  1. The API changes a shape the page reads and the app keeps compiling against the old one.
 *     Every response the API really sent (saved by the fixture script) must parse with the app's schemas, and a
 *     request that has no schema here fails the test, so a new endpoint cannot slip through unparsed.
 *  2. A field is renamed or removed and `undefined` flows into the page. The parse error must name the path.
 *  3. A row says "interval" but carries one exact place, or says "complete" with none. It is rejected at the
 *     boundary, so no later code has to wonder.
 *  4. The API adds a field, or a new member of an enum the page does not branch on. The page must keep working.
 */
import { describe, expect, it } from "vitest";

import { ParseError, parseWith } from "@/lib/screening/schema";
import { compareResponse, resultsResponse, rulesResponse, schoolDetailResponse } from "@/lib/screening/types";

import { copy, fixtureIndex, readFixture } from "./fixtures";

const SCHEMAS: Record<string, Parameters<typeof parseWith>[0]> = {
  "/api/v1/screening/rules": rulesResponse,
  "/api/v1/screening/results": resultsResponse,
  "/api/v1/screening/compare": compareResponse,
};

function schemaFor(requestPath: string) {
  if (requestPath.startsWith("/api/v1/screening/schools/by-key/")) return schoolDetailResponse;
  const schema = SCHEMAS[requestPath];
  if (!schema)
    throw new Error(`No schema for ${requestPath}: add it to lib/screening/types.ts and this table.`);
  return schema;
}

describe("responses the API sent", () => {
  const { requests } = fixtureIndex();

  it.each(requests.map((r) => [r.file, r] as const))("%s parses", (_file, request) => {
    expect(() => parseWith(schemaFor(request.path), readFixture(request.file), request.file)).not.toThrow();
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
