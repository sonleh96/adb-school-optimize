/**
 * The column on the mock API's worst-case datasets (see scripts/mock-api.mjs). Failure modes and the test for each:
 *  1. An empty or failed list never tells the guide layer the map is ready, or shows counts beside its failure
 *     -> "an empty store and a failed list..."
 *  2. An empty Incomplete records tab says schools are in it, or can be chosen      -> "an empty Incomplete records tab..."
 */
import type { Page } from "@playwright/test";

import { COPY } from "../components/screening/copy";
import {
  INCOMPLETE,
  ORDERED,
  allowUncapturedComparisons,
  expect,
  tab,
  test,
  useMockDataset,
  waitForMap,
} from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

async function open(page: Page, search = "") {
  await page.goto(`/screening${search}`);
  await waitForMap(page);
}

test.describe("an empty store and a failed list", () => {
  const cases = [
    { name: "an empty store", dataset: "empty", fail: {}, failure: "not_found" },
    { name: "a failing list", dataset: "default", fail: { results: 503 }, failure: "server" },
  ] as const;
  for (const { name, dataset, fail, failure } of cases) {
    test(`${name} shows one failure with Retry and no counts, and the map still reports ready`, async ({
      page,
      context,
      problems,
    }) => {
      await useMockDataset(context, dataset, fail);
      await page.goto("/screening");
      const alert = page.locator("[role=alert][data-failure]");
      await expect(alert).toHaveAttribute("data-failure", failure);
      await expect(alert).toContainText(COPY.failure[failure]);
      await expect(alert.getByRole("button", { name: COPY.retry })).toBeVisible();
      await expect(tab(page, /The list/)).toHaveText("The list");
      await expect(page.locator(ORDERED)).toHaveCount(0);

      // The guide layer waits on `ready` before it starts; with no marks to draw, the map drawing is enough.
      const ready = await page.evaluate(() =>
        Promise.race([
          window.__screeningWorkspace!.ready.then(() => "ready"),
          new Promise((resolve) => setTimeout(() => resolve("still waiting"), 20_000)),
        ])
      );
      expect(ready).toBe("ready");
      await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
      // The failed requests were asked for.
      expect(problems.length).toBeGreaterThan(0);
      problems.length = 0;
    });
  }
});

test("an empty Incomplete records tab says no school is in it and cannot be chosen", async ({
  page,
  context,
  problems,
}) => {
  await useMockDataset(context, "worst-names");
  await open(page);
  const list = tab(page, /The list/);
  const queue = tab(page, /Incomplete records/);
  await expect(queue).toHaveText("Incomplete records(0)");
  await expect(queue).toBeDisabled();
  // The arrow keys pass over it.
  await list.focus();
  await page.keyboard.press("ArrowRight");
  await expect(list).toBeFocused();
  await expect(list).toHaveAttribute("aria-selected", "true");

  // A link can still open it. It claims no school, and it can be left.
  await open(page, "?view=queue");
  await expect(queue).toHaveAttribute("aria-selected", "true");
  await expect(queue).toBeEnabled();
  await expect(page.locator(`${INCOMPLETE} button`)).toHaveCount(0);
  await expect(page.locator("#screening-list")).not.toContainText("Some schools");
  await expect(page.locator("#screening-list")).not.toContainText("what is missing");
  await list.click();
  await expect(queue).toBeDisabled();
  allowUncapturedComparisons(problems);
});
