/**
 * The /screening workspace in a real browser, against the mock API that serves responses saved from the real API
 * (e2e/fixtures/screening). Failure modes and the test for each:
 *  1. Map canvases pile up across rule switches and selections         -> "keeps one map"
 *  2. List and map selection drift apart (either direction, either tab)  -> "selecting a row...", "clicking a mark..."
 *  3. The wrong order for range or queue schools                         -> "shows the rows in the API's order"
 *  4. An interval school shown with a single rank, even with equal ends -> "shows the rows...", "an exact range..."
 *  5. A rule switch shows another rule's rows, or loses the selection    -> "switching the rule..."
 *  6. A school with no coordinates breaks the map or the card            -> "a school without coordinates"
 *  7. Console errors (hydration, WebGL, style, failed requests)          -> every test, via `problems`
 *  8. A place without the scope it is counted in                         -> "names the scope..."
 *  9. Arrow keys leave the order on screen, or Escape does nothing       -> "arrow keys..."
 * 10. The map or the card traps a keyboard user, or hides focus          -> "the map can be reached..."
 * 11. Attribution text too faint to read                                 -> "credits the basemap..."
 * 12. A place number missing, wrong or off its dot, or left behind by a pan -> "the first ten places..."
 * The states (stale rows, failures, slow loads, basemap failure) are in screening-states.spec.ts, and the
 * WebGL leak is in screening-leak.spec.ts. The map staying out of the initial bundle is held by `bundle:check`.
 */
import { contrastRatio } from "../lib/screening/contrast";
import {
  INCOMPLETE,
  MAIN_RULE,
  URGENCY_RULE,
  ORDERED_COUNT,
  RULE,
  expect,
  keyOf,
  listNames,
  mainRule,
  openRules,
  tab,
  mapLocator,
  markAt,
  numberedPlaces,
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
  expect(names).toEqual(orderedNames(MAIN_RULE));
  expect(names.slice(12, 17)).toEqual([
    "Sample School 05",
    "Sample School 17",
    "Sample School 06",
    "Sample School 14",
    "Sample School 18",
  ]);

  // The range school reads as a range, never as one rank.
  const range = orderedRow(page, "Sample School 17");
  await expect(range.locator("[data-place=range]")).toContainText("10thto17th");
  await expect(orderedRow(page, "Sample School 08").locator("[data-place=point]")).toHaveText("1st");

  // Counts appear with the data, never before it.
  await expect(tab(page, /The list/)).toHaveText(`The list(${ORDERED_COUNT})`);
  await expect(tab(page, /Missing information/)).toHaveText("Missing information(3)");
});

test("an exact range keeps the range treatment and carries its scope in the row", async ({ page }) => {
  await openWorkspace(page);

  // Both ends are the 22nd place, yet the school is not a plain 22nd: the row says what the 22nd counts among.
  const row = orderedRow(page, "Sample School 25");
  const place = row.locator("[data-place]");
  await expect(place).toHaveAttribute("data-place", "scoped");
  await expect(place).toHaveText("22ndof 22");
  await expect(page.locator("[data-place=point]", { hasText: "of" })).toHaveCount(0);

  // The card's figure carries the scope too, and says why the place cannot move.
  await row.click();
  await expect(page.getByTestId("card-place")).toHaveText("22ndof 22");
  await expect(page.getByTestId("card-context")).toContainText(
    "but under this rule that cannot change its rank in the list."
  );

  // A range school whose ends differ shows its range, never one rank.
  await orderedRow(page, "Sample School 17").click();
  await expect(page.getByTestId("card-place")).toHaveText("10thto17th");
});

test("names the scope each place is counted in, in the list header, the card and the tooltip", async ({
  page,
}) => {
  await openWorkspace(page);
  await expect(page.locator("[data-region=scope] p").first()).toHaveText(
    "22 schools are in the list. Read more"
  );

  // The tooltip names it too. It is checked on the map's first view, where every mark is on screen: choosing
  // schools in the list pans the map to the last one chosen, and how far depends on how long each pan had run when
  // the next school was chosen, so afterwards a given mark can be off screen.
  const point = await settledMark(page, keyOf(MAIN_RULE, "Sample School 13"));
  await page.mouse.move(point.x, point.y);
  await expect(page.getByRole("status").filter({ hasText: "Sample School 13" })).toContainText(
    "5th of the 17 schools with a record for every input the rule uses"
  );

  await orderedRow(page, "Sample School 15").click();
  await expect(page.getByTestId("card-context")).toHaveText(
    "Among the 17 schools with a record for every input the rule uses."
  );
  await orderedRow(page, "Sample School 17").click();
  await expect(page.getByTestId("card-context")).toContainText(
    "Possible ranks among the 22 schools that can be put in order."
  );
});

test("an exact range's tooltip carries the exact note", async ({ page }) => {
  await openWorkspace(page);
  const point = await settledMark(page, keyOf(MAIN_RULE, "Sample School 25"));
  await page.mouse.move(point.x, point.y);
  const tooltip = page.getByRole("status").filter({ hasText: "Sample School 25" });
  await expect(tooltip).toContainText("22nd of the 22 schools that can be put in order.");
  await expect(tooltip).toContainText("No air-quality figure");
});

test("keeps one map through rule switches and selections", async ({ page }) => {
  await openWorkspace(page);
  const maps = () => page.locator(".maplibregl-map").count();
  const canvases = () => page.locator("canvas").count();
  expect([await maps(), await canvases()]).toEqual([1, 1]);

  for (let round = 0; round < 3; round += 1) {
    await openRules(page);
    await mainRule(page, RULE.urgency).click();
    await expect(orderedRow(page, "Sample School 23")).toHaveCount(0);
    await orderedRow(page, "Sample School 15").click();
    await mainRule(page, RULE.main).click();
    await expect(orderedRow(page, "Sample School 23")).toHaveCount(1);
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
  expect([await maps(), await canvases()]).toEqual([1, 1]);
});

test("selecting a row selects its mark, and closing the card clears both", async ({ page }) => {
  await openWorkspace(page);
  const key = keyOf(MAIN_RULE, "Sample School 15");
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

  const first = keyOf(MAIN_RULE, "Sample School 12");
  const point = await settledMark(page, first);
  await page.mouse.click(point.x, point.y);
  await expect(orderedRow(page, "Sample School 12")).toHaveAttribute("aria-pressed", "true");
  await expect(mapLocator(page)).toHaveAttribute("data-selected-key", first);

  const queued = keyOf(MAIN_RULE, "Sample School 21");
  const queuedPoint = await settledMark(page, queued);
  await page.mouse.click(queuedPoint.x, queuedPoint.y);
  await expect(tab(page, /Missing information/)).toHaveAttribute("aria-selected", "true");
  await expect(queuedRow(page, "Sample School 21")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("card-place")).toHaveText("Cannot be put in order yet");
});

test("switching the rule shows that rule's rows and keeps the selection on the tab that holds it", async ({
  page,
}) => {
  await openWorkspace(page);

  // In the list under the main rule, which does not read its unknown urgency.
  await orderedRow(page, "Sample School 23").click();
  await expect(page.getByTestId("card-place")).toHaveText("17th");
  await expect(tab(page, /Missing information/)).toHaveText("Missing information(3)");

  // Urgency is included, so the selected school is held back and the list follows it to its tab.
  await openRules(page);
  await mainRule(page, RULE.urgency).click();
  await expect(tab(page, /Missing information/)).toHaveAttribute("aria-selected", "true");
  await expect(queuedRow(page, "Sample School 23")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("card-place")).toHaveText("Cannot be put in order yet");
  await tab(page, /The list/).click();
  expect(await listNames(page)).toEqual(orderedNames(URGENCY_RULE));
  await tab(page, /Missing information/).click();
  await queuedRow(page, "Sample School 23").click();

  // Back on the main rule, the school has its rank again and the list follows it.
  await mainRule(page, RULE.main).click();
  await expect(tab(page, /The list/)).toHaveAttribute("aria-selected", "true");
  await expect(orderedRow(page, "Sample School 23")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("card-place")).toHaveText("17th");
  expect(await listNames(page)).toEqual(orderedNames(MAIN_RULE));

  // A rule from "Other rules" lists its own order, and the selection stays where it is held back.
  await page.getByRole("button", { name: /Other ways to order the list/ }).click();
  await page.getByRole("button", { name: new RegExp(`^${RULE.needFirst}`) }).click();
  await expect(queuedRow(page, "Sample School 23")).toHaveAttribute("aria-pressed", "true");
  await tab(page, /The list/).click();
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
  await tab(page, /Missing information/).click();
  const onScreen = await page.locator(`${INCOMPLETE} button span[class*=name]`).allTextContents();
  expect(onScreen).toEqual(queuedNames(MAIN_RULE));

  await queuedRow(page, onScreen[0]).click();
  for (let step = 1; step < onScreen.length; step += 1) {
    await page.keyboard.press("ArrowDown");
    // Each press lands on the next row as the groups show them.
    await expect(page.locator(`${INCOMPLETE} button[aria-pressed=true] span[class*=name]`)).toHaveText(
      onScreen[step]
    );
  }

  // Keys that come faster than a render still move one row each, from the row that has focus.
  for (let step = 1; step < onScreen.length; step += 1) await page.keyboard.press("ArrowUp");
  await expect(page.locator(`${INCOMPLETE} button[aria-pressed=true] span[class*=name]`)).toHaveText(
    onScreen[0]
  );
});

test("a school without coordinates is listed and selectable but has no mark", async ({ page }) => {
  await openWorkspace(page);
  const key = keyOf(MAIN_RULE, "Sample School 05");
  expect(await markAt(page, key)).toBeNull();

  await orderedRow(page, "Sample School 05").click();
  await expect(page.getByRole("complementary", { name: "Sample School 05" })).toBeVisible();
  await expect(page.getByTestId("card-place")).toHaveText("13th");
  await expect(mapLocator(page)).toHaveAttribute("data-selected-key", key);
  await expect(page.locator(".maplibregl-map")).toHaveCount(1);
});

test("the map can be reached and left with the keyboard, and closing the card returns focus", async ({
  page,
}) => {
  await openWorkspace(page);
  const canvas = page.locator("canvas.maplibregl-canvas");

  // It has a name that points to the list as the keyboard route.
  await expect(canvas).toHaveAttribute(
    "aria-label",
    "Map of secondary schools in Papua New Guinea. To choose a school with the keyboard, use the list or the schools with missing information."
  );

  // Focus shows: an outline the user can see.
  await canvas.focus();
  const outline = await canvas.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);

  // Closing the card hands focus back to the school's row.
  const key = keyOf(MAIN_RULE, "Sample School 13");
  await orderedRow(page, "Sample School 13").click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
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

test("the first ten places carry their number on their dot, and the numbers follow the map", async ({
  page,
}) => {
  await openWorkspace(page);
  const numbered = numberedPlaces(MAIN_RULE);
  expect(numbered.length).toBeGreaterThan(5);
  // Nothing else is numbered: not the places after the tenth, not the ranges, not the incomplete records.
  await expect(page.locator("[data-rank-label]")).toHaveCount(numbered.length);
  // Where two dots overlap, the earlier place's number must sit on top, as its dot does. The stacking is each
  // marker's z-index, so it must hold after a rule switch redraws the labels too, not just on the first render.
  const expectEarlierPlacesOnTop = async (rule: string) => {
    const painted = (
      await page.locator("[data-rank-label]").evaluateAll((labels) =>
        labels.map((label) => ({
          rank: Number(label.getAttribute("data-rank-label")),
          zIndex: Number(getComputedStyle(label.closest(".maplibregl-marker")!).zIndex),
        }))
      )
    ).sort((a, b) => a.rank - b.rank);
    expect(painted.map((place) => place.rank)).toEqual(
      numberedPlaces(rule)
        .map((place) => place.rank)
        .sort((a, b) => a - b)
    );
    for (let index = 1; index < painted.length; index += 1) {
      expect(
        painted[index - 1].zIndex,
        `place ${painted[index - 1].rank} above place ${painted[index].rank}`
      ).toBeGreaterThan(painted[index].zIndex);
    }
  };
  await expectEarlierPlacesOnTop(MAIN_RULE);

  await openRules(page);
  await mainRule(page, RULE.urgency).click();
  await expect(page.locator("[data-rank-label][data-stale=false]")).toHaveCount(
    numberedPlaces(URGENCY_RULE).length
  );
  await expectEarlierPlacesOnTop(URGENCY_RULE);

  await mainRule(page, RULE.main).click();
  await expect(page.locator("[data-rank-label][data-stale=false]")).toHaveCount(numbered.length);
  await expectEarlierPlacesOnTop(MAIN_RULE);

  // The list states every place, so a screen reader is not read the numbers on the map as well.
  for (const label of await page.locator("[data-rank-label]").all()) {
    await expect(label).toHaveAttribute("aria-hidden", "true");
  }

  const expectLabelsOnTheirDots = async () => {
    for (const { key, rank } of numbered) {
      const dot = await settledMark(page, key);
      const label = page.locator(`[data-rank-label='${rank}']`);
      await expect(label).toHaveText(String(rank));
      const box = (await label.boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - dot.x)).toBeLessThan(1.5);
      expect(Math.abs(box.y + box.height / 2 - dot.y)).toBeLessThan(1.5);
    }
  };
  await expectLabelsOnTheirDots();

  // Zoom out from an empty stretch of map: the labels stay on their dots.
  await page.mouse.move(1450, 560);
  await page.mouse.wheel(0, 240);
  await expectLabelsOnTheirDots();
});
