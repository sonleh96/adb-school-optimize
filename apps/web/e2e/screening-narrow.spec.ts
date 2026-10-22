/**
 * The narrow layout leads with the list. Failure modes and the test for each:
 *  1. On a first visit, with Start here open, the first school's name or its Why line is below the fold on a phone or
 *     a tablet                                                         -> "on a first visit at <size>, the first school..."
 *  2. The list is not what shows first, the map hidden behind it can still be reached, or Map does not open the band
 *     and its key                                                      -> "List shows first, and Map opens the band..."
 *  3. A school chosen in one view is lost in the other                 -> "a school chosen in the list..." and "...on the map..."
 *  4. A guide step, from a link or from Start here, has no band to show in while the list alone shows, or the band
 *     stays after the guide                                            -> "a guide step takes the band..."
 *  5. Start here takes the screen: it is not folded to one line, Open the guides does not unfold the five, or Hide is
 *     not remembered after a reload, or Help, then Guides does not bring it back
 *                                                                      -> "Start here is a short card..."
 *  6. The numbered circles have no entry in the key, or the phone shows no line saying what the tool is for
 *                                                                      -> "the key names the numbered circles..."
 * The caveat's place in both views is in screening-layout.spec.ts ("the caveat shows once...").
 */
import type { Page } from "@playwright/test";

import {
  ORDERED,
  expect,
  helpItem,
  keyOf,
  mapLocator,
  orderedRow,
  settledMark,
  test,
  waitForMap,
} from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const SCHOOL = "Sample School 08";
const KEY = keyOf("additive_no_u", SCHOOL);
const OTHER = "Sample School 15";
const OTHER_KEY = keyOf("additive_no_u", OTHER);

const pane = (page: Page, name: "List" | "Map") =>
  page.locator("[data-region=pane-switch]").getByRole("button", { name, exact: true });
const card = (page: Page) => page.locator("[data-slot=school-card]");
const rail = (page: Page) => page.getByTestId("guide-rail");

for (const size of [
  { width: 390, height: 844, scale: 2 },
  { width: 360, height: 740, scale: 2 },
  { width: 768, height: 1024, scale: 1 },
  { width: 800, height: 500, scale: 2 },
]) {
  test.describe(`a first visit at ${size.width} by ${size.height}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.scale,
      firstVisit: true,
    });

    test(`on a first visit at ${size.width} by ${size.height}, the first school and its reason show with Start here open`, async ({
      page,
    }) => {
      await page.goto("/screening");
      await waitForMap(page);
      await expect(rail(page)).toBeVisible();
      await expect(rail(page)).toHaveAttribute("data-inflow", "true");
      const first = page.locator(`${ORDERED} button`).first();
      await expect(first).toContainText(SCHOOL);
      // The name and the Why line, not the row's padding, are inside the window.
      for (const part of [first.locator("> span").last(), first.locator("[data-region=row-why]")])
        await expect(part).toBeInViewport({ ratio: 1 });
    });
  });
}

test.describe("at 390 by 844", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test("List shows first, and Map opens the band with its key over the same list", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    await expect(pane(page, "List")).toHaveAttribute("aria-pressed", "true");
    await expect(mapLocator(page)).toBeHidden();
    await expect(page.locator("[data-slot=legend]")).toBeHidden();
    // Hidden, the map is out of the keyboard's way: Tab from the switch reaches the list, not a map control.
    await pane(page, "Map").focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".maplibregl-map"))).toBe(false);

    await pane(page, "Map").click();
    await expect(pane(page, "Map")).toHaveAttribute("aria-pressed", "true");
    await expect(mapLocator(page)).toBeVisible();
    await expect(page.locator("[data-slot=legend] [data-region=legend-number]")).toBeVisible();
    // The list is still there, under the band.
    await expect(page.locator(`${ORDERED} button`).first()).toBeAttached();
    const band = (await mapLocator(page).boundingBox())!;
    const list = (await page.locator("section[data-slot=column]").boundingBox())!;
    expect(list.y).toBeGreaterThanOrEqual(band.y + band.height - 1);

    await pane(page, "List").click();
    await expect(mapLocator(page)).toBeHidden();
    // The choice is the reader's for the visit; the address does not keep it.
    expect(new URL(page.url()).search).toBe("");
  });

  test("a school chosen in the list stays chosen on the map, and its card stays open", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    await orderedRow(page, SCHOOL).click();
    await expect(card(page)).toContainText(SCHOOL);
    await pane(page, "Map").click();
    await expect(mapLocator(page)).toBeVisible();
    await expect(mapLocator(page)).toHaveAttribute("data-selected-key", KEY);
    await expect(card(page)).toContainText(SCHOOL);
    expect(new URL(page.url()).searchParams.get("school")).toBe(KEY);
  });

  test("a school chosen on the map stays chosen in the list", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    await pane(page, "Map").click();
    await expect(mapLocator(page)).toBeVisible();
    const mark = await settledMark(page, OTHER_KEY);
    await page.mouse.click(mark.x, mark.y);
    await expect(card(page)).toContainText(OTHER);
    await pane(page, "List").click();
    await expect(mapLocator(page)).toBeHidden();
    await expect(card(page)).toContainText(OTHER);
    await expect(card(page)).toBeInViewport();
    expect(new URL(page.url()).searchParams.get("school")).toBe(OTHER_KEY);
  });

  test("a guide step takes the band while the list alone shows, and gives it back when the guide ends", async ({
    page,
  }) => {
    await page.goto("/screening?guide=q1&gstep=1");
    await waitForMap(page);
    await expect(rail(page)).toBeVisible();
    await expect(rail(page)).toHaveAttribute("data-step", "true");
    // The step has the band, under the top bar; the switch steps aside while it shows.
    await expect(page.locator("[data-region=pane-switch]")).toBeHidden();
    const step = (await rail(page).boundingBox())!;
    expect(step.y).toBeLessThanOrEqual(57);
    expect(step.height).toBeGreaterThan(100);
    await expect(page.locator(`${ORDERED} button`).first()).toBeAttached();

    // Back to the start list: the list leads again, with Start here at its head, and the map waits behind Map.
    await rail(page).getByRole("button", { name: "All guides" }).click();
    await expect(rail(page)).not.toHaveAttribute("data-step", "true");
    await expect(rail(page)).toHaveAttribute("data-inflow", "true");
    await expect(page.locator("[data-region=pane-switch]")).toBeVisible();
    await expect(pane(page, "List")).toHaveAttribute("aria-pressed", "true");
    await expect(mapLocator(page)).toBeHidden();
  });
});

test.describe("Start here on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, firstVisit: true });

  test("Start here is a short card: one line, the guides folded under Open the guides, and Hide, which a reload remembers", async ({
    page,
  }) => {
    await page.goto("/screening");
    await waitForMap(page);
    const start = rail(page);
    await expect(start).toBeVisible();
    const open = start.locator("[data-region=open-guides]");
    await expect(open).toHaveAttribute("aria-expanded", "false");
    await expect(start.locator("[data-guide]")).toHaveCount(0);
    // A short card: well under half the window.
    const box = (await start.boundingBox())!;
    expect(box.height).toBeLessThan(844 / 4);

    await open.click();
    await expect(open).toHaveAttribute("aria-expanded", "true");
    await expect(start.locator("[data-guide]")).toHaveCount(5);

    await rail(page).locator("[data-region=hide-guides]").click();
    await expect(rail(page)).toHaveCount(0);
    await page.reload();
    await waitForMap(page);
    await expect(page.locator(`${ORDERED} button`).first()).toBeVisible();
    await expect(rail(page)).toHaveCount(0);

    await (await helpItem(page, "Guides")).click();
    await expect(rail(page)).toBeVisible();
    await expect(rail(page).locator("[data-region=open-guides]")).toHaveAttribute("aria-expanded", "false");
  });

  test("the key names the numbered circles, and the list says what the tool is for", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    const head = page.locator("[data-region=list-head]");
    await expect(head).toBeInViewport({ ratio: 1 });
    await expect(head.locator("p").first()).toHaveText("Which secondary schools to look at first");
    await pane(page, "Map").click();
    const numbers = page.locator("[data-slot=legend] [data-region=legend-number]");
    await expect(numbers).toBeVisible();
    await expect(numbers).toHaveText(/^1\s*Numbered: the first ten in the list$/);
  });
});
