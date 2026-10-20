/** Shared by the /screening browser tests: the fixtures, a `test` that fails on any console problem, and helpers. */
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";

import { isSoftwareGlNote } from "./console-noise";

const FIXTURES = path.resolve(__dirname, "fixtures/screening");
const fixture = (file: string) => JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));

interface Row {
  cohort: string;
  point_rank?: { rank: number };
  school: {
    source_school_name: string;
    school_key: string;
    latitude: number | null;
    longitude: number | null;
  };
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
/** The dots that carry their place as a number on the map: the first ten complete schools that have coordinates. */
export const numberedPlaces = (rule: string) =>
  rowsOf(rule)
    .filter((r) => r.cohort === "complete" && r.point_rank!.rank <= 10 && r.school.latitude !== null)
    .map((r) => ({ key: r.school.school_key, rank: r.point_rank!.rank }));

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

/** The lists' accessible names, as the copy system words the tabs. */
export const ORDERED = "ol[aria-label='The list']";
export const INCOMPLETE = "ol[aria-label='Incomplete records']";
export const RULE = {
  main: "Combined factors, with urgency",
  proposed: "Combined factors, without urgency",
  needFirst: "Need-first rule, with urgency",
};

export async function openWorkspace(page: Page, search = "") {
  await page.goto(`/screening${search}`);
  await expect(page.getByRole("heading", { name: "RISE-PNG", level: 1 })).toBeVisible();
  await waitForMap(page);
  if (!search) await expect(page.locator(`${ORDERED} button`)).toHaveCount(ORDERED_COUNT);
}

export const orderedRow = (page: Page, name: string) => page.locator(`${ORDERED} button`, { hasText: name });
export const queuedRow = (page: Page, name: string) =>
  page.locator(`${INCOMPLETE} button`, { hasText: name });
export const listNames = (page: Page) =>
  page.locator(`${ORDERED} button span[class*=name]`).allTextContents();
/** One of the two main rules in the switch. */
export const mainRule = (page: Page, label: string) =>
  page.getByRole("group", { name: "The two main rules" }).getByRole("button", { name: label });
export const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name });

/**
 * The saved fixtures hold the recorded comparison of the two main rules only. Choosing any other rule asks for its
 * comparison with the previous one, which the mock API answers with 501 until the fixtures capture every pair.
 * A test that chooses another rule calls this at its end; it removes those answers and nothing else.
 */
export function allowUncapturedComparisons(problems: string[]) {
  const answers = problems.filter((p) => /^501: .*\/api\/v1\/screening\/compare\?/.test(p)).length;
  let notes = answers;
  const kept = problems.filter((p) => {
    if (/^501: .*\/api\/v1\/screening\/compare\?/.test(p)) return false;
    // The browser's own console line for each of those answers, which carries no address.
    if (
      notes > 0 &&
      p.startsWith("error: Failed to load resource: the server responded with a status of 501")
    ) {
      notes -= 1;
      return false;
    }
    return true;
  });
  problems.splice(0, problems.length, ...kept);
}

export const markAt = (page: Page, key: string) =>
  page.evaluate((k) => window.__screeningMapTest?.project(k as never) ?? null, key);

/**
 * A mark's position once the map has stopped moving (a selection can pan it). A mark that settles outside the
 * map cannot be pointed at, so that is an error here and not a mouse move into nothing.
 */
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
    if (steady >= 4 && current) {
      const box = (await map.boundingBox())!;
      const inside =
        current.x >= box.x &&
        current.x <= box.x + box.width &&
        current.y >= box.y &&
        current.y <= box.y + box.height;
      if (!inside) {
        throw new Error(
          `The mark of ${key} settled at (${Math.round(current.x)}, ${Math.round(current.y)}), outside the map`
        );
      }
      return current;
    }
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

/** Where the app and the mock API listen. The launcher and the Playwright config read the same variables. */
export const APP_ORIGIN = `http://127.0.0.1:${process.env.CI_APP_PORT ?? "3105"}`;
export const MOCK_ORIGIN = `http://127.0.0.1:${process.env.CI_MOCK_API_PORT ?? "4100"}`;

/** The datasets the mock API can serve; see scripts/mock-api.mjs. The default one is what a test gets unasked. */
export type MockDataset = "default" | "worst-names" | "ties-and-ranges" | "one" | "empty";

/**
 * Makes the mock API answer this browser context's screening requests from `dataset`, and answer the routes named in
 * `fail` with the status given (for example `{ results: 503 }`). The choice rides on cookies of the context, so tests
 * that run in parallel never see each other's. Call it before the page loads.
 */
export async function useMockDataset(
  context: BrowserContext,
  dataset: MockDataset,
  fail: Partial<Record<"rules" | "results" | "inputs" | "schools" | "compare", number>> = {}
) {
  const failures = Object.entries(fail)
    .map(([route, status]) => `${route}:${status}`)
    .join("|");
  const url = APP_ORIGIN;
  await context.addCookies([
    { name: "mock-screening-dataset", value: dataset, url },
    ...(failures ? [{ name: "mock-screening-fail", value: encodeURIComponent(failures), url }] : []),
  ]);
}
