/**
 * The strips beside the school card's comparison lines, and the way from a card to the charts of all schools
 * (/explore with the school marked). Failure modes, each with the test that catches it:
 *  1. A strip's dot disagrees with the line beside it: it sits in another column than the school's record gives, the
 *     columns run the other way, or they count another list than the line
 *                         -> "each strip counts the list as the records give it, with the school's dot in its own column"
 *  2. A missing value is drawn: a school with no figure is counted in a column, or the card's school has a strip for a
 *     part its record does not give               -> "a figure the record does not give is drawn nowhere"
 *  3. A strip shows where its line does not: under a rule or for a part with no line, on a record to verify, or in
 *     the method details while the strips belong on the card
 *                                                 -> "a strip shows only beside a line, under every rule"
 *  4. The link names another school than the card's, opens another tab, or Back from the charts loses the card
 *                                                 -> "the link opens the charts with the card's school marked ..."
 *  5. The /screening first screen changes: a strip or the link shows before a card opens
 *                                                 -> "the first screen shows no strip and no link"
 *  6. On a 390 px phone the card grows past its limit: the strips by more than one line of the comparison text, 17 px,
 *     in all; the link by more than its own row, 36 px. On a 360 px phone a strip leaves its part, or the page
 *     scrolls sideways                            -> "on a 390 and a 360 px phone the card stays within its limit"
 *  7. A screen reader reads a strip as well as its line, or reaches it as an image
 *                                                 -> "a screen reader reads each comparison once ..."
 *  8. Under a rule other than the main one, the card links to charts that count the main rule's list, not the one
 *     its lines and strips count                  -> "links to the charts only under the main rule ..."
 * The /screening first screen's pixels against the base are compared outside this suite, at eight sizes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { STRIPS_SHOWN_IN } from "../lib/explore/strip";
import { EXPLORE } from "../lib/screening/copy/explore";
import { LAYOUT } from "../lib/screening/copy/words";

import {
  MAIN_RULE,
  type MockDataset,
  expect,
  keyOf,
  openWorkspace,
  orderedRow,
  test,
  useMockDataset,
  waitForMap,
} from "./screening-helpers";

test.describe.configure({ timeout: 90_000 });

const FIXTURES = path.resolve(__dirname, "fixtures/screening");
const read = (dataset: MockDataset, file: string) =>
  JSON.parse(readFileSync(path.join(FIXTURES, dataset === "default" ? "" : dataset, file), "utf8"));
type Inputs = Record<string, number | string | null>;
interface Row {
  cohort: string;
  school: { school_key: string; source_school_name: string };
  need_parts: Record<string, number | null>;
}
const rowsOf = (rule: string, dataset: MockDataset = "default"): Row[] =>
  read(dataset, `results/${rule}.json`).rows;
const listedOf = (rule: string, dataset: MockDataset = "default") =>
  rowsOf(rule, dataset).filter((r) => r.cohort !== "verification_queue");
const inputsOf = (dataset: MockDataset = "default"): Map<string, Inputs> =>
  new Map(
    (read(dataset, "inputs.json").schools as { school_key: string; inputs: Inputs }[]).map((s) => [
      s.school_key,
      s.inputs,
    ])
  );

type Part = "classrooms" | "housing" | "facilities" | "services" | "locality";
/** Each part by the glossary term its name carries on the card. */
const PART_OF_TERM: Record<string, Part> = {
  need_classrooms: "classrooms",
  need_housing: "housing",
  need_facilities: "facilities",
  need_services: "services",
  need_locality: "locality",
};
const FACILITIES = [
  "libraries",
  "workshops",
  "practical_skills_buildings",
  "home_economics_buildings",
  "computer_labs",
  "specialized_classrooms",
];
const CATEGORIES = [
  "highly accessible",
  "accessible",
  "moderately accessible",
  "remote",
  "very remote",
  "extremely remote",
];

/**
 * The columns of each part's chart as the requirement states them, from the saved records: a share of none, by
 * quarters, or all of it, up to one; how many of the six facility types the record has; each power-and-water score
 * the list holds, in twentieths; and the six remoteness categories. Null for a record that gives no figure.
 */
function columnsOf(rule: string, dataset: MockDataset = "default") {
  const listed = listedOf(rule, dataset);
  const inputs = inputsOf(dataset);
  const share = (part: number | string | null, whole: number | string | null) => {
    if (typeof part !== "number" || typeof whole !== "number" || whole <= 0) return null;
    const s = Math.min(part / whole, 1);
    return s === 0 ? 0 : s === 1 ? 5 : 1 + Math.floor(s * 4);
  };
  const points = (row: Row) =>
    row.need_parts.service_deficit == null ? null : Math.round(row.need_parts.service_deficit * 20);
  const scores = [...new Set(listed.map(points).filter((p): p is number => p !== null))].sort(
    (a, b) => a - b
  );
  const column: Record<Part, (row: Row) => number | null> = {
    classrooms: (r) =>
      share(
        inputs.get(r.school.school_key)!.permanent_classrooms,
        inputs.get(r.school.school_key)!.total_classrooms
      ),
    housing: (r) =>
      share(inputs.get(r.school.school_key)!.teacher_houses, inputs.get(r.school.school_key)!.teachers),
    facilities: (r) => {
      const i = inputs.get(r.school.school_key)!;
      return FACILITIES.some((f) => i[f] == null)
        ? null
        : FACILITIES.filter((f) => (i[f] as number) > 0).length;
    },
    services: (r) => (points(r) === null ? null : scores.indexOf(points(r)!)),
    locality: (r) => {
      const c = CATEGORIES.indexOf(
        String(inputs.get(r.school.school_key)!.locality ?? "")
          .trim()
          .toLowerCase()
      );
      return c < 0 ? null : c;
    },
  };
  const size: Record<Part, number> = {
    classrooms: 6,
    housing: 6,
    facilities: 7,
    services: scores.length,
    locality: 6,
  };
  return {
    of: (part: Part, key: string) => column[part](listed.find((r) => r.school.school_key === key)!),
    counts: (part: Part) =>
      Array.from({ length: size[part] }, (_, i) => listed.filter((r) => column[part](r) === i).length),
  };
}

const card = (page: Page) => page.locator("[data-slot=school-card]");
const strips = (scope: Locator) => scope.locator("[data-region=need-strip]");
const seeAll = (page: Page) => card(page).getByRole("link", { name: LAYOUT.seeAmongAll });

/** What a strip draws: each column it draws with its count, the column of the dot, and where the dot sits. */
async function drawn(strip: Locator) {
  return strip.evaluate((svg) => ({
    width: Number(svg.getAttribute("width")),
    columns: [...svg.querySelectorAll("path[data-column]")].map((p) => ({
      column: Number(p.getAttribute("data-column")),
      count: Number(p.getAttribute("data-count")),
    })),
    at: Number(svg.querySelector("circle")!.getAttribute("data-column")),
    cx: Number(svg.querySelector("circle")!.getAttribute("cx")),
  }));
}

/** The card's parts that carry a comparison line, each by its part and its line. */
async function partsWithLines(page: Page) {
  const parts = card(page)
    .locator("[data-region=need-box] li")
    .filter({
      has: page.locator("[data-region=need-standing]"),
    });
  const out: { part: Part; li: Locator }[] = [];
  for (const li of await parts.all())
    out.push({ part: PART_OF_TERM[(await li.locator("[data-term]").getAttribute("data-term"))!], li });
  return out;
}

async function openCard(page: Page, key: string, rule = MAIN_RULE) {
  await openWorkspace(
    page,
    `?${new URLSearchParams({ ...(rule === MAIN_RULE ? {} : { rule }), school: key })}`
  );
  await expect(card(page).locator("[data-region=inspector-why]")).toBeVisible();
}

test("each strip counts the list as the records give it, with the school's dot in its own column", async ({
  page,
}) => {
  test.skip(STRIPS_SHOWN_IN !== "card", "The strips are in the method details");
  const columns = columnsOf(MAIN_RULE);
  const listed = listedOf(MAIN_RULE);
  // The first school, a school with a range of ranks, and one from the middle of the list.
  const range = listed.find((r) => r.cohort === "interval")!;
  for (const row of [listed[0], range, listed[Math.floor(listed.length / 2)]]) {
    const key = row.school.school_key;
    await openCard(page, key);
    const parts = await partsWithLines(page);
    expect(parts, row.school.source_school_name).toHaveLength(5);
    for (const { part, li } of parts) {
      const tag = `${row.school.source_school_name} ${part}`;
      const { width, columns: shown, at, cx } = await drawn(strips(li));
      const expected = columns.counts(part);
      // Every column the chart has, as many schools as the records put in it; an empty column draws nothing.
      expect(
        Array.from({ length: expected.length }, (_, i) => shown.find((c) => c.column === i)?.count ?? 0),
        tag
      ).toEqual(expected);
      expect(at, tag).toBe(columns.of(part, key));
      // The dot is drawn over its own column.
      const step = width / expected.length;
      expect(cx, tag).toBeGreaterThan(at * step);
      expect(cx, tag).toBeLessThan((at + 1) * step);
    }
  }

  // The lines' own groups, worked out by hand from the saved list of the main rule (screening-card.spec.ts): its 21
  // other schools all record a larger share of permanent classrooms than its none of 8, but the 2 level with it, and
  // 19 are less remote than its very remote record. The strip draws those schools on the side the line reads.
  await openCard(page, keyOf(MAIN_RULE, "Sample School 08"));
  const sides = async (part: Part) => {
    const li = (await partsWithLines(page)).find((p) => p.part === part)!.li;
    await expect(li.locator("[data-region=need-standing]")).toContainText(
      part === "classrooms" ? "record a larger share" : "are recorded as less remote"
    );
    const { columns: shown, at } = await drawn(strips(li));
    const sum = (keep: (c: number) => boolean) =>
      shown.filter((c) => keep(c.column)).reduce((total, c) => total + c.count, 0);
    return { left: sum((c) => c < at), here: sum((c) => c === at), right: sum((c) => c > at) };
  };
  expect(await sides("classrooms")).toEqual({ left: 0, here: 3, right: 19 });
  expect(await sides("locality")).toEqual({ left: 19, here: 3, right: 0 });
});

test("a figure the record does not give is drawn nowhere", async ({ page }) => {
  test.skip(STRIPS_SHOWN_IN !== "card", "The strips are in the method details");
  const listed = listedOf(MAIN_RULE);
  const blank = listed[0].school.school_key;
  // The stored inputs and the school's own record, as the API might send them, with its classroom count left blank.
  const blankClassrooms = async (route: Parameters<Parameters<Page["route"]>[1]>[0]) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const school of body.schools ?? [])
      if (school.school_key === blank) school.inputs.total_classrooms = null;
    if (body.school?.school_key === blank) body.inputs.total_classrooms = null;
    await route.fulfill({ response, json: body });
  };
  await page.route("**/api/v1/screening/inputs**", blankClassrooms);
  await page.route(`**/api/v1/screening/schools/by-key/${blank}**`, blankClassrooms);

  // Its own card: no line and no strip for classrooms; the other four parts keep both.
  await openCard(page, blank);
  const own = await partsWithLines(page);
  expect(own.map((p) => p.part).sort()).toEqual(["facilities", "housing", "locality", "services"]);
  const classrooms = card(page).locator("[data-region=need-box] li", {
    has: page.locator("[data-term=need_classrooms]"),
  });
  await expect(strips(classrooms)).toHaveCount(0);
  await expect(strips(card(page))).toHaveCount(4);

  // Another school's classrooms strip counts every school of the list but the blank one.
  await openCard(page, listed[1].school.school_key);
  const li = (await partsWithLines(page)).find((p) => p.part === "classrooms")!.li;
  const { columns: shown } = await drawn(strips(li));
  expect(shown.reduce((total, c) => total + c.count, 0)).toBe(listed.length - 1);
  const expected = columnsOf(MAIN_RULE).counts("classrooms");
  const lost = columnsOf(MAIN_RULE).of("classrooms", blank)!;
  expected[lost] -= 1;
  expect(Array.from({ length: 6 }, (_, i) => shown.find((c) => c.column === i)?.count ?? 0)).toEqual(
    expected
  );
});

test("a strip shows only beside a line, under every rule", async ({ page, context }) => {
  const rules = read("default", "rules.json").rules.map((r: { rule_id: string }) => r.rule_id) as string[];
  for (const rule of rules) {
    await openCard(page, listedOf(rule)[0].school.school_key, rule);
    const lines = card(page).locator("[data-region=need-standing]");
    await expect(lines.first()).toBeVisible();
    // One strip beside each line, inside it, and none anywhere else.
    if (STRIPS_SHOWN_IN === "card") {
      await expect(strips(card(page)), rule).toHaveCount(await lines.count());
      await expect(lines.locator("[data-region=need-strip]"), rule).toHaveCount(await lines.count());
    } else await expect(strips(card(page)), rule).toHaveCount(0);
  }

  // A school whose reasons hold no part of school need has no lines, so no strip.
  await openCard(page, keyOf("bottleneck_u", "Sample School 25"), "bottleneck_u");
  await expect(card(page).locator("[data-region=need-box]")).toHaveCount(0);
  await expect(strips(card(page))).toHaveCount(0);

  // A record to verify is not in the list: no line, no strip and no link.
  const queued = rowsOf(MAIN_RULE).find((r) => r.cohort === "verification_queue")!.school.school_key;
  await openCard(page, queued);
  await expect(card(page).locator("[data-region=need-standing]")).toHaveCount(0);
  await expect(strips(card(page))).toHaveCount(0);
  await expect(seeAll(page)).toHaveCount(0);

  // The method details: the strips show only where STRIPS_SHOWN_IN puts them, each beside a line.
  await openCard(page, listedOf(MAIN_RULE)[0].school.school_key);
  await page.getByRole("switch", { name: "Show method details" }).click();
  await expect(card(page).locator("[data-region=method-see-all]")).toBeVisible();
  const compared = card(page).locator("[data-region=compared-line]");
  if (STRIPS_SHOWN_IN === "card") {
    await expect(strips(card(page))).toHaveCount(0);
    await expect(compared).toHaveCount(0);
  } else {
    await expect(compared).toHaveCount(5);
    await expect(compared.locator("[data-region=need-strip]")).toHaveCount(5);
    await expect(strips(card(page))).toHaveCount(5);
  }

  // A one-school list has no other school to compare with: no line, so no strip.
  await useMockDataset(context, "one");
  await openCard(page, listedOf(MAIN_RULE, "one")[0].school.school_key);
  await expect(card(page).locator("[data-region=need-standing]")).toHaveCount(0);
  await expect(strips(card(page))).toHaveCount(0);
});

test("the link opens the charts with the card's school marked, in the same tab, and Back returns to the card", async ({
  page,
}) => {
  const name = "Sample School 15";
  const key = keyOf(MAIN_RULE, name);
  const marked = async () => {
    await expect(page).toHaveURL(new RegExp(`/explore\\?school=${key}$`));
    await expect(page.getByLabel(EXPLORE.pick.label)).toHaveValue(key, { timeout: 30_000 });
    await expect(page.locator(`figure[data-part] circle[data-marked][data-school-key="${key}"]`)).toHaveCount(
      5
    );
  };
  const back = async () => {
    await page.goBack();
    await waitForMap(page);
    await expect(page).toHaveURL(new RegExp(`/screening\\?(.+&)?school=${key}(&|$)`));
    await expect(card(page).getByRole("heading", { level: 2 })).toHaveText(name);
  };

  // From the plain card, opened from the list as a reader opens it.
  await openWorkspace(page);
  await orderedRow(page, name).click();
  const link = seeAll(page);
  await expect(link).toHaveAttribute("href", `/explore?school=${key}`);
  await expect(link).not.toHaveAttribute("target", /.+/);
  await link.click();
  await marked();
  await back();
  // The card's own history still works: closing it goes back to the list it was opened from.
  await card(page).getByTestId("close-card").click();
  await expect(card(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/school=/);

  // From the method details, which Back keeps on.
  await page.getByRole("switch", { name: "Show method details" }).click();
  await orderedRow(page, name).click();
  await card(page)
    .locator("[data-region=method-see-all]")
    .getByRole("link", { name: LAYOUT.seeAmongAll })
    .click();
  await marked();
  await back();
  await expect(page.getByRole("switch", { name: "Show method details" })).toBeChecked();
  await expect(card(page).locator("[data-region=method-see-all]")).toBeVisible();
});

test("links to the charts only under the main rule, the one list they count", async ({ page }) => {
  const rules = read("default", "rules.json").rules.map((r: { rule_id: string }) => r.rule_id) as string[];
  await openCard(page, listedOf(MAIN_RULE)[0].school.school_key);
  await expect(seeAll(page)).toHaveCount(1);
  for (const rule of rules.filter((r) => r !== MAIN_RULE)) {
    await openCard(page, listedOf(rule)[0].school.school_key, rule);
    // The lines and strips count this rule's list, which the charts do not draw, so the card offers no way to them.
    await expect(card(page).locator("[data-region=inspector-why]"), rule).toBeVisible();
    await expect(seeAll(page), rule).toHaveCount(0);
  }
  // Nor do the method details under another rule, where the main rule's card has the link at their foot.
  for (const rule of [MAIN_RULE, "additive_u"]) {
    const school = listedOf(rule)[0].school;
    await openWorkspace(page, rule === MAIN_RULE ? "" : `?${new URLSearchParams({ rule })}`);
    await page.getByRole("switch", { name: "Show method details" }).click();
    await orderedRow(page, school.source_school_name).click();
    await expect(card(page).getByRole("heading", { name: school.source_school_name })).toBeVisible();
    await expect(card(page).locator("[data-region=inspector-across]")).toBeVisible();
    await expect(
      card(page).locator("[data-region=method-see-all]").getByRole("link", { name: LAYOUT.seeAmongAll }),
      rule
    ).toHaveCount(rule === MAIN_RULE ? 1 : 0);
    if (rule !== MAIN_RULE) await expect(seeAll(page), rule).toHaveCount(0);
  }
});

test("the first screen shows no strip and no link", async ({ page }) => {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await openWorkspace(page);
    await expect(page.locator("[data-region=need-strip]")).toHaveCount(0);
    await expect(page.getByRole("link", { name: LAYOUT.seeAmongAll })).toHaveCount(0);
  }
});

test("on a 390 and a 360 px phone the card stays within its limit", async ({ page }) => {
  test.skip(STRIPS_SHOWN_IN !== "card", "The strips are in the method details");
  await page.setViewportSize({ width: 390, height: 844 });
  await openCard(page, keyOf(MAIN_RULE, "Sample School 08"));
  const box = card(page).locator("[data-region=need-box]");
  const measure = () =>
    card(page).evaluate((el) => ({
      body: el.querySelector("[data-region=card-body]")!.scrollHeight,
      box: el.querySelector("[data-region=need-box]")!.getBoundingClientRect().height,
    }));
  await expect(strips(box)).toHaveCount(5);
  const full = await measure();
  // The same card as before this change: the strips, then the link's row, taken out of the layout.
  await page.addStyleTag({ content: "[data-region=need-strip] { display: none !important; }" });
  const noStrips = await measure();
  await page.addStyleTag({ content: "[data-region=need-foot] { display: none !important; }" });
  const before = await measure();
  expect(full.box - noStrips.box).toBeLessThanOrEqual(17);
  expect(noStrips.box - before.box).toBeLessThanOrEqual(36);
  expect(full.body - before.body).toBeLessThanOrEqual(17 + 36);

  // On a 360 px phone every strip stays inside its own part, and nothing scrolls sideways.
  await page.setViewportSize({ width: 360, height: 740 });
  await openCard(page, keyOf(MAIN_RULE, "Sample School 08"));
  for (const li of await box.locator("li").all()) {
    const part = (await li.boundingBox())!;
    const strip = (await strips(li).boundingBox())!;
    expect(strip.x).toBeGreaterThanOrEqual(part.x);
    expect(strip.x + strip.width).toBeLessThanOrEqual(part.x + part.width + 0.5);
    expect(strip.y).toBeGreaterThanOrEqual(part.y);
    expect(strip.y + strip.height).toBeLessThanOrEqual(part.y + part.height + 0.5);
  }
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth)).toBeLessThanOrEqual(360);
});

test("a screen reader reads each comparison once, and never reaches a strip", async ({ page }) => {
  test.skip(STRIPS_SHOWN_IN !== "card", "The strips are in the method details");
  await openCard(page, keyOf(MAIN_RULE, "Sample School 08"));
  const box = card(page).locator("[data-region=need-box]");
  await expect(strips(box)).toHaveCount(5);
  for (const strip of await strips(box).all()) {
    await expect(strip).toHaveAttribute("aria-hidden", "true");
    await expect(strip).toHaveAttribute("focusable", "false");
  }
  // The tree as a screen reader gets it, its spaces made plain: each line is in it once, and no image is.
  const plain = (text: string) => text.replace(/\s+/g, " ");
  const tree = plain(await box.ariaSnapshot());
  expect(tree).not.toMatch(/\bimg\b/);
  for (const line of await box.locator("[data-region=need-standing]").allTextContents())
    expect(tree.split(plain(line)).length - 1, line).toBe(1);
});
