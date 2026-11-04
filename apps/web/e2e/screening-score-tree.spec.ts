/**
 * The fixed diagram of how much each part counts towards the score, in How this works and the method details.
 * Failure modes and the test for each:
 *  1. The diagram is missing from How this works or the method details, shows on the plain first screen, or draws
 *     another structure than the rule on screen has      -> "shows in How this works and the method details ..."
 *  2. Something in it can be dragged, typed in, focused or hovered for more, or it moves, so the shares look like
 *     settings                                            -> "nothing in the diagram can be moved ..."
 *  3. The nested list a screen reader hears says other shares than the bars draw, or the nesting is lost
 *                                                         -> "the nested list says what the bars draw"
 *  4. On a 360 px phone it scrolls sideways, clips a word, or falls under AA contrast
 *                                                         -> "on a 360 px phone ..."
 */
import type { Locator, Page } from "@playwright/test";

import { expect, openWorkspace, test } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const TITLE = "How much each part counts";
const diagram = (scope: Page | Locator) => scope.getByRole("figure", { name: new RegExp(`^${TITLE}`) });
const howSection = (page: Page) =>
  page.getByRole("main", { name: "How this works" }).locator("section[data-key=rules]");
const ruleArea = (page: Page) => page.getByRole("region", { name: "Method", exact: true });

/** How this works, opened from a link, on the rules section. */
async function openHow(page: Page) {
  await openWorkspace(page, "?page=how");
  await howSection(page).scrollIntoViewIfNeeded();
  return page;
}

/** The method details for a rule, with the formula and the diagram open. */
async function openMethod(page: Page, rule: string) {
  await openWorkspace(page, `?analyst=1&rule=${rule}`);
  await ruleArea(page).getByRole("button", { name: "Formula", exact: true }).click();
  return diagram(ruleArea(page));
}

interface Drawn {
  /** What a screen reader reads for the item, without its own items. */
  words: string;
  /** The bar's length over the length of the whole score's, and both in pixels. */
  bar: number;
  scale: number;
  /** Where the item's words start. */
  left: number;
  parts: Drawn[];
}

/** The diagram's list as the page lays it out: each item's words beside the bar drawn for it, item by item. */
async function drawing(figure: Locator): Promise<{ items: Drawn[]; whole: Drawn }> {
  return figure.evaluate((root) => {
    const read = (row: Element) => {
      const scale = row.querySelector('[aria-hidden="true"]')!;
      const bar = scale.firstElementChild!;
      const words = Array.from(row.children).filter((child) => child !== scale);
      return {
        words: words.map((w) => (w as HTMLElement).innerText.replace(/\s+/g, " ").trim()).join(" "),
        bar: bar.getBoundingClientRect().width,
        scale: scale.getBoundingClientRect().width,
        left:
          words[0].getBoundingClientRect().left + Number.parseFloat(getComputedStyle(words[0]).paddingLeft),
      };
    };
    const items = (list: Element | null): Drawn[] =>
      list
        ? Array.from(list.children).map((item) => ({
            ...read(item.firstElementChild!),
            parts: items(item.querySelector(":scope > ul")),
          }))
        : [];
    return {
      items: items(root.querySelector(":scope > ul")),
      whole: { ...read(root.querySelector("[data-row=whole]")!.firstElementChild!), parts: [] },
    };
  });
}

/** The share an item's words state, in percent, and whether they state it exactly or as "about". */
function stated(words: string): { percent: number; exact: boolean } {
  const match = /(about )?(\d+)%/.exec(words);
  if (!match) throw new Error(`no share in ${JSON.stringify(words)}`);
  return { percent: Number(match[2]), exact: !match[1] };
}

function expectBarsMatchWords(items: Drawn[], where: string) {
  for (const item of items) {
    const drawnPercent = (100 * item.bar) / item.scale;
    const { percent, exact } = stated(item.words);
    if (exact) expect(Math.abs(drawnPercent - percent), `${where}: ${item.words}`).toBeLessThan(0.5);
    else expect(Math.round(drawnPercent), `${where}: ${item.words}`).toBe(percent);
    if (item.parts.length > 0) {
      // A part made of others: their bars end to end are its bar, and their words sit further in.
      const sum = item.parts.reduce((total, part) => total + part.bar, 0);
      expect(Math.abs(sum - item.bar), `${where}: the parts of ${item.words}`).toBeLessThanOrEqual(1);
      for (const part of item.parts)
        expect(part.left, `${where}: ${part.words} under ${item.words}`).toBeGreaterThan(item.left + 8);
      expectBarsMatchWords(item.parts, where);
    }
  }
}

test("shows in How this works and the method details, as the rule on screen combines its parts", async ({
  page,
}) => {
  // Not on the plain first screen.
  await openWorkspace(page);
  await expect(diagram(page)).toHaveCount(0);

  // How this works: the section on how a rule turns inputs into an order opens with the main method's diagram.
  await openWorkspace(page, "?page=how");
  const how = diagram(howSection(page));
  await expect(how).toBeVisible();
  await expect(how.getByRole("listitem").first()).toContainText(/School need\s*about 63%/);
  await expect(how).toContainText(/District context\s*about 16%/);
  // It draws the rule on screen: under a need-first rule, that rule's one line.
  await openWorkspace(page, "?page=how&rule=need_first_no_u");
  const howNeedFirst = diagram(howSection(page));
  await expect(howNeedFirst).toContainText(
    "Schools go in order of school need, and other factors, without urgency, only break exact ties."
  );
  await expect(howNeedFirst.getByRole("list")).toHaveCount(0);

  // The method details, next to the formula: a largest-factor rule draws its combined factors and its extra term.
  const largest = await openMethod(page, "bottleneck_no_u");
  await expect(largest).toBeVisible();
  const top = largest.getByRole("list").first().locator(":scope > li");
  await expect(top).toHaveCount(2);
  await expect(top.nth(0)).toContainText(/^Combined factors\s*60%/);
  await expect(top.nth(1)).toContainText(
    /Whichever is higher for the school: school need or district context\s*40%/
  );

  // A rule with urgency draws it as one of its parts, named as the rest of the tool names it.
  const urgency = await openMethod(page, "additive_u");
  await expect(urgency).toContainText(/Urgency rating \(source unknown\)\s*5%/);

  // A need-first rule gets its one line and no tree.
  const needFirst = await openMethod(page, "need_first_no_u");
  await expect(needFirst).toContainText(
    "Schools go in order of school need, and other factors, without urgency, only break exact ties."
  );
  await expect(needFirst.getByRole("list")).toHaveCount(0);
});

/** Fails unless nothing in `figure` can be operated, focused, dragged or hovered for more, and nothing in it moves. */
async function expectStill(figure: Locator, where: string) {
  await expect(figure, where).toBeVisible();
  const controls = figure.locator(
    "input, select, textarea, button, a[href], [tabindex], [contenteditable], [draggable=true], [title], [role=slider], [role=spinbutton], [role=scrollbar]"
  );
  await expect(controls, where).toHaveCount(0);
  const still = await figure.evaluate((root) => {
    const all = [root, ...Array.from(root.querySelectorAll("*"))] as HTMLElement[];
    const style = (el: Element) => getComputedStyle(el);
    return {
      draggable: all.filter((el) => el.draggable).length,
      moving: root.getAnimations({ subtree: true }).length,
      transitions: all.filter((el) =>
        style(el)
          .transitionDuration.split(",")
          .some((d) => d.trim() !== "0s")
      ).length,
      pointers: all.filter((el) => !["auto", "default"].includes(style(el).cursor)).length,
    };
  });
  expect(still, where).toEqual({ draggable: 0, moving: 0, transitions: 0, pointers: 0 });
  // Pointing at a bar shows nothing more.
  const before = await figure.innerText();
  await figure.locator('[aria-hidden="true"]').first().hover();
  expect(await figure.innerText(), where).toBe(before);
}

test("nothing in the diagram can be moved, typed in, focused or hovered for more, and nothing in it moves", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expectStill(diagram(howSection(await openHow(page))), "How this works");
  await expectStill(await openMethod(page, "bottleneck_no_u"), "the method details");
});

test("the nested list says what the bars draw", async ({ page }) => {
  for (const [where, open] of [
    ["How this works, the main method", async () => diagram(howSection(await openHow(page)))],
    ["the method details, a largest-factor rule", () => openMethod(page, "bottleneck_no_u")],
  ] as const) {
    const figure = await open();
    await expect(figure).toBeVisible();
    // A screen reader meets a list whose items hold lists: school need's five parts sit inside its item.
    const need = figure.getByRole("listitem").filter({ hasText: /^School need/ });
    await expect(need.getByRole("list").getByRole("listitem"), where).toHaveCount(5);
    const { items, whole } = await drawing(figure);
    expectBarsMatchWords(items, where);
    // The last row is the whole score: every top bar end to end is as long as it, and it fills the scale.
    expect(whole.words, where).toMatch(/^The whole score 100%$/);
    expect(Math.abs(whole.bar - whole.scale), where).toBeLessThanOrEqual(0.5);
    const top = items.reduce((total, item) => total + item.bar, 0);
    expect(Math.abs(top - whole.bar), where).toBeLessThanOrEqual(1);
  }
});

test("on a 360 px phone the diagram fits without sideways scrolling, every word whole, at AA contrast", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openWorkspace(page, "?page=how");
  const figure = diagram(howSection(page));
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toBeVisible();
  const fit = await figure.evaluate((root) => {
    const page = root.closest("main")!;
    const words = Array.from(root.querySelectorAll("figcaption *, li span, p, [data-row=whole] span")).filter(
      (el) => el.childElementCount === 0 && el.textContent
    );
    return {
      pageScrolls: page.scrollWidth > page.clientWidth || document.documentElement.scrollWidth > innerWidth,
      figureScrolls: root.scrollWidth > root.clientWidth,
      clipped: words.filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent),
      outside: words
        .filter((el) => {
          const box = el.getBoundingClientRect();
          return box.left < 0 || box.right > innerWidth;
        })
        .map((el) => el.textContent),
    };
  });
  expect(fit).toEqual({ pageScrolls: false, figureScrolls: false, clipped: [], outside: [] });

  // Every word at 4.5:1 on the surface under it, every bar at 3:1.
  const contrast = await figure.evaluate((root) => {
    const rgb = (value: string) =>
      value
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
    const luminance = (value: string) => {
      const [r, g, b] = rgb(value).map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const surface = (el: Element): string => {
      for (let at: Element | null = el; at; at = at.parentElement) {
        const color = getComputedStyle(at).backgroundColor;
        if (!/rgba\(.*,\s*0\)$/.test(color) && color !== "transparent") return color;
      }
      return "rgb(255, 255, 255)";
    };
    const words = Array.from(root.querySelectorAll("*")).filter(
      (el) => el.childElementCount === 0 && el.textContent?.trim()
    );
    const bars = Array.from(root.querySelectorAll('[aria-hidden="true"] *')).filter(
      (el) => el.childElementCount === 0
    );
    return {
      words: Math.min(...words.map((el) => ratio(getComputedStyle(el).color, surface(el)))),
      bars: Math.min(
        ...bars.map((el) =>
          ratio(getComputedStyle(el).backgroundColor, surface(el.parentElement!.parentElement!))
        )
      ),
    };
  });
  expect(contrast.words).toBeGreaterThanOrEqual(4.5);
  expect(contrast.bars).toBeGreaterThanOrEqual(3);
});
