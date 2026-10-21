/**
 * What the map frames and keeps in view. Failure modes and the test for each:
 *  1. A numbered mark, or the selected school's mark, sits under the key or the caveat, because the map keeps less
 *     room at its foot than they take                                   -> "no numbered or selected mark..."
 *  2. A map the user has panned snaps back to the selection when nothing about the selection changed
 *     -> "a panned map stays where the user left it"
 *  3. A second pick made while the map is still panning to the first is framed from its mid-pan position and lands
 *     out of view                                                        -> "a second pick made mid-pan..."
 *  4. With a list of over 700 schools the dots stop drawing, the key's bands do not come from the data, or the
 *     console reports a problem (R12)                                    -> "a list of over 700 schools..."
 *  5. The place numbers paint over the column when the map moves them beneath it -> "the column covers a place number..."
 */
import type { Page, Route } from "@playwright/test";

import {
  ORDERED,
  expect,
  keyOf,
  markAt,
  numberedPlaces,
  orderedRow,
  rowsOf,
  settledMark,
  test,
  waitForMap,
} from "./screening-helpers";

test.describe.configure({ timeout: 90_000 });

/** A mark's largest radius plus its ring, so a mark that only touches the key counts as under it. */
const MARK_REACH = 10;

/** The marks of `keys` that sit under the key or the caveat, with what covers them. */
async function coveredMarks(page: Page, keys: readonly string[]) {
  return page.evaluate(
    ({ keys, reach }) => {
      const covers = ["[data-slot=legend]", "[data-region=caveat]"]
        .map((selector) => document.querySelector(selector))
        .filter((el): el is Element => el !== null)
        .map((el) => ({ name: el.getAttribute("data-slot") ?? "caveat", box: el.getBoundingClientRect() }));
      return keys.flatMap((key) => {
        const point = window.__screeningMapTest?.project(key as never);
        if (!point) return [];
        return covers
          .filter(
            ({ box }) =>
              point.x + reach > box.left &&
              point.x - reach < box.right &&
              point.y + reach > box.top &&
              point.y - reach < box.bottom
          )
          .map(({ name }) => `${key} under the ${name}`);
      });
    },
    { keys: [...keys], reach: MARK_REACH }
  );
}

/** Waits until the map and every panel have stopped moving. */
async function settled(page: Page) {
  await expect(page.getByTestId("screening-map")).toHaveAttribute("data-map-moving", "false");
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.waitForTimeout(150);
  await expect(page.getByTestId("screening-map")).toHaveAttribute("data-map-moving", "false");
}

const FIRST = rowsOf("additive_u").find((r) => r.point_rank?.rank === 1)!.school;

for (const size of [
  { width: 1600, height: 1000 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test.describe(`at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size });

    test(`no numbered or selected mark sits under the key or the caveat at ${size.width} by ${size.height}`, async ({
      page,
    }) => {
      await page.goto("/screening");
      await waitForMap(page);
      await settled(page);
      const numbered = numberedPlaces("additive_u").map((p) => p.key);
      expect(await coveredMarks(page, numbered)).toEqual([]);

      // The selected school is brought clear of the key too, once its card is open and the key has settled.
      await orderedRow(page, FIRST.source_school_name).click();
      await settledMark(page, FIRST.school_key);
      await settled(page);
      expect(await coveredMarks(page, [FIRST.school_key])).toEqual([]);
    });
  });
}

test.describe("at 1600 by 1000", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("a panned map stays where the user left it when a key is pressed", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    const key = keyOf("additive_u", "Sample School 08");
    await orderedRow(page, "Sample School 08").click();
    await settledMark(page, key);
    await settled(page);

    // Drag the map, inside its clear part, so the selected mark goes under the column.
    const start = (await markAt(page, key))!;
    await page.mouse.move(1150, 400);
    await page.mouse.down();
    await page.mouse.move(650, 400, { steps: 12 });
    await page.mouse.up();
    await settled(page);
    const dragged = (await markAt(page, key))!;
    expect(start.x - dragged.x).toBeGreaterThan(300);

    // A key press elsewhere on the page changes nothing about the selection, so the map stays put.
    await page.locator("canvas.maplibregl-canvas").focus();
    await page.keyboard.press("x");
    await page.waitForTimeout(500);
    await settled(page);
    const after = (await markAt(page, key))!;
    expect(Math.abs(after.x - dragged.x)).toBeLessThan(1);
    expect(Math.abs(after.y - dragged.y)).toBeLessThan(1);
  });

  test("a second pick made mid-pan is framed where its mark will settle, in the clear part of the map", async ({
    page,
  }) => {
    await page.goto("/screening");
    await waitForMap(page);
    for (let step = 0; step < 3; step += 1) {
      await page.getByRole("button", { name: "Zoom in" }).click();
      await page.waitForTimeout(400);
    }
    await settled(page);
    // Two schools whose marks are off the clear part of the map, far apart.
    const away = [];
    for (const row of rowsOf("additive_u").filter((r) => r.cohort !== "verification_queue")) {
      const point = await markAt(page, row.school.school_key);
      if (point && (point.x < 480 || point.x > 1550 || point.y < 100 || point.y > 940))
        away.push({ row, point });
    }
    expect(away.length).toBeGreaterThanOrEqual(2);
    const first = away[0];
    const second = away.reduce((far, item) =>
      Math.hypot(item.point.x - first.point.x, item.point.y - first.point.y) >
      Math.hypot(far.point.x - first.point.x, far.point.y - first.point.y)
        ? item
        : far
    );

    await page.locator(`${ORDERED} button`, { hasText: first.row.school.source_school_name }).first().click();
    await expect(page.getByTestId("screening-map")).toHaveAttribute("data-map-moving", "true");
    await page
      .locator(`${ORDERED} button`, { hasText: second.row.school.source_school_name })
      .first()
      .click();

    const point = await settledMark(page, second.row.school.school_key);
    await settled(page);
    const clear = await page.evaluate(() => {
      const column = document.querySelector("section[class*=column]")!.getBoundingClientRect();
      const card = document.querySelector("[data-slot=school-card]")!.getBoundingClientRect();
      const key = document.querySelector("[data-slot=legend]")!.getBoundingClientRect();
      return { left: column.right, right: card.left, top: 0, bottom: key.top };
    });
    expect(point.x).toBeGreaterThan(clear.left);
    expect(point.x).toBeLessThan(clear.right);
    expect(point.y).toBeGreaterThan(clear.top);
    expect(point.y).toBeLessThan(clear.bottom);
  });
});

/* ---------- the place numbers stay under the panels ---------- */

test.describe("at 1600 by 1000, the numbers and the column", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("the column covers a place number the map has moved beneath it", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    await settled(page);
    const label = page.locator("[data-rank-label='1']");
    // The numbers ignore the pointer, and hit testing skips what ignores it. For the check only, they take it, so the
    // point at a number's centre names whatever is painted on top there.
    const topAt = (locator: typeof label) =>
      locator.evaluate((el) => {
        const marker = el.closest<HTMLElement>(".maplibregl-marker")!;
        el.style.pointerEvents = marker.style.pointerEvents = "auto";
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        el.style.pointerEvents = marker.style.pointerEvents = "";
        if (!hit) return "nothing";
        if (hit.closest(".maplibregl-marker") === marker) return "the number";
        return hit.closest("section[data-slot=column]") ? "the column" : hit.outerHTML.slice(0, 80);
      });
    // On the first view the number is in the clear part of the map, so the check can see a number.
    expect(await topAt(label)).toBe("the number");

    // Drag the map, a stroke at a time inside its clear part (a drag let go over the column never ends), until the
    // number sits in the middle of the column.
    const column = (await page.locator("section[data-slot=column]").boundingBox())!;
    const target = { x: column.x + column.width / 2, y: column.y + column.height / 2 };
    const clearLeft = column.x + column.width + 40;
    for (let stroke = 0; stroke < 6; stroke += 1) {
      const at = (await label.boundingBox())!;
      const dx = target.x - (at.x + at.width / 2);
      const dy = target.y - (at.y + at.height / 2);
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) break;
      const from = { x: 1150, y: 500 };
      const step = { x: Math.max(dx, clearLeft - from.x, -500), y: Math.max(-200, Math.min(200, dy)) };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + step.x, from.y + step.y, { steps: 12 });
      await page.mouse.up();
      await settled(page);
    }
    const moved = (await label.boundingBox())!;
    expect(moved.x).toBeGreaterThan(column.x + 40);
    expect(moved.x + moved.width).toBeLessThan(column.x + column.width - 40);
    expect(await topAt(label)).toBe("the column");
  });
});

/* ---------- a list of over 700 schools, made at test time from the default fixtures ---------- */

const COPIES = 29;

interface Rank {
  rank?: number | null;
  best?: number | null;
  worst?: number | null;
  count?: number;
  scope?: string;
}

/** Scope words carry the count in brackets ("eligible (21)"); the copies multiply it. */
const scaled = (text: string) => text.replace(/\((\d+)\)/g, (_, n: string) => `(${Number(n) * COPIES})`);
const copyKey = (key: string, copy: number) =>
  copy === 0 ? key : `${key.slice(0, 26)}${copy.toString(16).padStart(6, "0")}`;
const copyName = (name: string, copy: number) => (copy === 0 ? name : `${name} copy ${copy}`);
/** A place among copies: each original place becomes a run of COPIES places, in the original order. */
const copyPlace = (place: number, copy: number) => (place - 1) * COPIES + copy + 1;

function scaleRank(rank: Rank | null | undefined, copy: number): Rank | null | undefined {
  if (!rank) return rank;
  const out: Rank = { ...rank };
  if (typeof rank.rank === "number") out.rank = copyPlace(rank.rank, copy);
  if (typeof rank.best === "number") out.best = copyPlace(rank.best, copy);
  if (typeof rank.worst === "number") out.worst = copyPlace(rank.worst, copy);
  if (typeof rank.count === "number") out.count = rank.count * COPIES;
  if (typeof rank.scope === "string") out.scope = scaled(rank.scope);
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the API's JSON, copied field by field; the page parses it. */
function manyResults(body: any) {
  const rows: any[] = [];
  for (const row of body.rows) {
    for (let copy = 0; copy < COPIES; copy += 1) {
      const school = row.school;
      const nudge = (value: unknown) => (typeof value === "number" ? value - copy * 1e-7 : value);
      rows.push({
        ...row,
        display_order: rows.length + 1,
        point_rank: scaleRank(row.point_rank, copy),
        rank_bounds: scaleRank(row.rank_bounds, copy),
        scores: Object.fromEntries(Object.entries(row.scores ?? {}).map(([k, v]) => [k, nudge(v)])),
        school: {
          ...school,
          school_key: copyKey(school.school_key, copy),
          school_id:
            school.school_id === null
              ? null
              : `${school.school_id.slice(0, 24)}${copy.toString(16).padStart(12, "0")}`,
          source_school_name: copyName(school.source_school_name, copy),
          latitude: school.latitude === null ? null : school.latitude + (copy % 6) * 0.06,
          longitude: school.longitude === null ? null : school.longitude + Math.floor(copy / 6) * 0.06,
        },
      });
    }
  }
  const manifest = { ...body.manifest };
  for (const [key, value] of Object.entries(manifest)) {
    if (typeof value === "string" && /_scope$/.test(key)) manifest[key] = scaled(value);
    if (typeof value === "number" && /_count$/.test(key)) manifest[key] = value * COPIES;
  }
  manifest.cohort_counts = Object.fromEntries(
    Object.entries(body.manifest.cohort_counts).map(([k, v]) => [k, (v as number) * COPIES])
  );
  return {
    ...body,
    manifest,
    rows,
    total_schools: body.total_schools * COPIES,
    returned_schools: body.returned_schools * COPIES,
  };
}

function manyInputs(body: any) {
  const schools = body.schools.flatMap((school: any) =>
    Array.from({ length: COPIES }, (_, copy) => ({
      ...school,
      school_key: copyKey(school.school_key, copy),
      source_school_name: copyName(school.source_school_name, copy),
      inputs: { ...school.inputs, school_name: copyName(school.inputs.school_name, copy) },
    }))
  );
  return { ...body, schools };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function multiply(route: Route, make: (body: unknown) => unknown) {
  const response = await route.fetch();
  await route.fulfill({ response, json: make(await response.json()) });
}

test.describe("a list of over 700 schools", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("a list of over 700 schools draws a dot of every band, takes the key's bands from the data, and keeps the console clean", async ({
    page,
  }) => {
    await page.route(/\/api\/v1\/screening\/results\?/, (route) => multiply(route, manyResults));
    await page.route(/\/api\/v1\/screening\/inputs$/, (route) => multiply(route, manyInputs));
    await page.goto("/screening");
    await waitForMap(page);

    const original = rowsOf("additive_u");
    const ordered = original.filter((r) => r.cohort !== "verification_queue").length * COPIES;
    const single = original.filter((r) => r.cohort === "complete").length * COPIES;
    expect(original.length * COPIES).toBeGreaterThanOrEqual(700);
    await expect(page.locator(`${ORDERED} > li > button`)).toHaveCount(ordered);
    await expect(page.getByRole("tab", { name: /The list/ })).toHaveText(`The list(${ordered})`);

    // Bands from the data: 10, 20, then about a third and two thirds of the schools with one place, then the last.
    const ramp = page.locator("[data-slot=legend] ol li span");
    await expect(ramp).toHaveCount(5);
    const labels = await ramp.allTextContents();
    expect(labels.slice(0, 2)).toEqual(["1st to 10th", "11th to 20th"]);
    expect(labels[4]).toMatch(new RegExp(` to ${single}th$`));

    // Every band's colour is drawn on the map, above the key (whose own swatches carry the same colours).
    await settled(page);
    const swatches = await page
      .locator("[data-slot=legend] ol li i")
      .evaluateAll((items) => items.map((item) => getComputedStyle(item).backgroundColor));
    const area = await page.evaluate(() => {
      const column = document.querySelector("section[class*=column]")!.getBoundingClientRect();
      const key = document.querySelector("[data-slot=legend]")!.getBoundingClientRect();
      return {
        x: Math.ceil(column.right) + 4,
        y: 0,
        width: 1600 - Math.ceil(column.right) - 70,
        height: key.top - 4,
      };
    });
    const png = (await page.screenshot({ clip: area })).toString("base64");
    const drawn = await page.evaluate(
      async ({ png, swatches, area }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = area.width;
        canvas.height = area.height;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, area.width, area.height);
        const colours = swatches.map((s) => s.match(/\d+/g)!.slice(0, 3).map(Number));
        const counts = colours.map(() => 0);
        for (let i = 0; i < data.length; i += 4) {
          colours.forEach(([r, g, b], band) => {
            if (
              Math.abs(data[i] - r) <= 2 &&
              Math.abs(data[i + 1] - g) <= 2 &&
              Math.abs(data[i + 2] - b) <= 2
            )
              counts[band] += 1;
          });
        }
        return counts;
      },
      { png, swatches, area }
    );
    expect(
      drawn.every((count) => count >= 20),
      `pixels per band: ${drawn.join(", ")}`
    ).toBe(true);
  });
});
