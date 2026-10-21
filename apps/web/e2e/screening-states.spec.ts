/**
 * The workspace when things are slow, stale or broken. Failure modes and the test for each:
 *  1. A rule switch shows the previous rule's rows, marks and card under the new rule's name
 *     -> "while the next rule loads..." (a delayed second rule: everything on screen is labelled by its own
 *        data, and the list, map, legend and card are dimmed and busy together)
 *  2. A 401 reads like any failure, so the user retries instead of signing in; 404, 5xx and an unreadable body
 *     are worded alike, and a parse failure leaves no trace in the console
 *     -> "tells ... apart"
 *  3. Counts show before there is data, or the page looks empty while it loads -> "a slow first load..."
 *  4. The basemap's style fails and the page breaks or stops panning to a selection -> "without the basemap..."
 *  5. A failed request for the expected default rule's list shows an error while the rules still load
 *     -> "a failed speculative list..." (the rules name another default: the list loads; the same default: it fails)
 */
import type { Page } from "@playwright/test";

import { COPY } from "../components/screening/copy";
import {
  ORDERED,
  ORDERED_COUNT,
  RULE,
  mainRule,
  tab,
  expect,
  keyOf,
  listNames,
  mapLocator,
  markAt,
  openWorkspace,
  orderedNames,
  orderedRow,
  ringDrawnAround,
  rowsOf,
  settledMark,
  test,
  waitForMap,
} from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

const RESULTS = (rule: string) => new RegExp(`/api/v1/screening/results\\?rule=${rule}$`);

test("while the next rule loads, everything on screen is labelled by the rows it shows and is dimmed together", async ({
  page,
}) => {
  // The page may ask for this list before the switch (it reads both main rules); it is held until the test lets go.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(RESULTS("additive_no_u"), async (route) => {
    await held;
    await route.continue();
  });
  await openWorkspace(page);
  await orderedRow(page, "Sample School 15").click();
  await expect(page.getByTestId("card-rule")).toHaveText(COPY.cardRule("Additive, urgency included"));

  await mainRule(page, RULE.proposed).click();

  // The switch shows what was asked for; everything else names the rows actually on screen.
  await expect(mainRule(page, RULE.proposed)).toHaveAttribute("aria-pressed", "true");
  const legend = page.locator("[data-slot=legend]");
  const card = page.locator("[data-slot=school-card]");
  const list = page.locator(ORDERED);
  await expect(legend).toHaveAttribute("aria-busy", "true");
  await expect(card).toHaveAttribute("aria-busy", "true");
  await expect(list).toHaveAttribute("aria-busy", "true");
  await expect(mapLocator(page)).toHaveAttribute("data-stale", "true");
  await expect(mapLocator(page)).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("[data-rank-label][data-stale=true]").first()).toBeVisible();
  await expect(page.locator("[data-rank-label][data-stale=false]")).toHaveCount(0);
  await expect(page.getByTestId("legend-rule")).toContainText("Additive, urgency included");
  await expect(page.getByTestId("card-rule")).toHaveText(COPY.cardRule("Additive, urgency included"));
  await expect(orderedRow(page, "Sample School 23")).toHaveCount(0);

  // A stale mark cannot be picked: the click does nothing.
  const point = await settledMark(page, keyOf("additive_u", "Sample School 12"));
  await page.mouse.click(point.x, point.y);
  await expect(orderedRow(page, "Sample School 12")).toHaveAttribute("aria-pressed", "false");

  // Then the new rule's rows arrive and everything is relabelled together.
  release();
  await expect(page.getByTestId("legend-rule")).toContainText("Additive, urgency omitted");
  await expect(page.getByTestId("card-rule")).toHaveText(COPY.cardRule("Additive, urgency omitted"));
  await expect(orderedRow(page, "Sample School 23")).toHaveCount(1);
  await expect(legend).toHaveAttribute("aria-busy", "false");
  await expect(card).toHaveAttribute("aria-busy", "false");
  await expect(list).toHaveAttribute("aria-busy", "false");
  await expect(mapLocator(page)).toHaveAttribute("data-stale", "false");
  await expect(page.locator("[data-rank-label][data-stale=true]")).toHaveCount(0);
  await expect(page.locator("[data-rank-label][data-stale=false]").first()).toBeVisible();
});

test("a slow first load shows that it is loading, with no counts, then the counts", async ({ page }) => {
  await page.route(RESULTS("additive_u"), async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto("/screening");
  await expect(page.getByRole("status").filter({ hasText: COPY.loading })).toBeVisible();
  await expect(tab(page, /The list/)).toHaveText("The list");
  await expect(tab(page, /Incomplete records/)).toHaveText("Incomplete records");
  await expect(page.locator(`${ORDERED} button`)).toHaveCount(ORDERED_COUNT);
  await expect(tab(page, /The list/)).toHaveText(`The list(${ORDERED_COUNT})`);
  await waitForMap(page);
});

test("the map's scripts are not fetched until the list has loaded, so they never compete with it", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(RESULTS("additive_u"), async (route) => {
    await held;
    await route.continue();
  });
  const scripts = new Set<string>();
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.add(request.url());
  });
  await page.goto("/screening");
  await expect(page.getByRole("status").filter({ hasText: COPY.loading })).toBeVisible();

  // Let the page's own scripts finish arriving. With the list still held back, no map may have started.
  let seen = -1;
  while (seen !== scripts.size) {
    seen = scripts.size;
    await page.waitForTimeout(1000);
  }
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  const before = scripts.size;

  release();
  await expect(page.locator(`${ORDERED} button`)).toHaveCount(ORDERED_COUNT);
  await waitForMap(page);
  expect(scripts.size).toBeGreaterThan(before);
});

test.describe("tells a session that ended, a missing list, a failing service and an unreadable answer apart", () => {
  const cases = [
    { name: "401", status: 401, body: '{"error":{"code":"unauthorized"}}', failure: "session" },
    { name: "404", status: 404, body: '{"error":{"code":"run_not_found"}}', failure: "not_found" },
    { name: "500", status: 500, body: '{"error":{"code":"internal"}}', failure: "server" },
  ] as const;

  for (const { name, status, body, failure } of cases) {
    test(`${name} is worded as ${failure}`, async ({ page, problems }) => {
      await page.route(RESULTS("additive_u"), (route) =>
        route.fulfill({ status, contentType: "application/json", body })
      );
      await page.goto("/screening");

      const alert = page.locator("[data-failure]");
      await expect(alert).toHaveAttribute("data-failure", failure);
      await expect(alert).toContainText(COPY.failure[failure]);
      if (failure === "session") {
        // The way out is signing in, to a page that returns here afterwards.
        const link = alert.getByRole("link", { name: COPY.signIn });
        await expect(link).toHaveAttribute("href", "/sign-in?next=%2Fscreening");
        await expect(alert.getByRole("button")).toHaveCount(0);
      } else {
        await expect(alert.getByRole("button", { name: COPY.retry })).toBeVisible();
      }
      // No counts and no stale list beside a failure.
      await expect(tab(page, /The list/)).toHaveText("The list");
      await expect(page.locator(ORDERED)).toHaveCount(0);
      expect(problems.some((p) => p.startsWith(`${status}:`))).toBe(true);
      problems.length = 0;
    });
  }

  test("an answer that does not match what the page reads is worded as unreadable and logged", async ({
    page,
    problems,
  }) => {
    await page.route(RESULTS("additive_u"), (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"rows": 5}' })
    );
    await page.goto("/screening");

    await expect(page.locator("[data-failure]")).toHaveAttribute("data-failure", "malformed");
    await expect(page.locator("[data-failure]")).toContainText(COPY.failure.malformed);
    // A developer finds the cause in the console: which response and which field.
    expect(problems.some((p) => p.startsWith("error: ") && p.includes("Screening results: run:"))).toBe(true);
    problems.length = 0;
  });

  test("a provenance block of another shape leaves the list whole and says so once in the console", async ({
    page,
    problems,
  }) => {
    await page.route(RESULTS("additive_u"), async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.persistence = { standard_error: "n/a" };
      await route.fulfill({ response, json: body });
    });
    await openWorkspace(page);

    // The list is whole, and the console names the field, so a changed API is seen without a broken page.
    const warnings = problems.filter(
      (p) => p.startsWith("warning: ") && p.includes("persistence.standard_error")
    );
    expect(warnings).toHaveLength(1);
    expect(problems.filter((p) => !warnings.includes(p))).toEqual([]);
    problems.length = 0;
  });

  test("an answer that is not JSON is worded as unreadable and logged", async ({ page, problems }) => {
    await page.route(RESULTS("additive_u"), (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html>sign in</html>" })
    );
    await page.goto("/screening");

    await expect(page.locator("[data-failure]")).toHaveAttribute("data-failure", "malformed");
    expect(problems.some((p) => p.includes("Screening results: the response was not JSON"))).toBe(true);
    problems.length = 0;
  });

  test("a retry after a failure loads the list", async ({ page, problems }) => {
    let failing = true;
    await page.route(RESULTS("additive_u"), (route) =>
      failing ? route.fulfill({ status: 503, contentType: "application/json", body: "{}" }) : route.continue()
    );
    await page.goto("/screening");
    await expect(page.locator("[data-failure]")).toHaveAttribute("data-failure", "server");
    problems.length = 0;

    failing = false;
    await page.getByRole("button", { name: COPY.retry }).click();
    await expect(page.locator(`${ORDERED} button`)).toHaveCount(ORDERED_COUNT);
    await expect(page.locator("[data-failure]")).toHaveCount(0);
  });
});

test("without the basemap the page says so, the marks still draw and a selection still pans the map", async ({
  page,
  problems,
}) => {
  await page.route("**/api/v1/test/basemap-style.json", (route) => route.abort());
  await page.goto("/screening");
  await expect(page.getByRole("heading", { name: "RISE-PNG", level: 1 })).toBeVisible();
  await waitForMap(page);
  await expect(page.getByTestId("basemap-notice")).toHaveText(COPY.basemapUnavailable);
  await expect(mapLocator(page)).toHaveAttribute("data-basemap", "failed");
  await expect(page.locator(`${ORDERED} button`)).toHaveCount(ORDERED_COUNT);

  // Zoom in on the middle of the map until some marks are off screen.
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(400);
  }
  const target = await (async () => {
    for (const row of rowsOf("additive_u").filter((r) => r.cohort !== "verification_queue")) {
      const point = await markAt(page, row.school.school_key);
      if (point && (point.x < 480 || point.x > 1550 || point.y < 120 || point.y > 940)) {
        return { name: row.school.source_school_name, key: row.school.school_key };
      }
    }
    throw new Error("Zooming in left every mark on screen");
  })();

  // Choosing it in the list brings its mark into the clear part of the map, without a basemap.
  await page.locator("ol button", { hasText: target.name }).first().click();
  await expect(mapLocator(page)).toHaveAttribute("data-selected-key", target.key);
  await expect
    .poll(async () => {
      const point = await markAt(page, target.key);
      return point !== null && point.x >= 440 && point.x <= 1160 && point.y >= 100 && point.y <= 900;
    })
    .toBe(true);

  // The marks still draw: the ring is on the selected mark (whichever size of mark it is).
  await expect
    .poll(async () => {
      for (const radius of [8, 6.5, 5.5, 4.5, 4]) {
        if (await ringDrawnAround(page, target.key, radius)) return true;
      }
      return false;
    })
    .toBe(true);

  expect(problems.some((p) => p.includes("basemap-style.json"))).toBe(true);
  problems.length = 0;
});

/**
 * The page asks for the expected default rule's list before the rules say which rule is the default. This holds
 * the rules back until the returned function releases them, refuses that speculative list (its one retry is
 * refused too), and answers the rules with `rulesDefault` as the default. It resolves once the page is holding.
 */
async function refuseSpeculativeListWhileRulesHeld(page: Page, rulesDefault: string) {
  let release!: () => void;
  const rulesHeld = new Promise<void>((resolve) => (release = resolve));
  let speculativeRequests = 0;
  await page.route(RESULTS("additive_u"), (route) => {
    speculativeRequests += 1;
    return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/v1/screening/rules", async (route) => {
    await rulesHeld;
    const body = await (await route.fetch()).json();
    await route.fulfill({ json: { ...body, default_rule_id: rulesDefault } });
  });
  await page.goto("/screening");
  // A failed list is retried once, so the failure is final after the second refusal.
  await expect.poll(() => speculativeRequests).toBe(2);
  await page.waitForTimeout(300);
  // The page's failure is the alert with a failure kind; other alerts on the page (the route announcer) are empty.
  await expect(page.locator("[role=alert][data-failure]")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: COPY.loading })).toBeVisible();
  return release;
}

test("a failed speculative list is not an error while the rules load, and the list loads when they name another default", async ({
  page,
  problems,
}) => {
  const release = await refuseSpeculativeListWhileRulesHeld(page, "additive_no_u");

  release();
  await expect(page.locator(`${ORDERED} button`)).toHaveCount(orderedNames("additive_no_u").length);
  expect(await listNames(page)).toEqual(orderedNames("additive_no_u"));
  await expect(page.locator("[role=alert][data-failure]")).toHaveCount(0);
  // The two refused requests were expected; they are not problems.
  problems.length = 0;
});

test("a failed speculative list shows its failure once the rules name the same default", async ({
  page,
  problems,
}) => {
  const release = await refuseSpeculativeListWhileRulesHeld(page, "additive_u");

  release();
  const failure = page.locator("[role=alert][data-failure]");
  await expect(failure).toHaveAttribute("data-failure", "server");
  await expect(failure.getByRole("button", { name: COPY.retry })).toBeVisible();
  problems.length = 0;
});
