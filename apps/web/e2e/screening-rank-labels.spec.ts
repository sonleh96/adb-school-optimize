/**
 * The place numbers on a crowded map. The real list's first ten crowd into the highlands, and on a phone the numbers
 * for 6th and 10th, and for 7th and 9th, were drawn over each other. The `crowded` dataset puts its first ten in one
 * valley, 0.3 degrees apart, which a phone's map draws closer together than a number is wide.
 * Failure modes and the test for each:
 *  1. Two numbers overlap, so neither can be read                              -> "...no two numbers overlap..."
 *  2. A number is dropped to make room, so a top-ten school has no number     -> the count of ten in the same test
 *  3. A number moved off its dot sits on another numbered dot, so it reads as that school's place,
 *     or so far from its own dot that it reads as nobody's                    -> "...each number is on or beside its own dot"
 *  4. The rule only runs once: zooming out brings the overlap back            -> the same tests, after one zoom step out
 *  5. A number that collides with nothing moves anyway                        -> "the first place keeps its dot"
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import { expect, mapLocator, test, useMockDataset, waitForMap } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

interface Row {
  cohort: string;
  point_rank?: { rank: number };
  school: { school_key: string };
}
const CROWDED: Row[] = JSON.parse(
  readFileSync(path.resolve(__dirname, "fixtures/screening/crowded/results/additive_no_u.json"), "utf8")
).rows;
const FIRST_TEN = CROWDED.filter((r) => r.cohort === "complete" && r.point_rank!.rank <= 10).map((r) => ({
  rank: r.point_rank!.rank,
  key: r.school.school_key,
}));

/** A number's disc: the 16 px circle the map's darkest dot gives a number, centred where the number is drawn. */
const DISC = 16;

interface Placed {
  rank: number;
  x: number;
  y: number;
  dot: { x: number; y: number };
}

/** Where each number is drawn and where its own dot is, once the map has stopped moving. */
async function placed(page: Page): Promise<Placed[]> {
  await expect(mapLocator(page)).toHaveAttribute("data-map-moving", "false");
  // The numbers are laid out after the move ends; give that one frame.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return page.evaluate((first) => {
    return first.map(({ rank, key }) => {
      const label = document.querySelector(`[data-rank-label='${rank}']`);
      if (!label) throw new Error(`no number for place ${rank}`);
      const r = label.getBoundingClientRect();
      const dot = window.__screeningMapTest!.project(key as never)!;
      return { rank, x: r.left + r.width / 2, y: r.top + r.height / 2, dot };
    });
  }, FIRST_TEN);
}

const discsMeet = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < DISC - 0.5 && Math.abs(a.y - b.y) < DISC - 0.5;

async function expectReadable(page: Page) {
  const labels = await placed(page);
  expect(labels).toHaveLength(10);
  const overlapping: string[] = [];
  for (let i = 0; i < labels.length; i += 1)
    for (let j = i + 1; j < labels.length; j += 1)
      if (discsMeet(labels[i], labels[j])) overlapping.push(`${labels[i].rank} and ${labels[j].rank}`);
  expect(overlapping, "numbers drawn over each other").toEqual([]);

  const box = (await mapLocator(page).boundingBox())!;
  for (const label of labels) {
    // Inside the map, so it can be read.
    expect(label.x - DISC / 2).toBeGreaterThanOrEqual(box.x - 0.5);
    expect(label.x + DISC / 2).toBeLessThanOrEqual(box.x + box.width + 0.5);
    expect(label.y - DISC / 2).toBeGreaterThanOrEqual(box.y - 0.5);
    // Near its own dot: on it, or beside it with a leader no longer than a number is wide.
    expect(Math.hypot(label.x - label.dot.x, label.y - label.dot.y), `place ${label.rank}`).toBeLessThan(
      3 * DISC
    );
    // Not on another numbered dot, where it would read as that school's place.
    for (const other of labels)
      if (other !== label && Math.hypot(label.x - other.dot.x, label.y - other.dot.y) < DISC / 2)
        throw new Error(`place ${label.rank}'s number sits on place ${other.rank}'s dot`);
  }
  return labels;
}

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
]) {
  test.describe(`at ${size.width} by ${size.height}, with the first ten crowded into one valley`, () => {
    test.use({ viewport: size, deviceScaleFactor: 2 });

    test("no two numbers overlap, all ten show, and each number is on or beside its own dot", async ({
      page,
      context,
    }) => {
      await useMockDataset(context, "crowded");
      await page.goto("/screening");
      await waitForMap(page);
      await page.locator("[data-region=pane-switch]").getByRole("button", { name: "Map", exact: true }).click();
      await expect(page.locator("[data-testid=screening-map][data-map-ready=true]")).toBeVisible();
      await expect(page.locator("[data-rank-label]")).toHaveCount(10);

      const labels = await expectReadable(page);
      // The first place collides with nothing earlier, so it keeps its own dot.
      const first = labels.find((l) => l.rank === 1)!;
      expect(Math.hypot(first.x - first.dot.x, first.y - first.dot.y)).toBeLessThan(1.5);

      // One step out crowds them further; the rule runs again.
      await page.getByRole("button", { name: "Zoom out" }).click();
      await expectReadable(page);
    });
  });
}
