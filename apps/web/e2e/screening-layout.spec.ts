/**
 * The workspace at the sizes notes/final.md specifies (R21, R22). Failure modes and the test for each:
 *  1. At some width the page scrolls sideways, two panels overlap, the map is starved, or the first school is below
 *     the fold                                                   -> "at <size>, with and without a card..."
 *  2. The list stays beside a card that leaves the map under 480 px, or steps aside when there is room, or cannot
 *     be brought back, or loses the keyboard user's focus        -> "the list steps aside..."
 *  3. A keyboard action animates                                 -> "keyboard actions never animate"
 *  4. The narrow layout hides the map, keeps the list beside the card, or opens no key -> "the narrow layout..."
 *  5. Escape closes the card before a popover over it            -> "Escape closes the innermost layer first"
 *  6. A card that steps the list aside leaves focus on the hidden row, so the keyboard user is dropped and Escape
 *     does nothing                                               -> "a card that steps the list aside takes focus..."
 *  7. At 200 percent zoom the open key runs under the top bar, hiding its title and the toggle that closes it
 *     -> "the open key stays inside the map band..."
 *  8. On a phone a rule's label in the switch wraps to a third line, pushing the list down, fits with too little room
 *     to spare for another platform's wider text, or spills out of its button or the switch
 *                                                                -> "on a phone each label in the rule switch..."
 *  9. The caveat (what the tool does not show or decide) shows twice, or only after opening or scrolling to something,
 *     or sits off-screen or under a panel at some size, or in either of the narrow layout's List and Map
 *                                                                     -> "the caveat shows once..."
 */
import type { Page } from "@playwright/test";

import { ORDERED, expect, keyOf, openRules, orderedRow, test, waitForMap } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const SCHOOL = keyOf("additive_no_u", "Sample School 08");

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

/**
 * The room a label's longest unbreakable run of words ("Combined factors,") may take. Text sets wider on Linux than on
 * macOS, and differently again on phones, so a label that only just fits on one platform wraps on another.
 */
const LABEL_HEADROOM = 0.92;

for (const size of [
  { width: 360, height: 740 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]) {
  test.describe(`at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size });

    test(`on a phone each label in the rule switch takes at most two lines and stays inside its button, at ${size.width} by ${size.height}`, async ({
      page,
    }) => {
      await page.goto("/screening");
      await waitForMap(page);
      await openRules(page);
      const buttons = page.locator("[data-region=rule-switch] button");
      await expect(buttons).toHaveCount(2);
      await page.evaluate(() => document.fonts.ready);
      const report = await page.evaluate(() => {
        const group = document.querySelector("[data-region=rule-switch]")!;
        const outer = group.getBoundingClientRect();
        return [...group.querySelectorAll("button")].map((button) => {
          const label = button.querySelector("[class*=ruleButtonLabel]")!;
          const box = button.getBoundingClientRect();
          const text = label.getBoundingClientRect();
          // The widest line the label can be broken into: the words up to and including its comma, set on one line.
          const probe = document.createElement("span");
          probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
          probe.style.font = getComputedStyle(label).font;
          probe.textContent = `${(label.textContent ?? "").split(", ")[0]},`;
          document.body.append(probe);
          const longest = probe.getBoundingClientRect().width;
          probe.remove();
          return {
            label: label.textContent,
            share: longest / text.width,
            lines: Math.round(text.height / parseFloat(getComputedStyle(label).lineHeight)),
            spills: button.scrollWidth > button.clientWidth || label.scrollWidth > label.clientWidth,
            outside:
              text.right > box.right + 0.5 ||
              text.bottom > box.bottom + 0.5 ||
              box.left < outer.left - 0.5 ||
              box.right > outer.right + 0.5,
          };
        });
      });
      for (const button of report) {
        expect(button.lines, `${button.label} lines`).toBeLessThanOrEqual(2);
        expect(button.share, `${button.label}: its longest line's share of the room`).toBeLessThanOrEqual(
          LABEL_HEADROOM
        );
        expect(button.spills, `${button.label} spills`).toBe(false);
        expect(button.outside, `${button.label} leaves its button or the switch`).toBe(false);
      }
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
    await openRules(page);
    await page.getByRole("button", { name: "Other ways to order the list (5)" }).click();
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

  test("the narrow layout shows the list, opens the map band from Map, puts the card in the list's place, and opens the key on demand", async ({
    page,
  }) => {
    await page.goto("/screening");
    await waitForMap(page);
    await expect(page.getByRole("heading", { level: 1, name: "RISE-PNG" })).toBeVisible();
    // The list first, under the top bar and the switch; a card takes its place there.
    await expect(page.getByTestId("screening-map")).toBeHidden();
    await orderedRow(page, "Sample School 08").click();
    await expect
      .poll(async () => await page.locator("[data-slot=school-card]").boundingBox())
      .toMatchObject({ y: 56 + 44, width: 768 });
    await page.locator("[data-slot=school-card]").getByRole("button", { name: "The list" }).click();

    await page.locator("[data-region=pane-switch]").getByRole("button", { name: "Map", exact: true }).click();
    const map = (await page.getByTestId("screening-map").boundingBox())!;
    expect(map.y).toBe(56 + 44);
    expect(map.height).toBe(410);

    // The key is compact, its marks named in a few words, until What the map shows opens it in full.
    const key = page.locator("[data-slot=legend]");
    await expect(key.locator("[data-region=legend-point]")).toHaveText("One position");
    await key.getByRole("button", { name: "What the map shows" }).click();
    await expect(key.locator("[data-region=legend-point]")).toContainText("Filled dot");
    await key.getByRole("button", { name: "Hide the full key" }).click();
    await expect(key.locator("[data-region=legend-point]")).toHaveText("One position");

    await orderedRow(page, "Sample School 08").click();
    // Measured once the card has finished coming in.
    await expect
      .poll(async () => await page.locator("[data-slot=school-card]").boundingBox())
      .toMatchObject({ y: 56 + 44 + 410, width: 768 });
    await expect(page.locator("section[class*=column]")).toBeHidden();
    await page.locator("[data-slot=school-card]").getByRole("button", { name: "The list" }).click();
    await expect(page.locator("section[class*=column]")).toBeVisible();
  });
});

for (const size of [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
]) {
  test.describe(`a card opened from the keyboard at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size });

    test(`a card that steps the list aside takes focus, and Escape closes it back to its row at ${size.width} by ${size.height}`, async ({
      page,
    }) => {
      await page.goto("/screening");
      await waitForMap(page);
      const row = orderedRow(page, "Sample School 13");
      const card = page.locator("[data-slot=school-card]");
      await row.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("screening-workspace")).toHaveAttribute("data-card-docked", "true");
      // The row went with the list, so focus is in the card, on its heading.
      await expect(card.getByRole("heading", { level: 2 })).toBeFocused();

      await page.keyboard.press("Escape");
      await expect(card).toHaveCount(0);
      await expect(row).toBeFocused();
    });
  });
}

test.describe("the key at 200 percent zoom", () => {
  test.use({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 2 });

  test("the open key stays inside the map band, under the top bar, and closes again", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    await page.locator("[data-region=pane-switch]").getByRole("button", { name: "Map", exact: true }).click();
    const key = page.locator("[data-slot=legend]");
    await key.getByRole("button", { name: "What the map shows" }).click();
    await expect(page.getByTestId("legend-rule")).toBeAttached();

    const fits = await page.evaluate(() => {
      const box = document.querySelector("[data-slot=legend]")!.getBoundingClientRect();
      // The top bar and, under it, the List / Map switch.
      const bar = document.querySelector("[data-region=pane-switch]")!.getBoundingClientRect();
      const band = document.querySelector("[data-testid=screening-map]")!.getBoundingClientRect();
      // What is drawn at the toggle's centre and at the title's is the toggle and the title, not the top bar.
      const atCentre = (selector: string) => {
        const el = document.querySelector<HTMLElement>(`[data-slot=legend] ${selector}`)!;
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      };
      return {
        belowBar: box.top >= bar.bottom,
        insideBand: box.bottom <= band.bottom + 1,
        toggle: atCentre("button[aria-controls]"),
        title: atCentre("[data-testid=legend-rule]"),
      };
    });
    expect(fits).toEqual({ belowBar: true, insideBand: true, toggle: true, title: true });

    // The ramp and the marks can be read by scrolling inside the key.
    await key.locator("ol li").first().scrollIntoViewIfNeeded();
    await expect(key.locator("ol li").first()).toBeInViewport();
    await key.getByRole("button", { name: "Hide the full key" }).click();
    await expect(page.getByTestId("legend-rule")).toHaveCount(0);
  });
});

/** The caveat in the copy's words: what the tool does not show or decide. */
const CAVEAT = /It does not show a school's real condition or safety/;

for (const size of [
  { width: 1600, height: 1000, scale: 1 },
  { width: 1440, height: 900, scale: 1 },
  { width: 1280, height: 800, scale: 1 },
  { width: 1024, height: 768, scale: 1 },
  { width: 768, height: 1024, scale: 1 },
  { width: 800, height: 500, scale: 2 },
  { width: 390, height: 844, scale: 1 },
  { width: 360, height: 740, scale: 2 },
]) {
  // The narrow layout shows the list or, from Map, the map band over it: the caveat holds in both.
  const panes = size.width <= 1023 ? (["List", "Map"] as const) : ([null] as const);
  for (const [visit, pane] of (["a first visit", "a returning visit"] as const).flatMap((v) =>
    panes.map((p) => [v, p] as const)
  )) {
    const on = pane ? `${visit}, showing ${pane}` : visit;
    test.describe(`the caveat at ${size.width} by ${size.height} on ${on}`, () => {
      test.use({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: size.scale,
        firstVisit: visit === "a first visit",
      });

      test(`the caveat shows once, in the window and clear of every panel, at ${size.width} by ${size.height} on ${on}`, async ({
        page,
      }) => {
        await page.goto("/screening");
        await waitForMap(page);
        await expect(page.locator(`${ORDERED} button`).first()).toBeAttached();
        if (visit === "a first visit") await expect(page.getByTestId("guide-rail")).toBeVisible();
        if (pane) {
          const choice = page
            .locator("[data-region=pane-switch]")
            .getByRole("button", { name: pane, exact: true });
          await choice.click();
          await expect(choice).toHaveAttribute("aria-pressed", "true");
        }
        const caveat = page.getByText(CAVEAT).filter({ visible: true });
        await expect(caveat).toHaveCount(1);
        await expect(caveat).toBeInViewport({ ratio: 1 });
        // Nothing covers it: no panel's box meets the caveat's, except the one that holds it.
        const met = await caveat.evaluate((element) => {
          const own = element.getBoundingClientRect();
          const panels = [
            "section[data-slot=column]:not([data-aside])",
            "[data-testid=guide-rail]",
            "[data-slot=legend]",
            "[data-region=actions]",
            "header[class*=topBar]",
            "#slot-hint",
            "[data-slot=school-card]",
            "[data-region=pane-switch]",
          ];
          return panels.flatMap((selector) =>
            [...document.querySelectorAll(selector)].flatMap((panel) => {
              const style = getComputedStyle(panel);
              if (panel.contains(element) || style.display === "none" || style.visibility === "hidden")
                return [];
              const r = panel.getBoundingClientRect();
              const meets =
                r.width > 0 &&
                r.height > 0 &&
                r.left < own.right - 1 &&
                own.left < r.right - 1 &&
                r.top < own.bottom - 1 &&
                own.top < r.bottom - 1;
              return meets ? [selector] : [];
            })
          );
        });
        expect(met).toEqual([]);
      });
    });
  }
}
