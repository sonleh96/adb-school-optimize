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
 *  8. The arrow keys do nothing on the tabs                                   -> "the arrow keys move..."
 *  9. Data that parses but cannot be worded blanks the page                   -> "data the copy cannot word..."
 */
import type { Page } from "@playwright/test";

import { LAYOUT } from "../lib/screening/copy";
import {
  APP_ORIGIN,
  INCOMPLETE,
  MAIN_RULE,
  ORDERED,
  ORDERED_COUNT,
  RULE,
  expect,
  mainRule,
  openRules,
  ruleChange,
  openWorkspace,
  queuedNames,
  tab,
  test,
  useMockDataset,
  waitForMap,
  waitForWorkspaceHook,
} from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

const STATEMENT =
  "Which list should I use? This one, the main method. The urgency rating is left out because no one could trace where it came from, which says nothing about real hazards. Adding it back keeps the same schools at the top among the 16 schools with one rank under both methods.";
const REASSURANCE =
  "Among the 16 schools with one rank under both methods, all 16 schools being compared are in the top 20 with or without the urgency rating. Adding it back changes the order in the list, and the largest move for any school is 2 ranks. For the five schools that show a range, adding it back can still move their possible ranks.";

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
  // `guide=start` stands for a key another layer owns; that layer writes it back as it is.
  await openWorkspace(page, "?view=bogus&rule=additive_no_u&scope=0&qgroup=zzz&guide=start");
  await expect.poll(() => search(page)).toBe("?guide=start");
  await expect(page.locator(`${ORDERED} button`)).toHaveCount(ORDERED_COUNT);
});

test("Back and Forward bring back the screen each URL describes", async ({ page }) => {
  await openWorkspace(page);
  await openRules(page);
  await mainRule(page, RULE.urgency).click();
  await expect(lead(page)).toHaveText(REASSURANCE);
  expect(search(page)).toBe("?rule=additive_u&compare=additive_no_u");

  // A jump within the page makes a new history entry; the switch then changes that entry's URL. Moving through the
  // history reads each address afresh, so the rule area, which no address keeps, is opened again each time.
  await page.evaluate(() => (window.location.hash = "list"));
  await openRules(page);
  await mainRule(page, RULE.main).click();
  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "true");
  expect(search(page)).toBe("?compare=additive_u");

  await page.goBack();
  expect(search(page)).toBe("?rule=additive_u&compare=additive_no_u");
  await openRules(page);
  await expect(mainRule(page, RULE.urgency)).toHaveAttribute("aria-pressed", "true");
  await expect(lead(page)).toHaveText(REASSURANCE);

  await page.goForward();
  expect(search(page)).toBe("?compare=additive_u");
  await openRules(page);
  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "true");
});

test("a comparison that fails to load says so and offers Retry, never that the study recorded none", async ({
  page,
  context,
  problems,
}) => {
  await useMockDataset(context, "default", { compare: 503 });
  await openWorkspace(page);
  await openRules(page);
  await mainRule(page, RULE.urgency).click();

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
}) => {
  await openWorkspace(page, "?compare=need_first_u&view=queue");
  await openRules(page);
  await expect(statement(page)).toHaveText(`${STATEMENT} ${LAYOUT.seeWithUrgency}`);
});

test("while the rule just pressed loads, neither the statement nor a rule line speaks for the previous rule", async ({
  page,
}) => {
  const release = await holdList(page, "additive_u");
  await openWorkspace(page);
  await openRules(page);
  await expect(statement(page)).toBeVisible();

  await mainRule(page, RULE.urgency).click();
  await expect(mainRule(page, RULE.urgency)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(ORDERED)).toHaveAttribute("aria-busy", "true");
  await expect(statement(page)).toHaveCount(0);
  await expect(ruleLine(page)).toHaveCount(0);

  release();
  await expect(page.locator(ORDERED)).toHaveAttribute("aria-busy", "false");
  await expect(lead(page)).toHaveText(REASSURANCE);
  await expect(ruleLine(page)).toContainText("urgency is one of them");
});

test("a rule left before its list loaded is not the one What changed compares with", async ({
  page,
  problems,
}) => {
  const release = await holdList(page, "additive_u");
  await openWorkspace(page);

  await openRules(page);
  await mainRule(page, RULE.urgency).click();
  await mainRule(page, RULE.main).click();
  // The list on screen never changed, so there is nothing to compare.
  expect(search(page)).toBe("");

  release();
  await expect(page.locator(ORDERED)).toHaveAttribute("aria-busy", "false");
  await expect(changed(page)).toHaveCount(0);
  await expect(statement(page)).toHaveText(`${STATEMENT} ${LAYOUT.seeWithUrgency}`);
  // Switching back hands the held read from one hook to another, and the query library cancels it on the way and
  // asks again. The browser reports the cancelled read as a failed request; nothing else may fail.
  const cancelled = `requestfailed: ${APP_ORIGIN}/api/v1/screening/results?rule=additive_u`;
  expect(problems.filter((p) => p !== cancelled)).toEqual([]);
  problems.length = 0;
});

test("each column control that removes itself on use hands focus to the rule's own control", async ({
  page,
}) => {
  await openWorkspace(page);
  const other = page.getByRole("button", { name: "Other ways to order the list (5)" });

  // Closed, the rule area's own link opens What changed and hands focus to Change, as Hide then does.
  await page.locator("[data-region=rule-identity] [data-region=see-with-urgency]").press("Enter");
  await expect(ruleChange(page)).toBeFocused();
  await changed(page).getByRole("button", { name: LAYOUT.hideComparison }).press("Enter");
  await expect(changed(page)).toHaveCount(0);
  await expect(ruleChange(page)).toBeFocused();

  // Open, the statement's link keeps the main rule on screen, so focus goes to its button.
  await openRules(page);
  await statement(page).getByRole("button", { name: LAYOUT.seeWithUrgency }).press("Enter");
  await expect(mainRule(page, RULE.main)).toBeFocused();

  await changed(page).getByRole("button", { name: LAYOUT.hideComparison }).press("Enter");
  await expect(changed(page)).toHaveCount(0);
  await expect(mainRule(page, RULE.main)).toBeFocused();

  await mainRule(page, RULE.urgency).press("Enter");
  await changed(page).getByRole("button", { name: LAYOUT.hideComparison }).press("Enter");
  await expect(changed(page)).toHaveCount(0);
  await expect(mainRule(page, RULE.urgency)).toBeFocused();

  await ruleLine(page).getByRole("button", { name: LAYOUT.backToMainRule }).press("Enter");
  await expect(mainRule(page, RULE.main)).toBeFocused();

  await mainRule(page, RULE.urgency).press("Enter");
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
});

test("the arrow keys move between the tabs and show the one they reach, with one tab stop", async ({
  page,
}) => {
  await openWorkspace(page);
  const list = tab(page, /The list/);
  const queue = tab(page, /Missing information/);
  await expect(list).toHaveAttribute("tabindex", "0");
  await expect(queue).toHaveAttribute("tabindex", "-1");

  await list.focus();
  await page.keyboard.press("ArrowRight");
  await expect(queue).toBeFocused();
  await expect(queue).toHaveAttribute("aria-selected", "true");
  await expect(queue).toHaveAttribute("tabindex", "0");
  await expect(page.locator(`${INCOMPLETE} button`)).toHaveCount(queuedNames(MAIN_RULE).length);

  await page.keyboard.press("ArrowRight");
  await expect(list).toBeFocused();
  await expect(list).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(queue).toBeFocused();
  await page.keyboard.press("Home");
  await expect(list).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(queue).toBeFocused();
  await expect(queue).toHaveAttribute("aria-selected", "true");
});

test("data the copy cannot word shows the failed state with Retry, not a blank page", async ({
  page,
  problems,
}) => {
  // The comparison parses, but lacks the top-20 figure the copy reads, so binding the copy throws.
  let broken = true;
  await page.route(/\/api\/v1\/screening\/compare\?/, async (route) => {
    const response = await route.fetch();
    if (!broken) return route.fulfill({ response });
    const body = await response.json();
    body.metrics.top_k = body.metrics.top_k.filter((t: { k: number }) => t.k !== 20);
    await route.fulfill({ response, json: body });
  });
  await page.goto("/screening");

  const alert = page.locator("[role=alert][data-failure]");
  await expect(alert).toHaveText(`${LAYOUT.loadFailed}${LAYOUT.retry}`);
  await expect(page.getByRole("heading", { name: "RISE-PNG", level: 1 })).toBeVisible();
  // The guide layer can still start: the map draws with no marks.
  await waitForWorkspaceHook(page);
  expect(await page.evaluate(() => window.__screeningWorkspace!.ready.then(() => "ready"))).toBe("ready");
  // A developer finds what could not be read in the console.
  expect(problems.some((p) => p.startsWith("error: ") && p.includes("metrics.top_k"))).toBe(true);
  problems.length = 0;

  // Retry starts the workspace again, map included; it is pressed once this map has finished loading.
  await waitForMap(page);
  broken = false;
  await alert.getByRole("button", { name: LAYOUT.retry }).click();
  await expect(page.locator(`${ORDERED} button`)).toHaveCount(ORDERED_COUNT);
  await openRules(page);
  await expect(statement(page)).toHaveText(`${STATEMENT} ${LAYOUT.seeWithUrgency}`);
});
