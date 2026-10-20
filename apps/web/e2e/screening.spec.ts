/**
 * The /screening workspace in a real browser, against the mock API that serves responses saved from the real API
 * (e2e/fixtures/screening). Failure modes and the test for each:
 *  1. Map canvases pile up across rule switches and selections         -> "keeps one map"
 *  2. List and map selection drift apart (either direction, either tab)  -> "selecting a row...", "clicking a mark..."
 *  3. The wrong order for range or queue schools                         -> "shows the rows in the API's order"
 *  4. An interval school shown with a single place, even with equal ends -> "shows the rows...", "an exact range..."
 *  5. A rule switch shows another rule's rows, or loses the selection    -> "switching the rule..."
 *  6. A school with no coordinates breaks the map or the card            -> "a school without coordinates"
 *  7. Console errors (hydration, WebGL, style, failed requests)          -> every test, via `problems`
 *  8. A place without the scope it is counted in                         -> "names the scope..."
 *  9. Arrow keys leave the order on screen, or Escape does nothing       -> "arrow keys..."
 * 10. The map or the card traps a keyboard user, or hides focus          -> "the map can be reached..."
 * 11. Attribution text too faint to read                                 -> "credits the basemap..."
 * The states (stale rows, failures, slow loads, basemap failure) are in screening-states.spec.ts, and the
 * WebGL leak is in screening-leak.spec.ts. The map staying out of the initial bundle is held by `bundle:check`.
 */
import { contrastRatio } from "../lib/screening/contrast";
import { COPY } from "../components/screening/copy";
import {
  ORDERED_COUNT,
  expect,
  keyOf,
  listNames,
  mapLocator,
  markAt,
  openWorkspace,
  orderedNames,
  orderedRow,
  queuedNames,
  queuedRow,
  ringDrawnAround,
  settledMark,
  test,
} from "./screening-helpers";

// The design's reference size. A smaller window pans the map under the panels, which hides marks from a click.
test.use({ viewport: { width: 1600, height: 1000 } });
// The map's two chunks (about 0.5 MB gzip) and its WebGL setup take a while when several browsers start together.
test.describe.configure({ timeout: 60_000 });

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

  // Counts appear with the data, never before it.
  await expect(page.getByRole("tab", { name: /Ordered list/ })).toHaveText(`Ordered list${ORDERED_COUNT}`);
  await expect(page.getByRole("tab", { name: /Incomplete records/ })).toHaveText("Incomplete records4");
});

test("an exact range keeps the range treatment and says it is exact", async ({ page }) => {
  await openWorkspace(page);

  // Both ends are the 21st place, yet the school is not a plain 21st.
  const row = orderedRow(page, "Sample School 25");
  const place = row.locator("[data-place]");
  await expect(place).toHaveAttribute("data-place", "range");
  await expect(place).toHaveAttribute("data-exact", "true");
  await expect(place).toHaveText("21st");
  await expect(row).toContainText(COPY.exactRange);
  await expect(page.locator("[data-place=point][data-exact]")).toHaveCount(0);

  await row.click();
  await expect(page.getByTestId("card-place")).toHaveText("21st");
  await expect(page.getByRole("complementary", { name: "Sample School 25" })).toContainText(COPY.exactRange);
  await expect(page.getByTestId("card-scope")).toHaveText(COPY.cardScope("eligible (21)"));

  // A range school that is not exact has no such note.
  await orderedRow(page, "Sample School 17").click();
  await expect(page.getByRole("complementary", { name: "Sample School 17" })).not.toContainText(
    COPY.exactRange
  );
});

test("names the scope each place is counted in, in the list header, the card and the tooltip", async ({
  page,
}) => {
  await openWorkspace(page);
  await expect(page.getByTestId("list-scopes")).toHaveText(
    COPY.listScopes("complete under this rule (16)", "eligible (21)")
  );

  // The tooltip names it too. It is checked on the map's first view, where every mark is on screen: choosing
  // schools in the list pans the map to the last one chosen, and how far depends on how long each pan had run when
  // the next school was chosen, so afterwards a given mark can be off screen.
  const point = await settledMark(page, keyOf("additive_u", "Sample School 13"));
  await page.mouse.move(point.x, point.y);
  await expect(page.getByRole("status").filter({ hasText: "Sample School 13" })).toContainText(
    COPY.placeAmong("3rd", "complete under this rule (16)")
  );

  await orderedRow(page, "Sample School 15").click();
  await expect(page.getByTestId("card-scope")).toHaveText(COPY.cardScope("complete under this rule (16)"));
  await orderedRow(page, "Sample School 17").click();
  await expect(page.getByTestId("card-scope")).toHaveText(COPY.cardScope("eligible (21)"));
});

test("an exact range's tooltip carries the exact note", async ({ page }) => {
  await openWorkspace(page);
  const point = await settledMark(page, keyOf("additive_u", "Sample School 25"));
  await page.mouse.move(point.x, point.y);
  const tooltip = page.getByRole("status").filter({ hasText: "Sample School 25" });
  await expect(tooltip).toContainText(COPY.placeAmong("21st", "eligible (21)"));
  await expect(tooltip).toContainText(COPY.exactRange);
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
  await expect(mapLocator(page)).toHaveAttribute("data-selected-key", key);
  await expect(page.getByRole("complementary", { name: "Sample School 15" })).toBeVisible();
  await expect(page.getByTestId("card-place")).toHaveText("2nd");
  await expect.poll(() => ringDrawnAround(page, key, 8)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(mapLocator(page)).toHaveAttribute("data-selected-key", "");
  await expect(orderedRow(page, "Sample School 15")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => ringDrawnAround(page, key, 8)).toBe(false);
});

test("clicking a mark selects its row, on the tab that holds it", async ({ page }) => {
  await openWorkspace(page);

  const first = keyOf("additive_u", "Sample School 12");
  const point = await settledMark(page, first);
  await page.mouse.click(point.x, point.y);
  await expect(orderedRow(page, "Sample School 12")).toHaveAttribute("aria-pressed", "true");
  await expect(mapLocator(page)).toHaveAttribute("data-selected-key", first);

  const queued = keyOf("additive_u", "Sample School 21");
  const queuedPoint = await settledMark(page, queued);
  await page.mouse.click(queuedPoint.x, queuedPoint.y);
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

test("arrow keys move through the list in the order on screen and Escape closes the card", async ({
  page,
}) => {
  await openWorkspace(page);
  await orderedRow(page, "Sample School 08").click();
  await page.keyboard.press("ArrowDown");
  await expect(orderedRow(page, "Sample School 15")).toHaveAttribute("aria-pressed", "true");
  await expect(orderedRow(page, "Sample School 08")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ArrowUp");
  await expect(orderedRow(page, "Sample School 08")).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Sample School 08" })).toHaveCount(0);
  await expect(orderedRow(page, "Sample School 08")).toHaveAttribute("aria-pressed", "false");
});

test("arrow keys on the incomplete records follow the grouped order on screen", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("tab", { name: /Incomplete records/ }).click();
  const onScreen = await page
    .locator("ol[aria-label='Incomplete records'] button span[class*=name]")
    .allTextContents();
  expect(onScreen).toEqual(queuedNames("additive_u"));

  await queuedRow(page, onScreen[0]).click();
  for (let step = 1; step < onScreen.length; step += 1) {
    await page.keyboard.press("ArrowDown");
    // Each press lands on the next row as the groups show them.
    await expect(
      page.locator("ol[aria-label='Incomplete records'] button[aria-pressed=true] span[class*=name]")
    ).toHaveText(onScreen[step]);
  }

  // Keys that come faster than a render still move one row each, from the row that has focus.
  for (let step = 1; step < onScreen.length; step += 1) await page.keyboard.press("ArrowUp");
  await expect(
    page.locator("ol[aria-label='Incomplete records'] button[aria-pressed=true] span[class*=name]")
  ).toHaveText(onScreen[0]);
});

test("a school without coordinates is listed and selectable but has no mark", async ({ page }) => {
  await openWorkspace(page);
  const key = keyOf("additive_u", "Sample School 05");
  expect(await markAt(page, key)).toBeNull();

  await orderedRow(page, "Sample School 05").click();
  await expect(page.getByRole("complementary", { name: "Sample School 05" })).toBeVisible();
  await expect(page.getByTestId("card-place")).toHaveText("12th");
  await expect(mapLocator(page)).toHaveAttribute("data-selected-key", key);
  await expect(page.locator(".maplibregl-map")).toHaveCount(1);
});

test("the map can be reached and left with the keyboard, and closing the card returns focus", async ({
  page,
}) => {
  await openWorkspace(page);
  const canvas = page.locator("canvas.maplibregl-canvas");

  // It has a name that points to the list as the keyboard route.
  await expect(canvas).toHaveAttribute("aria-label", COPY.mapLabel);

  // Focus shows: an outline the user can see.
  await canvas.focus();
  const outline = await canvas.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);

  // Closing the card hands focus back to the school's row.
  const key = keyOf("additive_u", "Sample School 13");
  await orderedRow(page, "Sample School 13").click();
  await page.getByRole("button", { name: COPY.closeCard }).click();
  await expect(orderedRow(page, "Sample School 13")).toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-school-key"))).toBe(key);
});

test("credits the basemap in text that can be read", async ({ page }) => {
  await openWorkspace(page);
  const credit = page.getByTestId("attribution");
  await expect(credit).toHaveText("© OpenStreetMap contributors, © CARTO");
  await expect(credit.getByRole("link", { name: "© OpenStreetMap contributors" })).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/copyright"
  );
  await expect(credit.getByRole("link", { name: "© CARTO" })).toHaveAttribute(
    "href",
    "https://carto.com/attributions"
  );

  // 4.5:1 against the land colour behind it, as rendered.
  const { text, background } = await credit.evaluate((element) => {
    const toHex = (rgb: string) =>
      "#" +
      (rgb.match(/\d+/g) ?? [])
        .slice(0, 3)
        .map((v) => Number(v).toString(16).padStart(2, "0"))
        .join("");
    return {
      text: toHex(getComputedStyle(element).color),
      background: toHex(getComputedStyle(element.parentElement!).backgroundColor),
    };
  });
  expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(4.5);
});
