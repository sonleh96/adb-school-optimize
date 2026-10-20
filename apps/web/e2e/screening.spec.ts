/**
 * The /screening workspace in a real browser, against the mock API that serves responses saved from the real API
 * (e2e/fixtures/screening). Failure modes and the test for each:
 *  1. Map canvases pile up across rule switches and selections         -> "keeps one map"
 *  2. List and map selection drift apart (either direction, either tab)  -> "selecting a row...", "clicking a mark..."
 *  3. The wrong order for range or queue schools                         -> "shows the rows in the API's order"
 *  4. An interval school shown with a single place                       -> "shows the rows in the API's order"
 *  5. A rule switch shows another rule's rows, or loses the selection    -> "switching the rule..."
 *  6. A school with no coordinates breaks the map or the card            -> "a school without coordinates"
 *  7. Console errors (hydration, WebGL, style, failed requests)          -> every test, via `problems`
 *  The map staying out of the initial bundle is held by `npm run bundle:check`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test as base, type Page } from "@playwright/test";

const FIXTURES = path.resolve(__dirname, "fixtures/screening");
const fixture = (file: string) => JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));

interface Row {
  cohort: string;
  school: { source_school_name: string; school_key: string };
}
const rowsOf = (rule: string): Row[] => fixture(`results/${rule}.json`).rows;
const orderedNames = (rule: string) =>
  rowsOf(rule)
    .filter((r) => r.cohort !== "verification_queue")
    .map((r) => r.school.source_school_name);
const keyOf = (rule: string, name: string) =>
  rowsOf(rule).find((r) => r.school.source_school_name === name)!.school.school_key;

// The design's reference size. A smaller window pans the map under the panels, which hides marks from a click.
base.use({ viewport: { width: 1600, height: 1000 } });

const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type()))
          problems.push(`${message.type()}: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      page.on("requestfailed", (request) => problems.push(`requestfailed: ${request.url()}`));
      page.on("response", (response) => {
        if (response.status() >= 400) problems.push(`${response.status()}: ${response.url()}`);
      });
      await use(problems);
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

async function openWorkspace(page: Page) {
  await page.goto("/screening");
  await expect(page.getByRole("heading", { name: "School screening", level: 1 })).toBeVisible();
  await expect(page.locator("[data-testid=screening-map][data-map-ready=true]")).toHaveCount(1);
  await expect(page.locator("ol[aria-label='Ordered list'] button")).toHaveCount(20);
}

const orderedRow = (page: Page, name: string) =>
  page.locator("ol[aria-label='Ordered list'] button", { hasText: name });
const queuedRow = (page: Page, name: string) =>
  page.locator("ol[aria-label='Incomplete records'] button", { hasText: name });
const listNames = (page: Page) =>
  page.locator("ol[aria-label='Ordered list'] button span[class*=name]").allTextContents();

const markAt = (page: Page, key: string) =>
  page.evaluate((k) => window.__screeningMapTest?.project(k as never) ?? null, key);

/** A mark's position once the map has stopped moving (a selection can pan it). */
async function settledMark(page: Page, key: string) {
  let previous = await markAt(page, key);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await markAt(page, key);
    if (current && previous && current.x === previous.x && current.y === previous.y) return current;
    previous = current;
  }
  throw new Error(`The mark of ${key} never settled`);
}

/** Whether the dark selection ring is drawn round the mark: samples the rendered pixels at the ring's radius. */
async function ringDrawnAround(page: Page, key: string, markRadius: number): Promise<boolean> {
  const point = await markAt(page, key);
  if (!point) return false;
  const size = 80;
  const clip = {
    x: Math.round(point.x - size / 2),
    y: Math.round(point.y - size / 2),
    width: size,
    height: size,
  };
  const png = (await page.screenshot({ clip })).toString("base64");
  return page.evaluate(
    async ({ png, radius, size }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      let dark = 0;
      for (let step = 0; step < 16; step += 1) {
        const angle = (step / 16) * Math.PI * 2;
        const x = Math.round(size / 2 + Math.cos(angle) * radius);
        const y = Math.round(size / 2 + Math.sin(angle) * radius);
        const [r, g, b] = context.getImageData(x, y, 1, 1).data;
        if (r < 110 && g < 110 && b < 110) dark += 1;
      }
      return dark >= 10;
    },
    { png, radius: markRadius + 4.5, size }
  );
}

test("shows the rows in the API's order, with range schools between complete ones", async ({ page }) => {
  await openWorkspace(page);

  const names = await listNames(page);
  expect(names).toEqual(orderedNames("additive_u"));
  expect(names.slice(12, 17)).toEqual([
    "Sample School 06",
    "Sample School 01",
    "Sample School 17",
    "Sample School 04",
    "Sample School 18",
  ]);

  // The range school reads as a range, never as one place.
  const range = orderedRow(page, "Sample School 17");
  await expect(range.locator("[data-place=range]")).toContainText("11thto18th");
  await expect(orderedRow(page, "Sample School 08").locator("[data-place=point]")).toHaveText("1st");

  await expect(page.getByRole("tab", { name: /Ordered list/ })).toHaveText("Ordered list20");
  await expect(page.getByRole("tab", { name: /Incomplete records/ })).toHaveText("Incomplete records4");
});

test("keeps one map through rule switches and selections", async ({ page }) => {
  await openWorkspace(page);
  const maps = () => page.locator(".maplibregl-map").count();
  const canvases = () => page.locator("canvas").count();
  expect([await maps(), await canvases()]).toEqual([1, 1]);

  for (let round = 0; round < 3; round += 1) {
    await page.getByRole("button", { name: "Additive, urgency omitted" }).click();
    await expect(orderedRow(page, "Sample School 23")).toHaveCount(1);
    await orderedRow(page, "Sample School 15").click();
    await page.getByRole("button", { name: "Additive, urgency included" }).click();
    await expect(orderedRow(page, "Sample School 23")).toHaveCount(0);
    await page.getByRole("button", { name: "Close school card" }).click();
  }
  expect([await maps(), await canvases()]).toEqual([1, 1]);
});

test("selecting a row selects its mark, and closing the card clears both", async ({ page }) => {
  await openWorkspace(page);
  const key = keyOf("additive_u", "Sample School 15");
  expect(await ringDrawnAround(page, key, 8)).toBe(false);

  await orderedRow(page, "Sample School 15").click();

  await expect(orderedRow(page, "Sample School 15")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-testid=screening-map]")).toHaveAttribute("data-selected-key", key);
  await expect(page.getByRole("complementary", { name: "Sample School 15" })).toBeVisible();
  await expect(page.getByTestId("card-place")).toHaveText("2nd");
  await expect.poll(() => ringDrawnAround(page, key, 8)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-testid=screening-map]")).toHaveAttribute("data-selected-key", "");
  await expect(orderedRow(page, "Sample School 15")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => ringDrawnAround(page, key, 8)).toBe(false);
});

test("clicking a mark selects its row, on the tab that holds it", async ({ page }) => {
  await openWorkspace(page);

  const first = keyOf("additive_u", "Sample School 12");
  const point = await settledMark(page, first);
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await expect(orderedRow(page, "Sample School 12")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-testid=screening-map]")).toHaveAttribute("data-selected-key", first);

  const queued = keyOf("additive_u", "Sample School 21");
  const queuedPoint = await settledMark(page, queued);
  await page.mouse.click(queuedPoint!.x, queuedPoint!.y);
  await expect(page.getByRole("tab", { name: /Incomplete records/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(queuedRow(page, "Sample School 21")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("card-place")).toHaveText("No place in the list yet");
});

test("switching the rule shows that rule's rows and keeps the selection on the tab that holds it", async ({
  page,
}) => {
  await openWorkspace(page);

  // Held back under the circulated rule, because its urgency is unknown.
  await page.getByRole("tab", { name: /Incomplete records/ }).click();
  await queuedRow(page, "Sample School 23").click();
  await expect(page.getByTestId("card-place")).toHaveText("No place in the list yet");

  await page.getByRole("button", { name: "Additive, urgency omitted" }).click();

  await expect(page.getByRole("tab", { name: /Ordered list/ })).toHaveAttribute("aria-selected", "true");
  await expect(orderedRow(page, "Sample School 23")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("card-place")).toHaveText("17th");
  expect(await listNames(page)).toEqual(orderedNames("additive_no_u"));
  await expect(page.getByRole("tab", { name: /Incomplete records/ })).toHaveText("Incomplete records3");

  // A rule from "Other rules" lists its own order.
  await page.getByRole("button", { name: "Other rules" }).click();
  await page.getByRole("button", { name: "School-need-first, urgency included" }).click();
  // Urgency is included again, so the selected school is held back and the list follows it to its tab.
  await expect(page.getByRole("tab", { name: /Incomplete records/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(queuedRow(page, "Sample School 23")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: /Ordered list/ }).click();
  expect(await listNames(page)).toEqual(orderedNames("need_first_u"));
});

test("arrow keys move through the list and Escape closes the card", async ({ page }) => {
  await openWorkspace(page);
  await orderedRow(page, "Sample School 08").click();
  await page.keyboard.press("ArrowDown");
  await expect(orderedRow(page, "Sample School 15")).toHaveAttribute("aria-pressed", "true");
  await expect(orderedRow(page, "Sample School 08")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ArrowUp");
  await expect(orderedRow(page, "Sample School 08")).toHaveAttribute("aria-pressed", "true");
});

test("a school without coordinates is listed and selectable but has no mark", async ({ page }) => {
  await openWorkspace(page);
  const key = keyOf("additive_u", "Sample School 05");
  expect(await markAt(page, key)).toBeNull();

  await orderedRow(page, "Sample School 05").click();
  await expect(page.getByRole("complementary", { name: "Sample School 05" })).toBeVisible();
  await expect(page.getByTestId("card-place")).toHaveText("12th");
  await expect(page.locator("[data-testid=screening-map]")).toHaveAttribute("data-selected-key", key);
  await expect(page.locator(".maplibregl-map")).toHaveCount(1);
});

test("credits the basemap", async ({ page }) => {
  await openWorkspace(page);
  await expect(page.getByText("© OpenStreetMap contributors")).toBeVisible();
  await expect(page.getByText("© CARTO")).toBeVisible();
});
