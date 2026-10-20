/** Shared by the /screening browser tests: the fixtures, a `test` that fails on any console problem, and helpers. */
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test as base, type Page } from "@playwright/test";

import { isSoftwareGlNote } from "./console-noise";

const FIXTURES = path.resolve(__dirname, "fixtures/screening");
const fixture = (file: string) => JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));

interface Row {
  cohort: string;
  school: { source_school_name: string; school_key: string };
}
export const rowsOf = (rule: string): Row[] => fixture(`results/${rule}.json`).rows;
export const orderedNames = (rule: string) =>
  rowsOf(rule)
    .filter((r) => r.cohort !== "verification_queue")
    .map((r) => r.school.source_school_name);
export const queuedNames = (rule: string) =>
  rowsOf(rule)
    .filter((r) => r.cohort === "verification_queue")
    .map((r) => r.school.source_school_name);
export const keyOf = (rule: string, name: string) =>
  rowsOf(rule).find((r) => r.school.source_school_name === name)!.school.school_key;
export const ORDERED_COUNT = orderedNames("additive_u").length;

/**
 * Every test fails on console errors and warnings, page errors, failed requests and HTTP errors, except the one
 * browser driver note that console-noise.ts describes. A test that provokes some on purpose empties `problems`
 * after asserting what it expects.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        const entry = { type: message.type(), text: message.text() };
        if (["error", "warning"].includes(entry.type) && !isSoftwareGlNote(entry))
          problems.push(`${entry.type}: ${entry.text}`);
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
export { expect };

export const mapLocator = (page: Page) => page.locator("[data-testid=screening-map]");

export async function waitForMap(page: Page) {
  await expect(page.locator("[data-testid=screening-map][data-map-ready=true]")).toHaveCount(1, {
    timeout: 25_000,
  });
}

export async function openWorkspace(page: Page) {
  await page.goto("/screening");
  await expect(page.getByRole("heading", { name: "School screening", level: 1 })).toBeVisible();
  await waitForMap(page);
  await expect(page.locator("ol[aria-label='Ordered list'] button")).toHaveCount(ORDERED_COUNT);
}

export const orderedRow = (page: Page, name: string) =>
  page.locator("ol[aria-label='Ordered list'] button", { hasText: name });
export const queuedRow = (page: Page, name: string) =>
  page.locator("ol[aria-label='Incomplete records'] button", { hasText: name });
export const listNames = (page: Page) =>
  page.locator("ol[aria-label='Ordered list'] button span[class*=name]").allTextContents();

export const markAt = (page: Page, key: string) =>
  page.evaluate((k) => window.__screeningMapTest?.project(k as never) ?? null, key);

/** A mark's position once the map has stopped moving (a selection can pan it). */
export async function settledMark(page: Page, key: string) {
  const map = mapLocator(page);
  let previous = await markAt(page, key);
  let steady = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await markAt(page, key);
    const still = current && previous && current.x === previous.x && current.y === previous.y;
    const idle = (await map.getAttribute("data-map-moving")) === "false";
    steady = still && idle ? steady + 1 : 0;
    if (steady >= 4 && current) return current;
    previous = current;
  }
  throw new Error(`The mark of ${key} never settled`);
}

/** Whether the dark selection ring is drawn round the mark: samples the rendered pixels at the ring's radius. */
export async function ringDrawnAround(page: Page, key: string, markRadius: number): Promise<boolean> {
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
      // On each of 16 rays, a dark pixel within a pixel of the ring's radius counts: the ring is 2 px wide
      // and anti-aliased, so one exact sample position would miss it on the diagonals.
      let dark = 0;
      for (let step = 0; step < 16; step += 1) {
        const angle = (step / 16) * Math.PI * 2;
        let hit = false;
        for (const offset of [-1, -0.5, 0, 0.5, 1]) {
          const x = Math.round(size / 2 + Math.cos(angle) * (radius + offset));
          const y = Math.round(size / 2 + Math.sin(angle) * (radius + offset));
          const [r, g, b] = context.getImageData(x, y, 1, 1).data;
          if (r < 110 && g < 110 && b < 110) hit = true;
        }
        if (hit) dark += 1;
      }
      return dark >= 14;
    },
    { png, radius: markRadius + 4.5, size }
  );
}
