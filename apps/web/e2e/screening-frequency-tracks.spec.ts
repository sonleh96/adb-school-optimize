/**
 * The drawing of a school's top-20 frequency in each setting of a persistence test, in the method card.
 * Failure modes and the test for each:
 *  1. The tracks show on the plain card, or under one of the five rules the test was not run for
 *                                                   -> "shows only in the method details, and only under S0 and S"
 *  2. The words a screen reader hears name another share, or another side of the line, than the marks show as laid
 *     out on the page                               -> "the words of each track say what its mark shows"
 *  3. On a 360 px phone a track, a mark or a value's words leave the card, or the words overlap
 *                                                   -> "fits a 360 px phone ..."
 */
import type { Locator, Page } from "@playwright/test";

import { MAIN_RULE, URGENCY_RULE, expect, keyOf, test, waitForMap } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const card = (page: Page) => page.locator("[data-slot=school-card]");
const figures = (page: Page) =>
  card(page).getByRole("figure", { name: /^How often it stayed in the top 20/ });
const OTHER_RULES = ["need_first_u", "need_first_no_u", "bottleneck_u", "bottleneck_no_u", "benchmark"];

async function openCard(page: Page, rule: string, name: string, method = true) {
  await page.goto(`/screening?${method ? "analyst=1&" : ""}rule=${rule}&school=${keyOf(rule, name)}`);
  await waitForMap(page);
  await expect(
    card(page).locator("[data-region=inspector-place], [data-region=card-place]").first()
  ).toBeVisible();
}

interface Track {
  words: string;
  /** The centre of the mark and of the line, and the ends of the track, in pixels. */
  mark: number;
  line: number;
  left: number;
  right: number;
}

async function tracksOf(figure: Locator): Promise<Track[]> {
  return figure.locator("li").evaluateAll((items) =>
    items.map((li) => {
      const box = (selector: string) => li.querySelector(selector)!.getBoundingClientRect();
      const centre = (r: DOMRect) => r.left + r.width / 2;
      const track = li.querySelector("[data-part=mark]")!.parentElement!.getBoundingClientRect();
      return {
        words: (li as HTMLElement).innerText.replace(/\s+/g, " ").replace(/ ,/g, ",").trim(),
        mark: centre(box("[data-part=mark]")),
        line: centre(box("[data-part=line]")),
        left: track.left,
        right: track.right,
      };
    })
  );
}

test("shows only in the method details, and only under S0 and S", async ({ page }) => {
  // Sample School 03 is in both tests.
  const name = "Sample School 03";
  for (const rule of [MAIN_RULE, URGENCY_RULE]) {
    await openCard(page, rule, name, false);
    await expect(card(page)).toBeVisible();
    await expect(card(page).locator("[data-region=frequency-tracks]")).toHaveCount(0);

    await openCard(page, rule, name);
    await expect(figures(page)).toHaveCount(1);
    await expect(figures(page).locator("li")).toHaveCount(3);
  }
  for (const rule of OTHER_RULES) {
    await openCard(page, rule, name);
    await expect(
      card(page).locator("[data-region=inspector-breakdown], [data-region=inspector-why]").first()
    ).toBeVisible();
    await expect(card(page).locator("[data-region=frequency-tracks]"), rule).toHaveCount(0);
  }
});

test("the words of each track say what its mark shows", async ({ page }) => {
  // Flagged and not, inside the band on either side of the line, exactly on it, and 0.7999, which rounds to 80% whole.
  const cases: [string, string][] = [
    [MAIN_RULE, "Sample School 03"],
    [MAIN_RULE, "Sample School 06"],
    [MAIN_RULE, "Sample School 17"],
    [URGENCY_RULE, "Sample School 02"],
    [URGENCY_RULE, "Sample School 03"],
  ];
  const seen = new Set<string>();
  for (const [rule, name] of cases) {
    await openCard(page, rule, name);
    const tracks = await tracksOf(figures(page));
    expect(tracks).toHaveLength(3);
    for (const t of tracks) {
      const where = `${rule} ${name}: ${t.words}`;
      const stated = /(\d+(?:\.\d+)?)% of runs, (reaches|below) the 80% line$/.exec(t.words);
      expect(stated, where).not.toBeNull();
      const share = Number(stated![1]) / 100;
      const reaches = stated![2] === "reaches";
      seen.add(stated![2]);
      // The mark is where the words put it, to within half a pixel and the words' own rounding.
      const width = t.right - t.left;
      const digits = stated![1].split(".")[1]?.length ?? 0;
      expect(Math.abs((t.mark - t.left) / width - share), where).toBeLessThanOrEqual(
        0.5 * 10 ** -(digits + 2) + 0.5 / width
      );
      // The words and the drawing put the mark on the same side of the line.
      if (reaches) expect(t.mark, where).toBeGreaterThanOrEqual(t.line - 0.5);
      else expect(t.mark, where).toBeLessThan(t.line);
    }
  }
  expect([...seen].sort()).toEqual(["below", "reaches"]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("fits a 360 px phone with every mark and word inside the card, and no words on top of each other", async ({
    page,
  }) => {
    await openCard(page, MAIN_RULE, "Sample School 06");
    const figure = figures(page);
    await figure.scrollIntoViewIfNeeded();
    const fits = await figure.evaluate((root) => {
      const cardBox = root.closest("[data-slot=school-card]")!.getBoundingClientRect();
      const parts = [...root.querySelectorAll("li *, [aria-hidden] > span")].map((el) =>
        el.getBoundingClientRect()
      );
      const inside = parts.every(
        (r) => r.width === 0 || (r.left >= cardBox.left - 0.5 && r.right <= cardBox.right + 0.5)
      );
      // The axis's words, side by side.
      const axis = [...root.querySelectorAll(":scope > [aria-hidden] > span")].map((el) =>
        el.getBoundingClientRect()
      );
      const apart = axis.every((r, i) => i === 0 || r.left >= axis[i - 1].right);
      return { inside, apart, scroll: document.documentElement.scrollWidth <= window.innerWidth };
    });
    expect(fits).toEqual({ inside: true, apart: true, scroll: true });
  });
});
