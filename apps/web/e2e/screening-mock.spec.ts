/**
 * The mock API serves each fixture dataset by name and fails a named route on request. Failure modes and the test
 * for each:
 *  1. A test that picks a dataset gets the default one, or another test's dataset (they run in parallel)
 *     -> "each dataset answers with its own schools", "the choice belongs to one context"
 *  2. The choice does not survive the app's same-origin proxy, so a browser test cannot use it
 *     -> "the choice reaches the mock through the app's proxy"
 *  3. The empty dataset answers 200 with a made-up body, so the empty and failed-load states are never reached
 *     -> "the empty dataset answers with the API's own 404"
 *  4. A failure hits routes it was not asked to hit, or no route
 *     -> "a named route fails and the others do not"
 *  5. A request the fixtures never captured, or a dataset that does not exist, gets a plausible answer
 *     -> "an unknown dataset and an uncaptured request fail loudly"
 */
import { expect, test } from "@playwright/test";

import { type MockDataset, useMockDataset } from "./screening-helpers";

const MOCK = "http://127.0.0.1:4100/api/v1/screening";
const rowCount = async (response: { json: () => Promise<{ rows: unknown[] }> }) =>
  (await response.json()).rows.length;

const EXPECTED_ROWS: Array<[MockDataset, number]> = [
  ["default", 25],
  ["worst-names", 17],
  ["ties-and-ranges", 27],
  ["one", 1],
];

test.describe("the mock API's datasets", () => {
  for (const [dataset, rows] of EXPECTED_ROWS) {
    test(`each dataset answers with its own schools: ${dataset}`, async ({ request }) => {
      const headers = { "x-mock-screening-dataset": dataset };
      const results = await request.get(`${MOCK}/results?rule=additive_u`, { headers });
      expect(results.status()).toBe(200);
      expect(await rowCount(results)).toBe(rows);

      const inputs = await request.get(`${MOCK}/inputs`, { headers });
      expect(inputs.status()).toBe(200);
      expect((await inputs.json()).schools).toHaveLength(rows);
    });
  }

  test("a request without a choice gets the default dataset", async ({ request }) => {
    expect(await rowCount(await request.get(`${MOCK}/results?rule=additive_u`))).toBe(25);
  });

  test("the empty dataset answers with the API's own 404", async ({ request }) => {
    const headers = { "x-mock-screening-dataset": "empty" };
    const rules = await request.get(`${MOCK}/rules`, { headers });
    expect(rules.status()).toBe(200);
    expect((await rules.json()).input_versions).toEqual([]);

    for (const route of ["results?rule=additive_u", "inputs"]) {
      const response = await request.get(`${MOCK}/${route}`, { headers });
      expect(response.status(), route).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "no_input_versions", message: "No screening input version is loaded." },
      });
    }
  });

  test("a named route fails and the others do not", async ({ request }) => {
    const headers = { "x-mock-screening-fail": "results:503|inputs:500" };
    const failed = await request.get(`${MOCK}/results?rule=additive_u`, { headers });
    expect(failed.status()).toBe(503);
    expect((await failed.json()).error.code).toBe("mock_failure");
    expect((await request.get(`${MOCK}/inputs`, { headers })).status()).toBe(500);
    expect((await request.get(`${MOCK}/rules`, { headers })).status()).toBe(200);
    expect((await request.get(`${MOCK}/compare?a=additive_u&b=additive_no_u`, { headers })).status()).toBe(
      200
    );
  });

  test("an unknown dataset and an uncaptured request fail loudly", async ({ request }) => {
    const unknown = await request.get(`${MOCK}/rules`, { headers: { "x-mock-screening-dataset": "nope" } });
    expect(unknown.status()).toBe(501);
    expect((await unknown.json()).error.code).toBe("fixture_dataset_unknown");

    const uncaptured = await request.get(`${MOCK}/results?rule=additive_u&province=Nowhere`);
    expect(uncaptured.status()).toBe(501);
    expect((await uncaptured.json()).error.code).toBe("fixture_not_captured");
  });

  test("the choice reaches the mock through the app's proxy", async ({ context }) => {
    await useMockDataset(context, "worst-names", { inputs: 502 });
    const results = await context.request.get("/api/v1/screening/results?rule=additive_u");
    expect(await rowCount(results)).toBe(17);
    expect((await context.request.get("/api/v1/screening/inputs")).status()).toBe(502);
  });

  test("the choice belongs to one context", async ({ browser }) => {
    const [first, second] = await Promise.all([browser.newContext(), browser.newContext()]);
    try {
      await useMockDataset(first, "one");
      await useMockDataset(second, "ties-and-ranges");
      const url = "http://127.0.0.1:3105/api/v1/screening/results?rule=additive_u";
      expect(await rowCount(await first.request.get(url))).toBe(1);
      expect(await rowCount(await second.request.get(url))).toBe(27);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});
