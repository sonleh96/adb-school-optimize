/**
 * The narrow layout leads with the list. Failure modes and the test for each:
 *  1. On a first visit, with Start here open, the first school's name or its Why line is below the fold on a phone or
 *     a tablet, or at 1024 px beside Start here, or the rule line's link runs past the window's edge
 *                                                                      -> "on a first visit at <size>, the first school..."
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
 *  7. Help, then Guides opens Start here off screen when the list has been scrolled  -> "Help, then Guides brings..."
 *  8. The card counts five guides where the data can teach fewer      -> "the card counts the guides it unfolds"
 *  9. Map, key and zoom controls hidden under Start here in the band can still take focus
 *                                                                      -> "with a school open, Start here in the band..."
 * 10. In the Map view the keyboard crosses the whole list before it reaches the key
 *                                                                      -> "in the Map view the key comes before..."
 * 11. Help's or Menu's choices open under Start here or a guide step, or the Menu stays open after a Tab out
 *                                                                      -> "on a phone, Help's and Menu's choices..."
 * 12. The open full key closes when the reader goes to the list and back to the map
 *                                                                      -> "the full key stays open..."
 * 13. A guide step's ring round the Menu button is painted under the top bar, so the step points at nothing
 *                                                                      -> "a guide step's ring round the Menu..."
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
  useMockDataset,
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
  // The widest common laptop size that still shows Start here beside a narrowed list.
  { width: 1024, height: 768, scale: 1 },
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
      // A short card in the list region on a narrow screen; the full panel beside the list from 1024 px.
      if (size.width <= 1023) await expect(rail(page)).toHaveAttribute("data-inflow", "true");
      const first = page.locator(`${ORDERED} button`).first();
      await expect(first).toContainText(SCHOOL);
      // The name and the Why line, not the row's padding, are inside the window.
      for (const part of [first.locator("> span").last(), first.locator("[data-region=row-why]")])
        await expect(part).toBeInViewport({ ratio: 1 });
      // The rule line's one link wraps inside the window, however long its words.
      const link = (await page.locator("[data-region=see-with-urgency]").boundingBox())!;
      expect(link.x + link.width).toBeLessThanOrEqual(size.width);
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
    // A disclosure: one name, its state in aria-expanded.
    await expect(open).toHaveText("Open the guides");
    await expect(open).toHaveAttribute("aria-expanded", "false");
    // A control names what it controls only while that is in the page, unless it says it is closed.
    for (const control of await page.locator("[aria-controls]:not([aria-expanded=false])").all()) {
      const id = await control.getAttribute("aria-controls");
      await expect(page.locator(`[id="${id}"]`), `${id} is in the page`).toHaveCount(1);
    }
    // Its dismiss reads as a choice of its own beside Open the guides, and says in full what it does.
    const dismiss = start.locator("[data-region=hide-guides]");
    await expect(dismiss).toHaveText("No thanks");
    await expect(dismiss).toHaveAccessibleName("No thanks, hide the guides");
    await expect(start.locator("[data-guide]")).toHaveCount(0);
    // A short card: well under half the window.
    const box = (await start.boundingBox())!;
    expect(box.height).toBeLessThan(844 / 4);

    await open.click();
    await expect(open).toHaveText("Open the guides");
    await expect(open).toHaveAttribute("aria-expanded", "true");
    await expect(start.locator("[data-guide]")).toHaveCount(5);

    await dismiss.click();
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
    await expect(numbers).toHaveText(/^1\s*Numbered: ranks 1 to 10$/);
  });
});

test.describe("Start here on a phone, after the list has moved", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test("Help, then Guides brings Start here into the window after the list has been scrolled", async ({
    page,
  }) => {
    await page.goto("/screening");
    await waitForMap(page);
    await expect(rail(page)).toHaveCount(0);
    await page.locator("[data-slot=column]").evaluate((column) => column.scrollBy(0, 900));
    await (await helpItem(page, "Guides")).click();
    await expect(rail(page)).toBeVisible();
    await expect(rail(page).locator("[data-region=open-guides]")).toBeInViewport({ ratio: 1 });
  });

  test("with a school open, Start here in the band leaves nothing under it to tab to", async ({ page }) => {
    await page.goto(`/screening?school=${KEY}&guide=start`);
    await waitForMap(page);
    await expect(rail(page)).toBeVisible();
    await expect(card(page)).toBeVisible();
    for (const hidden of [
      page.locator("[data-slot=legend] [data-region=key-toggle]"),
      page.locator(".maplibregl-ctrl-zoom-in"),
      page.locator(".maplibregl-canvas"),
    ])
      await expect(hidden).toBeHidden();
  });

  test("in the Map view the key comes before the list in the keyboard's order", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    await pane(page, "Map").click();
    await expect(page.locator("[data-slot=legend]")).toBeVisible();
    const reached: string[] = [];
    for (let step = 0; step < 30; step += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const el = document.activeElement;
        if (el?.closest("[data-slot=legend]")) return "key";
        if (el?.closest("ol[aria-label='The list']")) return "list";
        return "";
      });
      if (where) reached.push(where);
      if (reached.includes("key") && reached.includes("list")) break;
    }
    expect(reached[0]).toBe("key");
  });
});

test.describe("the card's count on a dataset that teaches fewer guides", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, firstVisit: true });

  test("the card counts the guides it unfolds", async ({ page, context }) => {
    await useMockDataset(context, "one");
    await page.goto("/screening");
    await waitForMap(page);
    const start = rail(page);
    await expect(start).toBeVisible();
    await start.locator("[data-region=open-guides]").click();
    const count = await start.locator("[data-guide]").count();
    expect(count).toBeLessThan(5);
    const words = [
      "",
      "One short guide shows",
      "Two short guides show",
      "Three short guides show",
      "Four short guides show",
    ];
    await expect(start.locator("h2")).toHaveText(`${words[count]} how to read this screen.`);
  });
});

test.describe("the top bar's lists on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, firstVisit: true });

  /** The element at a choice's centre is the choice: nothing is drawn over it. */
  const onTop = (choice: import("@playwright/test").Locator) =>
    choice.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    });

  for (const [what, search] of [
    ["Start here with a school open", `?school=${KEY}`],
    ["a guide step", "?guide=q1&gstep=1"],
  ] as const) {
    test(`on a phone, Help's and Menu's choices are on top of ${what}`, async ({ page }) => {
      await page.goto(`/screening${search}`);
      await waitForMap(page);
      await expect(rail(page)).toBeVisible();
      for (const [button, list] of [
        ["[data-region=help-button]:visible", "#screening-help-menu"],
        ["[data-region=actions-menu]:visible", "#screening-menu"],
      ]) {
        await page.locator(button).click();
        const choices = page.locator(`${list} button`);
        await expect(choices.first()).toBeVisible();
        for (const choice of await choices.all())
          expect(await onTop(choice), `${await choice.textContent()} is on top`).toBe(true);
        await page.keyboard.press("Escape");
        await expect(page.locator(list)).toHaveCount(0);
      }
    });
  }

  test("on a phone, the Menu closes when the reader tabs out of it", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    await page.locator("[data-region=actions-menu]:visible").click();
    const menu = page.locator("#screening-menu");
    await expect(menu).toBeVisible();
    for (let step = 0; step < 8 && (await menu.count()) > 0; step += 1) await page.keyboard.press("Tab");
    await expect(menu).toHaveCount(0);
  });
});

test.describe("the full key on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test("the full key stays open when the reader goes to the list and back to the map", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    await pane(page, "Map").click();
    const toggle = page.locator("[data-slot=legend] [data-region=key-toggle]");
    await toggle.click();
    await expect(page.getByTestId("legend-rule")).toBeVisible();
    await pane(page, "List").click();
    await pane(page, "Map").click();
    await expect(page.getByTestId("legend-rule")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});

/** Navy (the ring's colour) at the middle of each side of the ring's box, read from what is painted there. */
async function ringPainted(
  page: import("@playwright/test").Page,
  box: { x: number; y: number; width: number; height: number }
) {
  const clip = {
    x: Math.floor(box.x),
    y: Math.floor(box.y),
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
  };
  const png = (await page.screenshot({ clip, scale: "css" })).toString("base64");
  return page.evaluate(
    async ({ png, width, height }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(image, 0, 0, width, height);
      // The ring is a 2 px border at the box's edge: one pixel in from each side, at its middle.
      const points = [
        [width / 2, 1],
        [width / 2, height - 2],
        [1, height / 2],
        [width - 2, height / 2],
      ];
      return points.filter(([x, y]) => {
        const [r, g, b] = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return b > r + 40 && b > g + 20 && r < 90;
      }).length;
    },
    { png, width: clip.width, height: clip.height }
  );
}

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
]) {
  test.describe(`a guide step's ring at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size, deviceScaleFactor: 2 });

    test(`a guide step's ring round the Menu button is painted over the top bar at ${size.width} by ${size.height}`, async ({
      page,
    }) => {
      await page.goto("/screening?guide=q1&gstep=4");
      await waitForMap(page);
      await expect(rail(page)).toHaveAttribute("data-step", "true");
      const menu = (await page.locator("[data-region=actions-menu]:visible").boundingBox())!;
      const ring = page.locator("[data-testid=guide-rings] > div").first();
      // Once it has settled round the whole button.
      await expect
        .poll(async () => {
          const r = (await ring.boundingBox())!;
          return (
            r.x <= menu.x &&
            r.y <= menu.y &&
            r.x + r.width >= menu.x + menu.width &&
            r.y + r.height >= menu.y + menu.height
          );
        })
        .toBe(true);
      await page.waitForFunction(() => document.getAnimations().length === 0);
      expect(await ringPainted(page, (await ring.boundingBox())!)).toBeGreaterThanOrEqual(3);
    });
  });
}
