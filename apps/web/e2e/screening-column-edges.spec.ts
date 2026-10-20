/**
 * The column when a read fails, when the keyboard drives it, when the browser moves through its history and when the
 * rule changes faster than its list loads. Failure modes and the test for each:
 *  1. A URL that holds only defaults or junk is left as it was                -> "a URL that says nothing..."
 *  2. Back and Forward change the URL but not the screen                      -> "Back and Forward..."
 *  3. A comparison that failed to load is worded as a fact about the study ("no recorded comparison")
 *     -> "a comparison that fails to load..."
 *  4. The statement loses the two main rules' figures while What changed reads another pair
 *     -> "the statement keeps the main rules' figures..."
 */
import type { Page } from "@playwright/test";

import { LAYOUT } from "../lib/screening/copy";
import {
  APP_ORIGIN,
  ORDERED,
  ORDERED_COUNT,
  RULE,
  allowUncapturedComparisons,
  expect,
  mainRule,
  openWorkspace,
  test,
  useMockDataset,
} from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

const STATEMENT =
  "Which list should I use? This one, the paper's main rule, until the research team decides. Leaving urgency out keeps the same schools at the top among the 16 with every input recorded.";
const REASSURANCE =
  "Among the 16 schools with every input recorded, all 16 schools with every input recorded are in the top 20 with or without the urgency value. Leaving it out changes the order in the list, and the largest move for any school is 2 places. For the five schools that show a range, leaving it out can still move their possible places.";

const statement = (page: Page) => page.locator("[data-region=list-statement]");
const changed = (page: Page) => page.locator("[data-region=what-changed]");
const lead = (page: Page) => changed(page).locator("[data-region=changed-lead]");
const search = (page: Page) => new URL(page.url()).search;

test("a URL that says nothing but defaults and junk is tidied, keeping the keys other layers own", async ({
  page,
}) => {
  await openWorkspace(page, "?view=bogus&rule=additive_u&scope=0&qgroup=zzz&guide=q1");
  await expect.poll(() => search(page)).toBe("?guide=q1");
  await expect(page.locator(`${ORDERED} button`)).toHaveCount(ORDERED_COUNT);
});

test("Back and Forward bring back the screen each URL describes", async ({ page }) => {
  await openWorkspace(page);
  await mainRule(page, RULE.proposed).click();
  await expect(lead(page)).toHaveText(REASSURANCE);
  expect(search(page)).toBe("?rule=additive_no_u&compare=additive_u");

  // A jump within the page makes a new history entry; the switch then changes that entry's URL.
  await page.evaluate(() => (window.location.hash = "list"));
  await mainRule(page, RULE.main).click();
  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "true");
  expect(search(page)).toBe("?compare=additive_no_u");

  await page.goBack();
  expect(search(page)).toBe("?rule=additive_no_u&compare=additive_u");
  await expect(mainRule(page, RULE.proposed)).toHaveAttribute("aria-pressed", "true");
  await expect(lead(page)).toHaveText(REASSURANCE);

  await page.goForward();
  expect(search(page)).toBe("?compare=additive_no_u");
  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "true");
});

test("a comparison that fails to load says so and offers Retry, never that the study recorded none", async ({
  page,
  context,
  problems,
}) => {
  await useMockDataset(context, "default", { compare: 503 });
  await openWorkspace(page);
  await mainRule(page, RULE.proposed).click();

  const failed = changed(page).locator("[data-region=changed-failed]");
  await expect(failed).toHaveText(`${LAYOUT.loadFailed} ${LAYOUT.retry}`);
  await expect(changed(page)).not.toContainText("recorded comparison");
  await expect(lead(page)).toHaveCount(0);
  expect(problems.length).toBeGreaterThan(0);
  expect(problems.every((p) => p.includes("/screening/compare?") || p.includes("status of 503"))).toBe(true);
  problems.length = 0;

  // The service answers again: Retry brings the comparison, and focus stays in What changed.
  await context.addCookies([{ name: "mock-screening-fail", value: "", url: APP_ORIGIN }]);
  await failed.getByRole("button", { name: LAYOUT.retry }).press("Enter");
  await expect(lead(page)).toHaveText(REASSURANCE);
  await expect(changed(page).getByRole("button", { name: LAYOUT.hideComparison })).toBeFocused();
});

test("the statement keeps the main rules' figures while What changed reads another pair", async ({
  page,
  problems,
}) => {
  await openWorkspace(page, "?compare=need_first_u&view=queue");
  await expect(statement(page)).toHaveText(`${STATEMENT} ${LAYOUT.seeWithout}`);
  allowUncapturedComparisons(problems);
});
