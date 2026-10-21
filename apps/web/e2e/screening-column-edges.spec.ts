/**
 * The column when a read fails, when the keyboard drives it, when the browser moves through its history and when the
 * rule changes faster than its list loads. Failure modes and the test for each:
 *  1. A URL that holds only defaults or junk is left as it was                -> "a URL that says nothing..."
 *  2. Back and Forward change the URL but not the screen                      -> "Back and Forward..."
 *  3. A comparison that failed to load is worded as a fact about the study ("no recorded comparison")
 *     -> "a comparison that fails to load..."
 *  4. The statement loses the two main rules' figures while What changed reads another pair
 *     -> "the statement keeps the main rules' figures..."
 *  5. The statement or the rule line of the previous rule shows beside the rule just pressed
 *     -> "while the rule just pressed loads..."
 *  6. A rule pressed and left before its list loaded becomes the one What changed compares with
 *     -> "a rule left before its list loaded..."
 *  7. A control that removes itself on use drops focus on the page          -> "each column control that removes..."
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
  waitForMap,
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
const ruleLine = (page: Page) => page.locator("[data-region=rule-role]");
const search = (page: Page) => new URL(page.url()).search;

/** Holds the list of `rule` back until the returned function is called. */
async function holdList(page: Page, rule: string) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(new RegExp(`/api/v1/screening/results\\?rule=${rule}$`), async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

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

test("while the rule just pressed loads, neither the statement nor a rule line speaks for the previous rule", async ({
  page,
}) => {
  const release = await holdList(page, "additive_no_u");
  await openWorkspace(page);
  await expect(statement(page)).toBeVisible();

  await mainRule(page, RULE.proposed).click();
  await expect(mainRule(page, RULE.proposed)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(ORDERED)).toHaveAttribute("aria-busy", "true");
  await expect(statement(page)).toHaveCount(0);
  await expect(ruleLine(page)).toHaveCount(0);

  release();
  await expect(page.locator(ORDERED)).toHaveAttribute("aria-busy", "false");
  await expect(lead(page)).toHaveText(REASSURANCE);
  await expect(ruleLine(page)).toContainText("leaves urgency out");
});

test("a rule left before its list loaded is not the one What changed compares with", async ({
  page,
  problems,
}) => {
  const release = await holdList(page, "additive_no_u");
  await openWorkspace(page);

  await mainRule(page, RULE.proposed).click();
  await mainRule(page, RULE.main).click();
  // The list on screen never changed, so there is nothing to compare.
  expect(search(page)).toBe("");

  release();
  await expect(page.locator(ORDERED)).toHaveAttribute("aria-busy", "false");
  await expect(changed(page)).toHaveCount(0);
  await expect(statement(page)).toHaveText(`${STATEMENT} ${LAYOUT.seeWithout}`);
  // Switching back hands the held read from one hook to another, and the query library cancels it on the way and
  // asks again. The browser reports the cancelled read as a failed request; nothing else may fail.
  const cancelled = `requestfailed: ${APP_ORIGIN}/api/v1/screening/results?rule=additive_no_u`;
  expect(problems.filter((p) => p !== cancelled)).toEqual([]);
  problems.length = 0;
});

test("each column control that removes itself on use hands focus to the rule's own control", async ({
  page,
  problems,
}) => {
  await openWorkspace(page);
  const other = page.getByRole("button", { name: "Other rules (5)" });

  await statement(page).getByRole("button", { name: LAYOUT.seeWithout }).press("Enter");
  await expect(mainRule(page, RULE.proposed)).toBeFocused();

  await changed(page).getByRole("button", { name: LAYOUT.hideComparison }).press("Enter");
  await expect(changed(page)).toHaveCount(0);
  await expect(mainRule(page, RULE.proposed)).toBeFocused();

  await ruleLine(page).getByRole("button", { name: LAYOUT.backToMainRule }).press("Enter");
  await expect(mainRule(page, RULE.main)).toBeFocused();

  await mainRule(page, RULE.proposed).press("Enter");
  await changed(page).getByRole("button", { name: LAYOUT.backToMainRule }).press("Enter");
  await expect(changed(page)).toHaveCount(0);
  await expect(mainRule(page, RULE.main)).toBeFocused();

  await other.press("Enter");
  await page
    .locator("#screening-other-rules")
    .getByRole("button", { name: new RegExp(`^${RULE.needFirst}`) })
    .press("Enter");
  await expect(page.locator("#screening-other-rules")).toHaveCount(0);
  await expect(other).toBeFocused();
  await waitForMap(page);
  allowUncapturedComparisons(problems);
});
