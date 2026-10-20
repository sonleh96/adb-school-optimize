/**
 * The workspace at the sizes notes/final.md specifies (R21, R22). Failure modes and the test for each:
 *  1. At some width the page scrolls sideways, two panels overlap, the map is starved, or the first school is below
 *     the fold                                                   -> "at <size>, with and without a card..."
 *  2. The list stays beside a card that leaves the map under 480 px, or steps aside when there is room, or cannot
 *     be brought back, or loses the keyboard user's focus        -> "the list steps aside..."
 *  3. A keyboard action animates                                 -> "keyboard actions never animate"
 *  4. The narrow layout hides the map, keeps the list beside the card, or opens no key -> "the narrow layout..."
 *  5. Escape closes the card before a popover over it            -> "Escape closes the innermost layer first"
 */
import type { Page } from "@playwright/test";

import { ORDERED, expect, keyOf, orderedRow, test, waitForMap } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const SCHOOL = keyOf("additive_u", "Sample School 08");

interface Box {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The visible panels' boxes. A panel that is hidden (the list aside, a narrow-only bar) is left out. */
async function panels(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const named: Array<[string, Element | null]> = [
      ["column", document.querySelector("section[class*=column]")],
      ["card", document.querySelector("[data-slot=school-card]")],
      ["actions", document.querySelector("div[class*=actions]")],
      ["key", document.querySelector("[data-slot=legend]")],
      ["hint", document.querySelector("#slot-hint")],
      ["topbar", document.querySelector("header[class*=topBar]")],
    ];
    return named.flatMap(([name, el]) => {
      if (!el) return [];
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return [];
      const r = el.getBoundingClientRect();
      return r.width && r.height
        ? [{ name, left: r.left, top: r.top, right: r.right, bottom: r.bottom }]
        : [];
    });
  });
}

const overlap = (a: Box, b: Box) =>
  a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

async function expectSound(page: Page, minMap: number | null) {
  // Measured once the panels have finished moving: mid-fade, a panel that is leaving still has a box.
  await page.waitForFunction(() => document.getAnimations().length === 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth)).toBe(true);
  const boxes = await panels(page);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      expect(overlap(boxes[i], boxes[j]), `${boxes[i].name} overlaps ${boxes[j].name}`).toBe(false);
    }
  }
  if (minMap !== null) {
    const width = await page.evaluate(() => window.innerWidth);
    const left = Math.max(0, ...boxes.filter((b) => b.name === "column").map((b) => b.right));
    const right = Math.min(width, ...boxes.filter((b) => b.name === "card").map((b) => b.left));
    // The clear map, as the spec measures it: between the panels, less a 16 px gap on each side.
    expect(right - left - 2 * 16).toBeGreaterThanOrEqual(minMap);
  }
}

/** The first row can be read without scrolling: its name and its Why line (not its padding) are in the window. */
async function firstRowInView(page: Page) {
  const row = page.locator(`${ORDERED} button`).first();
  await expect(row.locator("[data-region=row-why]")).toBeVisible();
  const box = (await row.locator("> span").last().boundingBox())!;
  const height = await page.evaluate(() => window.innerHeight);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
}

const SIZES = [
  { name: "1280 by 800", width: 1280, height: 800, scale: 1, minMap: 480 },
  { name: "1024 by 768", width: 1024, height: 768, scale: 1, minMap: 320 },
  { name: "768 by 1024", width: 768, height: 1024, scale: 1, minMap: null },
  { name: "1600 by 1000 at 200 percent", width: 800, height: 500, scale: 2, minMap: null },
];

for (const size of SIZES) {
  test.describe(`at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.scale });

    test(`at ${size.name}, with and without a card, nothing overlaps or scrolls sideways`, async ({
      page,
    }) => {
      await page.goto("/screening");
      await waitForMap(page);
      await expectSound(page, size.minMap);
      await firstRowInView(page);

      await page.goto(`/screening?school=${SCHOOL}`);
      await waitForMap(page);
      await expect(page.locator("[data-slot=school-card] [data-region=inspector-why]")).toBeVisible();
      await expectSound(page, size.minMap);
    });
  });
}

test.describe("the list steps aside", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the list steps aside when a card would leave the map under 480 px, and The list brings it back", async ({
    page,
  }) => {
    await page.goto("/screening");
    await waitForMap(page);
    const root = page.getByTestId("screening-workspace");
    const column = page.locator("section[class*=column]");
    await orderedRow(page, "Sample School 13").click();
    await expect(root).toHaveAttribute("data-card-docked", "true");
    await expect(column).toBeHidden();
    const back = page.locator("[data-slot=school-card]").getByRole("button", { name: "The list" });
    await back.click();
    await expect(root).not.toHaveAttribute("data-card-docked", /.*/);
    await expect(column).toBeVisible();
    await expect(orderedRow(page, "Sample School 13")).toBeFocused();
  });
});

test.describe("at 1600 the card opens beside the list", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("keyboard actions never animate, and Escape closes the innermost layer first", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    const root = page.getByTestId("screening-workspace");
    await orderedRow(page, "Sample School 08").click();
    await expect(root).not.toHaveAttribute("data-card-docked", /.*/);
    await expect(root).not.toHaveAttribute("data-instant", /.*/);
    await page.keyboard.press("ArrowDown");
    await expect(root).toHaveAttribute("data-instant", "true");

    // The popover over the column closes first; the card stays.
    await page.getByRole("button", { name: "Other rules (5)" }).click();
    await expect(page.locator("#screening-other-rules")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#screening-other-rules")).toHaveCount(0);
    await expect(page.locator("[data-slot=school-card]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-slot=school-card]")).toHaveCount(0);
  });
});

test.describe("the narrow layout", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("the narrow layout keeps the map band, puts the card in the list's place, and opens the key on demand", async ({
    page,
  }) => {
    await page.goto("/screening");
    await waitForMap(page);
    const map = (await page.getByTestId("screening-map").boundingBox())!;
    expect(map.y).toBe(56);
    expect(map.height).toBe(410);
    await expect(page.getByRole("heading", { level: 1, name: "RISE-PNG" })).toBeVisible();

    const key = page.locator("[data-slot=legend]");
    await expect(key.locator("[data-region=legend-point]")).toHaveCount(0);
    await key.getByRole("button", { name: "Show the map key" }).click();
    await expect(key.locator("[data-region=legend-point]")).toBeVisible();
    await key.getByRole("button", { name: "Hide the map key" }).click();

    await orderedRow(page, "Sample School 08").click();
    // Measured once the card has finished coming in.
    await expect
      .poll(async () => await page.locator("[data-slot=school-card]").boundingBox())
      .toMatchObject({ y: 56 + 410, width: 768 });
    await expect(page.locator("section[class*=column]")).toBeHidden();
    await page.locator("[data-slot=school-card]").getByRole("button", { name: "The list" }).click();
    await expect(page.locator("section[class*=column]")).toBeVisible();
  });
});
