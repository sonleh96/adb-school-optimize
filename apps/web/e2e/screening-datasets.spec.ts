/**
 * The column on the mock API's worst-case datasets (see scripts/mock-api.mjs). Failure modes and the test for each:
 *  1. An empty or failed list never tells the guide layer the map is ready, or shows counts beside its failure
 *     -> "an empty store and a failed list..."
 *  2. An empty Missing information tab says schools are in it, offers a grouping, or can be chosen
 *     -> "an empty Missing information tab..."
 *  3. Exact ties go unmarked, or the tie sentence is missing or repeated (R15)     -> "exact ties..."
 *  4. A blank name shows a raw value, a long unbroken name overflows its row, or "·" ends a line apart from its
 *     province (R6, R8)                                                             -> "blank and unbroken names..."
 *  5. A list of one school states counts from another dataset (R11)               -> "a list of one school..."
 */
import type { Page } from "@playwright/test";

import { LAYOUT } from "../lib/screening/copy";
import {
  INCOMPLETE,
  ORDERED,
  expect,
  orderedRow,
  tab,
  test,
  useMockDataset,
  waitForMap,
  waitForWorkspaceHook,
} from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

const column = (page: Page) => page.locator("section[aria-label='RISE-PNG']");

async function open(page: Page, search = "") {
  await page.goto(`/screening${search}`);
  await waitForMap(page);
}

test.describe("an empty store and a failed list", () => {
  const cases = [
    { name: "an empty store", dataset: "empty", fail: {}, state: "[data-empty]", words: LAYOUT.emptyData },
    {
      name: "a failing list",
      dataset: "default",
      fail: { results: 503 },
      state: "[role=alert][data-failure=server]",
      words: LAYOUT.loadFailed,
    },
  ] as const;
  for (const { name, dataset, fail, state, words } of cases) {
    test(`${name} shows one sentence with Retry and no counts, and the map still reports ready`, async ({
      page,
      context,
      problems,
    }) => {
      await useMockDataset(context, dataset, fail);
      await page.goto("/screening");
      const panel = page.locator(state);
      await expect(panel).toContainText(words);
      await expect(panel.getByRole("button", { name: LAYOUT.retry })).toBeVisible();
      await expect(tab(page, /The list/)).toHaveText("The list");
      await expect(page.locator(ORDERED)).toHaveCount(0);

      // The guide layer waits on `ready` before it starts; with no marks to draw, the map drawing is enough.
      await waitForWorkspaceHook(page);
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

test("an empty Missing information tab says no school is in it and cannot be chosen", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "worst-names");
  await open(page);
  const list = tab(page, /The list/);
  const queue = tab(page, /Missing information/);
  await expect(queue).toHaveText("Missing information(0)");
  await expect(queue).toBeDisabled();
  // The arrow keys pass over it.
  await list.focus();
  await page.keyboard.press("ArrowRight");
  await expect(list).toBeFocused();
  await expect(list).toHaveAttribute("aria-selected", "true");

  // A link can still open it. It says no school is in it, offers nothing to group, and it can be left.
  await open(page, "?view=queue");
  await expect(queue).toHaveAttribute("aria-selected", "true");
  await expect(queue).toBeEnabled();
  await expect(page.locator(`${INCOMPLETE} button`)).toHaveCount(0);
  await expect(page.locator("#screening-list header p").first()).toHaveText(
    "No school is left out of the list yet for any missing information. One would show what is missing. That says nothing about its need."
  );
  await expect(page.locator("#screening-list")).not.toContainText("Some schools");
  await expect(page.locator("[data-region=queue-missing], [data-region=queue-order]")).toHaveCount(0);
  await list.click();
  await expect(queue).toBeDisabled();
});

test("exact ties are marked on every tied row, with the tie sentence once after them", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "ties-and-ranges");
  await open(page);
  const tied = ["Ranked 08", "Tie Alpha", "Tie Bravo", "Tie Charlie"];
  // A tie marker names the other schools, each in a marked name, so a row is found by its own name only.
  const row = (name: string) =>
    page.locator(`${ORDERED} button`).filter({
      has: page.locator("span[class*=name]:not([data-name-kind])", { hasText: new RegExp(`^${name}$`) }),
    });
  for (const name of tied) {
    const others = tied.filter((n) => n !== name);
    await expect(row(name).locator("span[class*=tie]")).toHaveText(
      `Level with ${others[0]}, ${others[1]} and ${others[2]}`
    );
  }
  await expect(row("Ranked 12")).toHaveCount(1);
  await expect(row("Ranked 12").locator("span[class*=tie]")).toHaveCount(0);

  const sentence = page.locator(`${ORDERED} > [data-region=tie-rule]`);
  await expect(sentence).toHaveCount(1);
  await expect(sentence).toHaveText(
    "When two schools are exactly level, the one whose name comes first alphabetically goes first."
  );
  await expect(sentence.locator("xpath=preceding-sibling::li[1]//button")).toContainText("Tie Charlie");
});

test("blank and unbroken names render as words, stay inside their rows and keep the province whole", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "worst-names");
  await open(page);
  await expect(page.locator(`${ORDERED} button`)).toHaveCount(17);

  const text = await column(page).innerText();
  expect(text).not.toMatch(/\bnull\b|undefined|NaN/);
  // A name with nothing printable in it is the copy's unnamed school, with its province.
  await expect(orderedRow(page, "Unnamed school")).toContainText("16thUnnamed school · North Province");

  const report = await page.locator(`${ORDERED} button`).evaluateAll((rows) =>
    rows.map((row) => {
      const where = row.querySelector("span[class*=where]");
      return {
        name: row.querySelector("span[class*=name]")?.textContent,
        overflows: row.scrollWidth > row.clientWidth + 1,
        // One line box: the separator and the province never split, so "·" never ends a line (R6).
        whereLines: where ? where.getClientRects().length : 1,
      };
    })
  );
  expect(report.filter((r) => r.overflows || r.whereLines !== 1)).toEqual([]);
  expect(report.map((r) => r.name)).toContain("UnbrokenUnbrokenUnbrokenUnbrokenUnbrokenUnbrokenUnbrokenUnb");
});

test("a list of one school states only its own counts", async ({ page, context }) => {
  await useMockDataset(context, "one");
  await open(page);
  await expect(tab(page, /The list/)).toHaveText("The list(1)");
  await expect(tab(page, /Missing information/)).toHaveText("Missing information(0)");
  // Every count the column states is the one school's: its rank, its count, and no school in the other groups.
  // The rule area's "Other ways to order the list (5)" counts rules, not schools, and each row's Why line states the school's own
  // readings, so only the text that states counts is read: the statement, the tabs, the scope line and the list notes.
  const said = await page
    .locator(
      "[data-region=list-statement], [role=tablist], [data-region=scope], #screening-list li[data-region]"
    )
    .allInnerTexts();
  const numbers = said.join(" ").match(/\d+/g) ?? [];
  expect(numbers.length).toBeGreaterThan(0);
  expect(numbers.filter((n) => n !== "0" && n !== "1")).toEqual([]);
});
