/**
 * The phone's Back button. A school card, the export sheet and the Map view each cover the list, and on a phone Back
 * is how a reader closes what covers it. Failure modes and the test for each:
 *  1. Back with a card open leaves the tool for the page before it      -> "Back closes the card..."
 *  2. Back with the export sheet open leaves the tool                   -> "Back closes the export sheet..."
 *  3. Back in the Map view leaves the tool, or a card opened from the map closes the Map view with it
 *                                                                       -> "Back from a card opened on the map..."
 *  4. Closing a card with its own button leaves an entry behind, so the next Back seems to do nothing
 *                                                                       -> "a card closed with its own button..."
 *  5. Changes that open nothing (the next school, a rule, a tab) add entries, so Back has to be pressed for each
 *                                                                       -> "a card closed with its own button..."
 *  6. Back takes back what changed while the card was open, such as the rule
 *                                                                       -> "Back closes the card and keeps the rule..."
 *  7. The address of an open card changes form, so a shared link differs from before  -> "Back closes the card..."
 *  8. A card opened while the store's own Back is under way gets no entry, so Back then leaves the tool
 *                                                                       -> "a card opened before the store's own Back..."
 */
import type { Page } from "@playwright/test";

import { expect, keyOf, orderedRow, test, waitForMap } from "./screening-helpers";

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
test.describe.configure({ timeout: 60_000 });

const SCHOOL = "Sample School 08";
const KEY = keyOf("additive_no_u", SCHOOL);
const card = (page: Page) => page.locator("[data-slot=school-card]");
const sheet = (page: Page) => page.locator("[data-region=export-sheet]");
const pane = (page: Page, name: "List" | "Map") =>
  page.locator("[data-region=pane-switch]").getByRole("button", { name, exact: true });
const search = (page: Page) => new URL(page.url()).search;
const historyLength = (page: Page) => page.evaluate(() => window.history.length);

/**
 * The tool opened from another page, as a shared link is opened from a message or a search. The page is served by the
 * test itself, on the app's origin so the visitor's storage can be read there, and with an icon so none is fetched.
 */
async function openFromElsewhere(page: Page) {
  await page.route("**/the-page-before", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><title>The page before</title><link rel="icon" href="data:,">',
    })
  );
  await page.goto("/the-page-before");
  await page.goto("/screening");
  await waitForMap(page);
}

/** Back, then the screen once the app has followed it. */
async function back(page: Page) {
  await page.goBack();
  await expect(page).toHaveURL(/\/screening/);
}

test("Back closes the card instead of leaving the tool, and the card's address is the one it always was", async ({
  page,
}) => {
  await openFromElsewhere(page);
  await orderedRow(page, SCHOOL).tap();
  await expect(card(page)).toContainText(SCHOOL);
  expect(search(page)).toBe(`?school=${KEY}`);

  await back(page);
  await expect(card(page)).toHaveCount(0);
  await expect(orderedRow(page, SCHOOL)).toBeVisible();
  expect(search(page)).toBe("");

  // With nothing open, Back leaves as it always did.
  await page.goBack();
  await expect(page).toHaveURL(/\/the-page-before$/);
});

test("Back closes the export sheet instead of leaving the tool", async ({ page }) => {
  await openFromElsewhere(page);
  await page.locator("[data-region=actions-menu]:visible").click();
  await page.locator("#screening-menu").getByRole("button", { name: "Download or print the list" }).click();
  await expect(sheet(page)).toBeVisible();

  await back(page);
  await expect(sheet(page)).toHaveCount(0);
  expect(search(page)).toBe("");
});

test("Back from a card opened on the map returns to the map, and Back again to the list", async ({
  page,
}) => {
  await openFromElsewhere(page);
  await pane(page, "Map").tap();
  await expect(pane(page, "Map")).toHaveAttribute("aria-pressed", "true");
  await orderedRow(page, SCHOOL).tap();
  await expect(card(page)).toContainText(SCHOOL);

  await back(page);
  await expect(card(page)).toHaveCount(0);
  await expect(pane(page, "Map")).toHaveAttribute("aria-pressed", "true");

  await back(page);
  await expect(pane(page, "List")).toHaveAttribute("aria-pressed", "true");
  // The Map view never reached the address, before or after.
  expect(search(page)).toBe("");
});

test("a card closed with its own button leaves no entry behind, and stepping through schools adds none", async ({
  page,
}) => {
  await openFromElsewhere(page);
  const before = await historyLength(page);
  await orderedRow(page, SCHOOL).tap();
  await expect(card(page)).toContainText(SCHOOL);
  await card(page).getByRole("button", { name: "Next school" }).tap();
  await card(page).getByRole("button", { name: "Next school" }).tap();
  await expect(card(page)).not.toContainText(SCHOOL);
  // One entry for the card, however many schools it shows.
  expect(await historyLength(page)).toBe(before + 1);

  await page.getByTestId("close-card").tap();
  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => search(page)).toBe("");
  // The card's entry went with it, so the next Back leaves the tool at once.
  await page.goBack();
  await expect(page).toHaveURL(/\/the-page-before$/);
});

test("a card opened before the store's own Back has landed still gets an entry, so Back closes it", async ({
  page,
}) => {
  await openFromElsewhere(page);
  await orderedRow(page, SCHOOL).tap();
  await expect(card(page)).toContainText(SCHOOL);
  // Closing the card goes back past its entry. Opening one again in the same task lands inside that Back.
  await page.evaluate((key) => {
    const ws = window.__screeningWorkspace!;
    ws.setState({ school: null });
    ws.setState({ school: key });
  }, KEY);
  await expect(card(page)).toContainText(SCHOOL);
  await expect.poll(() => search(page)).toBe(`?school=${KEY}`);

  await back(page);
  await expect(card(page)).toHaveCount(0);
  expect(search(page)).toBe("");
});

test("Back closes the card and keeps the rule chosen while it was open", async ({ page }) => {
  await openFromElsewhere(page);
  await orderedRow(page, SCHOOL).tap();
  await expect(card(page)).toContainText(SCHOOL);
  const before = await historyLength(page);
  await page.evaluate(() => window.__screeningWorkspace!.setState({ rule: "additive_u" }));
  await expect.poll(() => search(page)).toContain("rule=additive_u");
  expect(await historyLength(page)).toBe(before);

  await back(page);
  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get("rule")).toBe("additive_u");
  expect(new URL(page.url()).searchParams.get("school")).toBeNull();
});
