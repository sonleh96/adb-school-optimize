/**
 * The school card, the key, the tooltip, Copy link and the full-panel states, on the default and the worst-case
 * fixture datasets. Failure modes and the test for each:
 *  1. The card states a second place, or reasons out of order, or the need parts outside the need box
 *                                                                       -> "a complete school's card..."
 *  2. A range school reads as one place, or a missing reading reads as 0 or splits its label (R9, R10)
 *                                                                       -> "a range school's card..."
 *  3. An incomplete record's card has no reasons, or prints "null"      -> "an incomplete record's card..."
 *  4. The paper's persistence flag shows under another rule, or for a school without it, or a flag only just over
 *     the line does not say so                                          -> "the persistence flag..."
 *  5. The card's arrows leave the list's order, or its count is not the list's -> "the card steps..."
 *  6. A record that fails to load leaves the card blank or broken      -> "a card whose record..."
 *  7. Copy link copies another address, or fails silently             -> "Copy link..."
 *  8. The key's bands are hard-coded, or a one-school list breaks it (R12) -> "the key..."
 *  9. A long unbroken name spills out of the tooltip or the card (R1, R5) -> "an unbroken name..."
 * 10. Twins read the same, names in sentences are not set apart, ties are unmarked or noted twice (R15, R16, R18)
 *                                                                       -> "twins...", "ties..."
 * 11. No data, or a failed load, shows an error, or leaves actions working (R14) -> "no schools...", "a failed load..."
 */
import type { Page } from "@playwright/test";

import {
  INCOMPLETE,
  ORDERED,
  RULE,
  expect,
  keyOf,
  mainRule,
  openWorkspace,
  orderedRow,
  queuedRow,
  settledMark,
  tab,
  test,
  useMockDataset,
  waitForMap,
} from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

const card = (page: Page) => page.locator("[data-slot=school-card]");
const place = (page: Page) => page.getByTestId("card-place");
const LOAD_FAILED = "Some of the information did not load, so there is nothing to show until you try again.";
const PERSISTENT =
  "Often in the top 20 when the paper changed the factors' shares at random. That test used the paper's main rule, with urgency, and has not been redone for the proposed revision.";
const NEAR_LINE =
  "In that test it stayed in the top 20 only just often enough to be flagged, within 0.6 percentage points of the line, so another round of random changes to the shares could take the flag away.";

test("a complete school's card states one place, its reasons with the school need parts first, and its numbers", async ({
  page,
}) => {
  await openWorkspace(page);
  await orderedRow(page, "Sample School 08").click();

  await expect(place(page)).toHaveText("1st");
  await expect(card(page).locator("[data-region=inspector-place] b")).toHaveText(
    "Place in the list under the combined-factors rule with urgency (S)"
  );
  await expect(page.getByTestId("card-context")).toHaveText(
    "Among the 16 schools with every input recorded."
  );
  // One place only: no other ordinal anywhere in the card.
  const text = await card(page).innerText();
  expect(text.replace(/1st\n/, "").match(/\b\d+(st|nd|rd|th)\b/g)).toBeNull();

  const why = card(page).locator("[data-region=inspector-why]");
  await expect(why.locator("p").first()).toHaveText(
    "Three things add most to its screening score under the combined-factors rule with urgency (S). All three are parts of its school need, the measure built from five parts of its own record."
  );
  // The named parts come first, numbered in reading order; the other parts follow, quieter and unnumbered.
  const parts = why.locator("[data-region=need-box] li");
  await expect(parts).toHaveCount(5);
  await expect(parts.nth(0)).toContainText("1Classrooms not of permanent materials");
  await expect(parts.nth(1)).toContainText("2Remoteness");
  await expect(parts.nth(2)).toContainText("3Teacher housing shortfall");
  await expect(parts.nth(3)).toHaveText("Missing facility types0.667");
  await expect(parts.nth(4)).toHaveText("Power and water0.600");
  await expect(why.locator("[data-region=inspector-record]")).toHaveText("All of its inputs are recorded.");

  const numbers = card(page).locator("[data-region=inspector-breakdown]");
  await expect(numbers).toContainText("Screening score0.683");
  await expect(numbers.locator("[data-region=score-note]")).toHaveText(
    "Each input runs from 0 to 1; higher means more reason to look."
  );
});

test("a range school's card shows its range, names the missing reading, and labels it on one line", async ({
  page,
}) => {
  await openWorkspace(page);
  await orderedRow(page, "Sample School 17").click();
  await expect(place(page)).toHaveText("11thto18th");
  await expect(page.getByTestId("card-context")).toContainText(
    "Its air-quality reading, an air-pollution index for its location, is missing"
  );
  await expect(page.getByTestId("card-context")).toContainText("It is in the top 20 either way.");

  const air = card(page).locator("[data-missing]", { hasText: "Air quality" });
  await expect(air).toContainText("No reading");
  await expect(air).toContainText("so it is not counted as 0");
  // The label is one line, under the hatched bar, never split in two.
  const label = air.getByText("No reading", { exact: true });
  const box = (await label.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(18);
  await expect(card(page).locator("[data-region=inspector-record]")).toHaveCount(0);
});

test("an incomplete record's card says what is missing and what the record says, part by part", async ({
  page,
}) => {
  await openWorkspace(page, "?view=queue");
  await queuedRow(page, "Sample School 21").click();
  await expect(place(page)).toHaveText("Cannot be put in order yet");
  const missing = card(page).locator("[data-region=inspector-why]");
  await expect(missing.locator("[data-region=queue-missing]")).toHaveText("Teacher count blank");
  await expect(missing.locator("p")).toHaveText("The number of teachers is blank in the record.");
  const record = card(page).locator("[data-region=inspector-record] li");
  await expect(record).toHaveCount(6);
  await expect(record.nth(0)).toHaveText(
    "School needCannot be worked outSchool need cannot be worked out, because the number of teachers is blank in the record."
  );
  await expect(card(page)).not.toContainText("null");
});

test("the persistence flag shows under the circulated rule only, and only for the schools that have it", async ({
  page,
}) => {
  await openWorkspace(page);
  await orderedRow(page, "Sample School 01").click();
  const flag = card(page).locator("[data-region=persistent-flag]");
  await expect(flag).toHaveText(PERSISTENT);

  // A school flagged only just over the line says that another run could take the flag away, and by how much.
  await orderedRow(page, "Sample School 02").click();
  await expect(flag).toHaveText(`${PERSISTENT} ${NEAR_LINE}`);
  await orderedRow(page, "Sample School 01").click();
  await expect(flag).toHaveText(PERSISTENT);

  await mainRule(page, RULE.proposed).click();
  await expect(card(page).locator("[data-region=inspector-place] b")).toContainText("without urgency (S0)");
  await expect(card(page).locator("[data-region=inspector-why]")).toBeVisible();
  await expect(flag).toHaveCount(0);

  await mainRule(page, RULE.main).click();
  await expect(flag).toHaveText(PERSISTENT);
  await orderedRow(page, "Sample School 08").click();
  await expect(card(page).locator("[data-region=inspector-why]")).toBeVisible();
  await expect(flag).toHaveCount(0);
});

test("the card steps through the list on screen and counts it", async ({ page }) => {
  await openWorkspace(page);
  await orderedRow(page, "Sample School 08").click();
  await expect(card(page)).toContainText("1 of 21");
  await expect(card(page).getByRole("button", { name: "Previous school" })).toBeDisabled();
  await card(page).getByRole("button", { name: "Next school" }).click();
  await expect(orderedRow(page, "Sample School 15")).toHaveAttribute("aria-pressed", "true");
  await expect(card(page)).toContainText("2 of 21");

  await tab(page, /Incomplete records/).click();
  await queuedRow(page, "Sample School 24").click();
  await expect(card(page)).toContainText("4 of 4");
  await expect(card(page).getByRole("button", { name: "Next school" })).toBeDisabled();
});

test("a card whose record does not load keeps the school's place and offers Retry", async ({
  page,
  context,
  problems,
}) => {
  await useMockDataset(context, "default", { schools: 503 });
  await openWorkspace(page);
  await orderedRow(page, "Sample School 15").click();
  await expect(place(page)).toHaveText("2nd");
  const failed = card(page).getByRole("alert");
  await expect(failed).toContainText(LOAD_FAILED);
  await expect(failed.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(problems.every((p) => /503|status of 503/.test(p))).toBe(true);
  problems.length = 0;
});

test("Copy link copies the address of this screen and says so", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWorkspace(page, "?rule=additive_no_u&school=4e65114f0b8790b6b906088a6d549020");
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Link to this screen copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test("the key names the rule, cuts its place bands from the data and says what each mark means", async ({
  page,
  context,
}) => {
  await openWorkspace(page);
  const key = page.locator("[data-slot=legend]");
  const bands = key.locator("ol li span");
  await expect(bands).toHaveText(["1st to 10th", "11th to 16th"]);
  await expect(key.locator("[data-region=legend-range]")).toHaveText(
    "Ring with a centre dotA school with a range of possible places in the list, because its air-quality reading is missing."
  );

  // One school: one band, "1st", and one dot.
  await useMockDataset(context, "one");
  await page.goto("/screening");
  await waitForMap(page);
  await expect(bands).toHaveText(["1st"]);
  await expect(page.locator("[data-rank-label]")).toHaveCount(1);
});

test("an unbroken name stays inside the tooltip and the card", async ({ page, context }) => {
  await useMockDataset(context, "worst-names");
  await page.goto("/screening");
  await waitForMap(page);
  const token = "UnbrokenUnbrokenUnbrokenUnbrokenUnbrokenUnbrokenUnbrokenUnb";
  const row = page.locator(`${ORDERED} button`, { hasText: token });
  const key = (await row.getAttribute("data-school-key"))!;

  const point = await settledMark(page, key);
  await page.mouse.move(point.x, point.y);
  const tooltip = page.getByRole("status").filter({ hasText: token });
  const tip = await tooltip.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    over: el.scrollWidth - el.clientWidth,
  }));
  expect(tip.width).toBeLessThanOrEqual(280);
  expect(tip.over).toBeLessThanOrEqual(0);

  await row.click();
  const title = card(page).getByRole("heading", { level: 2 });
  await expect(title).toHaveText(token);
  expect(await title.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
});

test("twins are told apart in the list, and a name that looks blank is said in words", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "worst-names");
  await page.goto("/screening");
  await waitForMap(page);
  const names = await page.locator(`${ORDERED} button span[class*=name]`).allTextContents();
  expect(names.filter((name) => name.startsWith("Spaced Name School"))).toEqual([
    "Spaced Name School (North Two)",
    "Spaced Name School (North One)",
  ]);
  expect(names).toContain("Unnamed school");
  // A blank district leaves no separator behind; the province never splits from its dot (R6).
  await expect(page.locator(`${ORDERED} button`, { hasText: "Worst Case Blank District" })).toContainText(
    "Worst Case Blank District · South Province"
  );
});

test("tied rows say who they are level with, with names set apart, and the tie rule is said once", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "ties-and-ranges");
  await page.goto("/screening");
  await waitForMap(page);
  // Every tied row names the others; Tie Alpha is the second row.
  const tie = page.locator(`${ORDERED} button`).nth(1).locator("span[class*=tie]");
  await expect(tie).toHaveText("Level with Ranked 08, Tie Bravo and Tie Charlie");
  await expect(tie.locator("[data-name-kind=school]")).toHaveText(["Ranked 08", "Tie Bravo", "Tie Charlie"]);
  await expect(page.locator("[data-region=tie-rule]")).toHaveCount(1);
  await expect(page.locator("[data-region=tie-rule]")).toHaveText(
    "When two schools are exactly level, the one whose name comes first alphabetically goes first."
  );
});

test("no schools at all shows one sentence and Retry, with every action off", async ({
  page,
  context,
  problems,
}) => {
  await useMockDataset(context, "empty");
  await page.goto("/screening");
  const state = page.locator("[data-empty]");
  await expect(state).toContainText("No schools came back, so there is nothing to show until you try again.");
  await expect(state.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.locator("[role=alert][data-failure]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy link" })).toBeDisabled();
  await expect(tab(page, /The list/)).toBeDisabled();
  await expect(mainRule(page, RULE.main)).toBeDisabled();
  await expect(page.locator(INCOMPLETE)).toHaveCount(0);
  // The API's own 404s for an empty store are expected.
  expect(problems.every((p) => p.includes("404"))).toBe(true);
  problems.length = 0;
});

test("a failed load shows one sentence and Retry, with every action off", async ({
  page,
  context,
  problems,
}) => {
  await useMockDataset(context, "default", { results: 503 });
  await page.goto("/screening");
  const failure = page.locator("[role=alert][data-failure]");
  await expect(failure).toContainText(LOAD_FAILED);
  await expect(page.getByRole("button", { name: "Copy link" })).toBeDisabled();
  await expect(tab(page, /Incomplete records/)).toBeDisabled();
  expect(problems.length).toBeGreaterThan(0);
  problems.length = 0;
});

test("a mark's tooltip uses the list's name and the copy's place sentence", async ({ page }) => {
  await openWorkspace(page);
  const point = await settledMark(page, keyOf("additive_u", "Sample School 15"));
  await page.mouse.move(point.x, point.y);
  const tooltip = page.getByRole("status").filter({ hasText: "Sample School 15" });
  await expect(tooltip).toContainText("East One, East Province");
  await expect(tooltip).toContainText("2nd of the 16 schools with every input recorded");
  await expect(tooltip).toContainText("Select to see why");
  // Hovering a mark marks its row too.
  await expect(orderedRow(page, "Sample School 15")).toHaveAttribute("data-hover", "true");
});
