/**
 * Find schools by province, district or name on the plain screen. Failure modes and the test for each:
 *  1. A province renumbers the schools it keeps, or keeps a school of another province  -> "a province narrows..."
 *  2. The district list shows other provinces' districts, or keeps a district the new province does not hold
 *                                                                                       -> "the district list follows..."
 *  3. A district chosen before its province finds nothing, or leaves the province unset  -> "a district chosen first..."
 *  4. The name search misses a school for its case                                      -> "part of a name finds..."
 *  5. No school matches and the list is just empty, with no word and no way back         -> "when nothing matches..."
 *  6. The filter is lost on reload or from a copied link, or the screen does not say one is on
 *                                                                                       -> "a link that carries..."
 *  7. The records to verify ignore the filter                                           -> "the records to verify..."
 *  8. Escape in the panel closes the school card instead of the panel, or drops the keyboard user
 *                                                                                       -> "Escape closes the panel..."
 *  9. A chosen province leaves its schools a small cluster on a map of the whole country, or Clear leaves the map
 *     zoomed on a province no longer chosen                                             -> "a province frames the map..."
 */
import type { Page } from "@playwright/test";

import { MAIN_RULE, ORDERED, expect, markAt, openWorkspace, rowsOf, tab, test } from "./screening-helpers";

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 60_000 });

const FIND = "Find schools by province, district or name";
const findButton = (page: Page) => page.getByRole("button", { name: FIND }).filter({ visible: true });
const panel = (page: Page) => page.locator("[data-region=find-panel]");
const status = (page: Page) =>
  page.locator("[data-region=find-status] [role=status]").filter({ visible: true });
const province = (page: Page) => panel(page).getByLabel("Province");
const district = (page: Page) => panel(page).getByLabel("District");
const schoolName = (page: Page) => panel(page).getByLabel("School name");
const shownRows = (page: Page) => page.locator(`${ORDERED} button[data-school-key]`);
const search = (page: Page) => new URL(page.url()).search;

const listed = rowsOf(MAIN_RULE).filter((r) => r.cohort !== "verification_queue");
const inProvince = (name: string) =>
  listed.filter((r) => (r.school as unknown as { province: string }).province === name);

test("a province narrows the list and the map to its schools, and every school keeps its rank", async ({
  page,
}) => {
  await openWorkspace(page);
  await findButton(page).click();
  await expect(province(page)).toBeFocused();
  await province(page).selectOption("South Province");

  const south = inProvince("South Province");
  await expect(shownRows(page)).toHaveCount(south.length);
  await expect(status(page)).toHaveText(
    `${south.length} of the ${listed.length} schools in the list are in South Province.`
  );
  expect(search(page)).toBe("?prov=South+Province");
  // Ranks are the whole list's: the second South Province school keeps its own rank, not 2nd.
  const second = south[1];
  expect(second.cohort).toBe("complete");
  expect(second.point_rank!.rank).toBeGreaterThan(2);
  await expect(shownRows(page).nth(0).locator("[data-place]")).toHaveText(
    new RegExp(`^${south[0].point_rank!.rank}(st|nd|rd|th)$`)
  );
  await expect(shownRows(page).nth(1)).toHaveAttribute("data-school-key", second.school.school_key);
  await expect(shownRows(page).nth(1).locator("[data-place]")).toHaveText(
    new RegExp(`^${second.point_rank!.rank}(st|nd|rd|th)$`)
  );
  for (const name of await shownRows(page).locator("span[class*=where]").allTextContents())
    expect(name).toBe(" · South Province");
});

test("the district list follows the province, and a new province starts with all its districts", async ({
  page,
}) => {
  await openWorkspace(page);
  await findButton(page).click();
  await province(page).selectOption("North Province");
  await expect(district(page).locator("option")).toHaveText(["All districts", "North One", "North Two"]);
  await district(page).selectOption("North Two");
  expect(search(page)).toBe("?prov=North+Province&dist=North+Two");
  await expect(status(page)).toHaveText(/ are in North Two, North Province\.$/);

  await province(page).selectOption("South Province");
  await expect(district(page)).toHaveValue("");
  await expect(district(page).locator("option")).toHaveText(["All districts", "South One", "South Two"]);
  expect(search(page)).toBe("?prov=South+Province");
});

test("a district chosen first chooses its province too", async ({ page }) => {
  await openWorkspace(page);
  await findButton(page).click();
  await expect(district(page).locator("optgroup")).toHaveCount(3);
  await district(page).selectOption({ label: "South One" });
  await expect(province(page)).toHaveValue("South Province");
  await expect(district(page)).toHaveValue("South One");
  expect(search(page)).toBe("?prov=South+Province&dist=South+One");
});

test("part of a name finds the school, whatever its case", async ({ page }) => {
  await openWorkspace(page);
  await findButton(page).click();
  await schoolName(page).fill("SCHOOL 08");
  await expect(shownRows(page)).toHaveCount(1);
  await expect(shownRows(page).first()).toContainText("Sample School 08");
  await expect(status(page)).toHaveText(
    `1 of the ${listed.length} schools in the list has "SCHOOL 08" in its name.`
  );
});

test("when nothing matches, the screen says so in words, and Clear shows every school again", async ({
  page,
}) => {
  await openWorkspace(page);
  await findButton(page).click();
  await province(page).selectOption("East Province");
  await schoolName(page).fill("Sample School 08");
  await expect(shownRows(page)).toHaveCount(0);
  await expect(status(page)).toHaveText(
    'No school in the list is in East Province and has "Sample School 08" in its name.'
  );
  await expect(page.getByText("Check the spelling, or choose another province or district.")).toBeVisible();

  await page.locator("[data-region=find-status]").getByRole("button", { name: "Clear" }).click();
  await expect(shownRows(page)).toHaveCount(listed.length);
  await expect(status(page)).toHaveCount(0);
  expect(search(page)).toBe("");
  await expect(findButton(page)).toBeFocused();
});

test("a link that carries the filter opens on it, says it is on, and survives a reload", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWorkspace(page, "?prov=South+Province&dist=South+One");
  const southOne = inProvince("South Province").filter(
    (r) => (r.school as unknown as { district: string }).district === "South One"
  );
  await expect(shownRows(page)).toHaveCount(southOne.length);
  await expect(status(page)).toHaveText(
    `${southOne.length} of the ${listed.length} schools in the list are in South One, South Province.`
  );
  // The button marks that a filter is on while its panel is closed.
  await expect(findButton(page)).toHaveAttribute("data-active", "true");

  await page.getByRole("button", { name: "Copy link" }).filter({ visible: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copied).search).toBe("?prov=South+Province&dist=South+One");

  await page.reload();
  await expect(shownRows(page)).toHaveCount(southOne.length);
});

test("the records to verify follow the same filter", async ({ page }) => {
  const queued = rowsOf(MAIN_RULE).filter((r) => r.cohort === "verification_queue");
  const north = queued.filter(
    (r) => (r.school as unknown as { province: string }).province === "North Province"
  );
  await openWorkspace(page, "?prov=North+Province");
  await tab(page, /Not in the list yet/).click();
  await expect(page.locator("[data-region=queue-list] button[data-school-key]")).toHaveCount(north.length);
  await expect(status(page)).toHaveText(
    `${north.length} of the ${queued.length} records to verify are in North Province.`
  );
});

test("Escape closes the panel and hands focus back to its button", async ({ page }) => {
  await openWorkspace(page);
  await findButton(page).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(findButton(page)).toBeFocused();
  await expect(findButton(page)).toHaveAttribute("aria-expanded", "false");
});

test("a province frames the map on its schools, and Clear frames the country again", async ({ page }) => {
  const south = inProvince("South Province")
    .filter((r) => r.school.latitude !== null)
    .map((r) => r.school.school_key);
  expect(south.length).toBeGreaterThan(1);
  /** How far apart the province's marks sit on screen, in px: larger when the map is closer. */
  const spread = async () => {
    const points = await Promise.all(south.map((key) => markAt(page, key)));
    if (points.some((p) => p === null)) return 0;
    const xs = points.map((p) => p!.x);
    const ys = points.map((p) => p!.y);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  };
  await openWorkspace(page);
  const country = await spread();
  expect(country).toBeGreaterThan(0);
  await findButton(page).click();
  await province(page).selectOption("South Province");
  await expect.poll(spread, { timeout: 10_000 }).toBeGreaterThan(country * 1.5);
  await page.locator("[data-region=find-status]").getByRole("button", { name: "Clear" }).click();
  await expect.poll(spread, { timeout: 10_000 }).toBeLessThan(country * 1.2);
});
