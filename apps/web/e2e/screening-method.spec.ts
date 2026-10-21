/**
 * The method details ("Show method details") and compare mode on /screening. Failure modes and the test for each:
 *  1. The switch does not reach the method layer, loses it on reload, or cannot be left       -> "the switch..."
 *  2. Method words leak into the plain view after the switch is turned off (a multiplier, an id, the persistence
 *     test's terms)                                                                            -> "the switch..."
 *  3. The card's method layer states a place, a score or a share other than the API's          -> "the card..."
 *  4. A filter renumbers places, hides the wrong rows, or cannot be cleared                     -> "filters..."
 *  5. A layer cannot be turned off, a popover traps Escape or does not hand focus back         -> "map layers..."
 *  6. Compare mode does not reproduce a pasted pair, swaps or picks the wrong rule, or says
 *     the agreement in other words than What changed                                           -> "compare mode..."
 *  7. Turning the method details off while comparing loses the comparison                       -> "turning the method details off..."
 *  8. A pair without the circulated rule cannot be compared                                    -> "a pair..."
 *  9. A chart label leaves the chart or loses the school's full name (R4)                       -> "chart labels..."
 * 10. The card in compare mode does not show the school under both rules                        -> "the card in compare mode..."
 * 11. A raw null, undefined or NaN renders in a method state on the worst-case data (R8)        -> "no raw null..."
 * 12. A method-only key (a filter, a hidden layer) filters a plain screen, from a pasted link or after the switch
 *     is turned off                                                                             -> "a plain screen..."
 * 13. The compare card states a rule's own place under a label that counts the schools both rules put in order, so
 *     it contradicts the chart                                                                  -> "the compare card's places..."
 * 14. Compare mode's chart is a picture only: no keyboard or screen-reader way to each school's
 *     two places                                                                                -> "the chart has a table..."
 * 15. A chart line has its path only in CSS, which some browsers do not read                    -> "every chart line..."
 * 16. The method layer's code fails to load and the switch does nothing, with no way on         -> "a failed load..."
 * 17. Map layers sits apart from the guidance map bar, or widens it into the actions or the card
 *     without the bar stepping down or keeping its icons only                                    -> "the map bar..."
 * 18. The narrow layout, which hides the actions, offers no way to the method details or the export sheet, or a
 *     choice in its menu leaves focus nowhere                                                    -> "the narrow menu..."
 * 19. Help mode leaves the method details unexplained (their rules, scope line, places, key, Map layers, filters and
 *     compare mode's statement), or marks so much it stops being a short list                    -> "help mode..."
 * 20. The filter by what is missing does nothing, miscounts its choices, or a link does not reproduce it
 *                                                                                                -> "the incomplete records filter..."
 * 21. Guide 4's Try it asks for the filter by what is missing while it is off screen             -> "guide 4's group step..."
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import { RULE, expect, mainRule, openWorkspace, test, useMockDataset, waitForMap } from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

const FIXTURES = path.resolve(__dirname, "fixtures/screening");
const json = (file: string) => JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));

const search = (page: Page) => new URL(page.url()).search;
const methodSwitch = (page: Page) => page.getByRole("switch", { name: "Show method details" });
const methodRow = (page: Page, name: string) =>
  page.locator("ol[aria-label='The list'] button", { hasText: name });
const card = (page: Page) => page.locator("[data-slot=school-card]");
const workspaceText = (page: Page) => page.getByTestId("screening-workspace").innerText();

const ROWS = json("results/additive_u.json").rows as {
  school: { source_school_name: string; province: string; school_key: string };
  scores: { point: number | null };
  point_rank: { rank: number | null };
  cohort: string;
}[];
const FORMULA = (json("rules.json").rules as { rule_id: string; formula: string }[]).find(
  (r) => r.rule_id === "additive_u"
)!.formula;

test("the switch turns the method details on over the same screen, survives a reload and turns off cleanly", async ({
  page,
}) => {
  await openWorkspace(page);
  await methodSwitch(page).click();
  await expect(methodSwitch(page)).toHaveAttribute("aria-checked", "true");
  expect(search(page)).toBe("?analyst=1");

  await expect(page.getByRole("heading", { level: 2, name: "Combined factors, with urgency" })).toBeVisible();
  const first = methodRow(page, "Sample School 08");
  await expect(first).toContainText("1Sample School 08South One, South Province0.683");
  await expect(page.getByTestId("legend-rule")).toContainText(
    "Place in the list under combined factors, with urgency"
  );
  await page.getByRole("button", { name: "Formula" }).click();
  await expect(page.locator("#screening-formula")).toHaveText(FORMULA);
  expect(search(page)).toBe("?analyst=1&formula=1");

  await page.reload();
  await waitForMap(page);
  await expect(page.locator("#screening-formula")).toHaveText(FORMULA);

  await methodSwitch(page).click();
  // The formula is method detail: it leaves the link with the method details.
  expect(search(page)).toBe("");
  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("ol[aria-label='The list'] button").first()).toContainText("1st");
  const text = await workspaceText(page);
  for (const word of ["×", "Formula", "Dirichlet", "additive_u", "sha256", "Map layers"])
    expect(text, `plain view shows "${word}"`).not.toContain(word);
});

test("the card's method layer states the API's place, screening score, shares and record", async ({
  page,
}) => {
  await openWorkspace(page, "?analyst=1");
  await methodRow(page, "Sample School 08").click();
  const c = card(page);
  await expect(c.locator("[data-region=inspector-place]")).toContainText(
    "1Place in the listunder combined factors, with urgency, among the 16 schools with every input recorded"
  );
  await expect(c).toContainText("Screening score0.683");
  const breakdown = c.locator("[data-region=inspector-breakdown]");
  await expect(breakdown).toContainText("School need× 0.60");
  await expect(breakdown).toContainText("District context× 0.15");
  await expect(breakdown.getByRole("row").last()).toContainText("Screening score0.683");
  await expect(c.locator("[data-region=inspector-across] dt")).toHaveCount(7);
  await expect(c).toContainText(ROWS[0].school.school_key);
  // The parts of school need open and close in place, and the link keeps the choice.
  const parts = breakdown.getByRole("button", { name: "School need" });
  const open = await parts.getAttribute("aria-expanded");
  await parts.click();
  await expect(parts).toHaveAttribute("aria-expanded", open === "true" ? "false" : "true");
  expect(search(page)).toContain("parts=1");
});

test("filters hide rows, keep every place, and their chips clear them", async ({ page }) => {
  await openWorkspace(page, "?analyst=1");
  const all = await page.locator("ol[aria-label='The list'] > li").count();
  await page.getByRole("button", { name: "Show only" }).click();
  await page.getByLabel("Province").selectOption("South Province");
  await page.keyboard.press("Escape");
  expect(search(page)).toBe("?analyst=1&prov=South+Province");

  const south = ROWS.filter(
    (r) => r.school.province === "South Province" && r.cohort !== "verification_queue"
  );
  const rows = page.locator("ol[aria-label='The list'] > li");
  await expect(rows).toHaveCount(south.length);
  // Places are the whole list's: the second South Province school is 3rd, not 2nd.
  await expect(rows.nth(1)).toContainText(`${south[1].point_rank.rank}${south[1].school.source_school_name}`);
  await expect(page.locator("[data-region=scope]")).toContainText(`Showing ${south.length} of ${all}.`);

  await page.getByRole("button", { name: "Remove Province: South Province filter" }).click();
  await expect(rows).toHaveCount(all);
  expect(search(page)).toBe("?analyst=1");
});

test("map layers turn the place numbers off through the controller, and Escape hands focus back", async ({
  page,
}) => {
  await openWorkspace(page, "?analyst=1");
  await expect(page.locator("[data-rank-label]")).toHaveCount(10);
  const button = page.getByRole("button", { name: "Map layers" });
  await button.click();
  await page.getByRole("checkbox", { name: "Numbers on the first 10" }).uncheck();
  await expect(page.locator("[data-rank-label]")).toHaveCount(0);
  expect(search(page)).toBe("?analyst=1&hide=numerals");
  await page.keyboard.press("Escape");
  await expect(page.locator("#screening-layers")).toHaveCount(0);
  await expect(button).toBeFocused();
  // Turning the method details off draws the plain map again; the choice waits in the link for their return.
  await methodSwitch(page).click();
  await expect(page.locator("[data-rank-label]")).toHaveCount(10);
});

test("the map bar holds Map layers, and steps down or keeps its icons rather than touch the actions or the card", async ({
  page,
}) => {
  const school = ROWS.find((r) => r.cohort === "complete")!.school.school_key;
  for (const width of [1600, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const link of ["?analyst=1", `?analyst=1&school=${school}`]) {
      // A card that steps the list aside takes the column's heading with it, so wait for the map instead.
      await page.goto(`/screening${link}`);
      await waitForMap(page);
      const bar = page.getByRole("toolbar", { name: "Guidance and map" });
      await expect(bar.getByRole("button", { name: "Map layers" })).toBeVisible();
      if (link.includes("school"))
        await expect(card(page).locator("[data-region=inspector-place]")).toBeVisible();
      await page.waitForFunction(() => document.getAnimations().length === 0);
      const touching = await page.evaluate(() => {
        const box = (selector: string) => {
          const element = document.querySelector(selector);
          const r = element?.getBoundingClientRect();
          return r && r.width > 0 && getComputedStyle(element!).visibility !== "hidden" ? r : null;
        };
        const bar = box("[data-region=mapbar]")!;
        const others = {
          actions: box("[data-region=actions]"),
          column: box("section[data-slot=column]:not([data-aside])"),
          card: box("[data-slot=school-card]"),
        };
        return Object.entries(others)
          .filter(
            ([, r]) =>
              r &&
              bar.left < r.right - 1 &&
              r.left < bar.right - 1 &&
              bar.top < r.bottom - 1 &&
              r.top < bar.bottom - 1
          )
          .map(([name]) => name);
      });
      expect(touching, `${width} ${link}`).toEqual([]);
    }
  }
});

const LEAD_20 =
  "This compares the combined-factors rule with urgency (S) with the combined-factors rule without urgency (S0) among the 16 schools with every input recorded.";

test("compare mode reproduces a pasted pair, says the agreement in What changed's words, swaps and goes back", async ({
  page,
}) => {
  // A copied link carries both rules; compare mode is method detail, so the link turns the method details on.
  await openWorkspace(page, "?mode=compare&rule=additive_no_u&compare=additive_u");
  await expect(methodSwitch(page)).toHaveAttribute("aria-checked", "true");
  const statement = page.locator("[data-region=compare-statement]");
  await expect(statement.locator("p").first()).toHaveText(LEAD_20);
  await expect(page.getByRole("button", { name: /^Choose the rule to compare from:/ })).toContainText(
    "Combined factors, with urgency"
  );
  await expect(page.locator("[data-region=slope-chart] svg path[stroke]")).toHaveCount(16);

  await page.getByRole("button", { name: "Top 10" }).click();
  const overlap = json("compare/additive_u__additive_no_u.json").metrics.top_k.find(
    (t: { k: number }) => t.k === 10
  ).overlap;
  await expect(statement.locator("p").first()).toHaveText(
    `Among the 16 schools both rules put in order, the combined-factors rule with urgency (S) and the combined-factors rule without urgency (S0) share ${overlap} of their top 10 schools.`
  );
  await expect(statement.getByText("Joins the top 10")).toBeVisible();
  expect(search(page)).toBe("?analyst=1&mode=compare&rule=additive_no_u&compare=additive_u&k=10");

  await page.getByRole("button", { name: "Swap the two rules" }).click();
  expect(search(page)).toBe("?analyst=1&mode=compare&compare=additive_no_u&k=10");
  await expect(page.getByRole("button", { name: /^Choose the rule to compare from:/ })).toContainText(
    "Combined factors, without urgency"
  );

  await page.getByRole("button", { name: "Back to the list" }).click();
  expect(search(page)).toBe("?analyst=1&compare=additive_no_u&k=10");
  await expect(page.locator("[data-region=what-changed]")).toBeVisible();
});

test("turning the method details off while comparing returns to the plain list on the compared rule", async ({
  page,
}) => {
  await openWorkspace(page, "?analyst=1&mode=compare&rule=additive_no_u&compare=additive_u");
  await expect(page.locator("[data-region=compare-statement]")).toBeVisible();
  await methodSwitch(page).click();
  expect(search(page)).toBe("?rule=additive_no_u&compare=additive_u");
  await expect(mainRule(page, RULE.proposed)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-region=what-changed]")).toBeVisible();
  await expect(page.locator("[data-region=compare-statement]")).toHaveCount(0);
});

test("a pair without the circulated rule is compared from the pickers", async ({ page }) => {
  await openWorkspace(page, "?analyst=1&mode=compare&rule=additive_no_u&compare=additive_u");
  await page.getByRole("button", { name: /^Choose the rule to compare from:/ }).click();
  await page
    .locator("#screening-pick-a")
    .getByRole("button", { name: /Need-first rule, with urgency/ })
    .click();
  await page.getByRole("button", { name: /^Choose the rule to compare to:/ }).click();
  await page
    .locator("#screening-pick-b")
    .getByRole("button", { name: /Largest-factor rule, with urgency/ })
    .click();
  expect(search(page)).toBe("?analyst=1&mode=compare&rule=bottleneck_u&compare=need_first_u");
  // A choice closes the list and hands focus back to the picker, as Escape does.
  await expect(page.getByRole("button", { name: /^Choose the rule to compare to:/ })).toBeFocused();
  const n = json("compare/need_first_u__bottleneck_u.json").common_cohort_count;
  await expect(page.locator("[data-region=compare-statement] p").first()).toContainText(
    `among the ${n} schools`
  );
  await expect(page.locator("[data-region=slope-chart] svg path[stroke]")).toHaveCount(n);
});

test("chart labels never leave the chart, and each keeps the school's full name in its title (R4)", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "worst-names");
  await page.goto("/screening?analyst=1&mode=compare&rule=additive_no_u&compare=additive_u&k=10");
  await waitForMap(page);
  const svg = page.locator("[data-region=slope-chart] svg");
  await expect(svg.locator("text[data-school-key]").first()).toBeVisible();
  const report = await svg.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return [...element.querySelectorAll("text[data-school-key]")].map((t) => {
      const r = t.getBoundingClientRect();
      const title = t.querySelector("title")?.textContent ?? "";
      const shown = (t.textContent ?? "").slice(title.length);
      return {
        inside: r.left >= box.left - 1 && r.right <= box.right + 1,
        title,
        shown: shown.replace(/^\s*\d+\s+|\s+\d+\s*$/g, ""),
      };
    });
  });
  expect(report.length).toBeGreaterThan(0);
  for (const label of report) {
    expect(label.inside, `${label.title} leaves the chart`).toBe(true);
    expect(label.title.length).toBeGreaterThan(0);
    // A label is the whole name, or a shorter form of it whose full name is in the title.
    expect(label.shown.length).toBeLessThanOrEqual(label.title.length);
  }
});

test("the card in compare mode shows the school under both rules and how far it moved", async ({ page }) => {
  await openWorkspace(page, "?analyst=1&mode=compare&rule=additive_no_u&compare=additive_u");
  await page.locator("[data-region=slope-chart] text[data-school-key]").first().click();
  const c = card(page);
  await expect(c.locator("[data-region=inspector-place] > div")).toHaveCount(2);
  await expect(c.locator("[data-region=inspector-place]")).toContainText("Combined");
  await expect(c.locator("[data-region=inspector-place]")).toContainText("Combined, no urgency");
  await expect(c.locator("[data-region=inspector-breakdown]")).toHaveCount(2);
  await expect(c).toContainText(/Same place in the list under|(Up|Down) \d+ places? under/);
});

test("no raw null, undefined or NaN renders in the method states on the worst-case data (R8)", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "worst-names");
  for (const link of [
    "?analyst=1",
    "?analyst=1&mode=compare&rule=additive_no_u&compare=additive_u",
    "?analyst=1&view=queue",
  ]) {
    await page.goto(`/screening${link}`);
    await waitForMap(page);
    await expect(methodSwitch(page)).toHaveAttribute("aria-checked", "true");
    const buttons = page.locator("ol[aria-label] button[data-school-key], text[data-school-key]");
    const count = Math.min(await buttons.count(), 6);
    for (let i = 0; i < count; i += 1) {
      await buttons.nth(i).click();
      await expect(card(page)).toBeVisible();
      const text = await workspaceText(page);
      expect(text, `${link} school ${i}`).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b/);
    }
  }
});

test("a plain screen ignores and drops the method details' filters and layers, from a link or the switch", async ({
  page,
}) => {
  const all = ROWS.filter((r) => r.cohort !== "verification_queue").length;
  await openWorkspace(page, "?prov=South+Province&hide=numerals");
  await expect(page.locator("ol[aria-label='The list'] button")).toHaveCount(all);
  await expect(page.locator("[data-rank-label]")).toHaveCount(10);
  expect(search(page)).toBe("");

  await page.goto("/screening?analyst=1&prov=South+Province&hide=numerals");
  await waitForMap(page);
  await expect(page.locator("[data-rank-label]")).toHaveCount(0);
  await methodSwitch(page).click();
  expect(search(page)).toBe("");
  await expect(page.locator("ol[aria-label='The list'] button")).toHaveCount(all);
  await expect(page.locator("[data-rank-label]")).toHaveCount(10);
});

test("the compare card's places are the ones the chart draws, among the schools both rules put in order", async ({
  page,
}) => {
  // Sample School 11 is 14th in the benchmark's own list and 12th among the schools both rules put in order.
  await openWorkspace(page, "?analyst=1&mode=compare&rule=benchmark&compare=additive_u");
  const pair = json("compare/additive_u__benchmark.json");
  const row = pair.ranks.find(
    (r: { school: { source_school_name: string } }) => r.school.source_school_name === "Sample School 11"
  );
  await page
    .locator("[data-region=slope-chart] text[data-school-key]", { hasText: "Sample School 11" })
    .first()
    .click();
  const blocks = card(page).locator("[data-region=inspector-place] > div");
  await expect(blocks.nth(0)).toContainText(String(row.rank_a));
  await expect(blocks.nth(1)).toContainText(String(row.rank_b));
  await expect(blocks.nth(1)).not.toContainText("14");
});

test("the chart has a table a keyboard and a screen reader can use", async ({ page }) => {
  await openWorkspace(page, "?analyst=1&mode=compare&rule=additive_no_u&compare=additive_u");
  const pair = json("compare/additive_u__additive_no_u.json");
  const table = page.getByRole("table", {
    name: "Places in the list under the two rules, joined by a line per school",
  });
  await expect(table.getByRole("row")).toHaveCount(pair.ranks.length + 1);
  const first = pair.ranks[0];
  await expect(table.getByRole("row").nth(1)).toContainText(String(first.rank_a));
  await expect(table.getByRole("row").nth(1)).toContainText(String(first.rank_b));
  // The chart itself is hidden from assistive technology; the table says what it shows.
  await expect(page.locator("[data-region=slope-chart] svg")).toHaveAttribute("aria-hidden", "true");

  // Every school is reachable from the keyboard, and choosing one opens its card as a click on the chart does.
  await table.getByRole("button").first().focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole("heading", { level: 2 })).toHaveText(
    await table.getByRole("button").nth(1).innerText()
  );
});

test("every chart line carries its path as an attribute, for browsers that do not read it from CSS", async ({
  page,
}) => {
  await openWorkspace(page, "?analyst=1&mode=compare&rule=additive_no_u&compare=additive_u");
  const pair = json("compare/additive_u__additive_no_u.json");
  const lines = page.locator("[data-region=slope-chart] svg path[stroke]");
  await expect(lines).toHaveCount(pair.ranks.length);
  for (const d of await lines.evaluateAll((paths) => paths.map((p) => p.getAttribute("d"))))
    expect(d).toMatch(/^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
});

test("a failed load of the method layer says so and loads it again on Retry", async ({ context }) => {
  // A page of its own: the refused scripts are this test's subject, not problems of the shared page.
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openWorkspace(page);
  // Every script from now on fails, as on a dropped connection, so the method layer's code cannot load.
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
  await methodSwitch(page).click();
  const failure = page.getByRole("alert").filter({ hasText: "Some of the information did not load" });
  await expect(failure).toBeVisible();
  await page.unroute("**/_next/static/chunks/**");
  await failure.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Combined factors, with urgency" })).toBeVisible();
  // The refused scripts are expected failures; nothing else may go wrong on the page.
  expect(errors).toEqual([]);
  await page.close();
});

test("help mode explains the method details' rules, lines and controls, and a mark explains instead of acting", async ({
  page,
}) => {
  const school = ROWS.find((r) => r.cohort === "complete")!.school.school_key;
  await openWorkspace(page, `?analyst=1&school=${school}`);
  await expect(card(page).locator("[data-region=inspector-place]")).toBeVisible();
  await page.getByRole("toolbar").getByRole("button", { name: "Explain this screen" }).click();
  const marked = page.locator("[data-testid=screening-workspace] [data-xp]");
  await expect.poll(() => marked.count()).toBeGreaterThanOrEqual(18);
  expect(await marked.count()).toBeLessThanOrEqual(40);
  for (const selector of [
    "[data-region=layers]",
    "[data-region=filters]",
    "[data-region=rule-switch] [data-rule=additive_no_u]",
    "[data-region=scope] > p[data-term]",
    "[data-region=ranked-list] [data-place=point]",
    "[data-region=ranked-list] [data-place=range]",
    "[data-region=legend-range] [data-term]",
  ])
    await expect(page.locator(`${selector}[data-xp]`), selector).toHaveCount(1);
  // Map layers explains itself instead of opening its popover.
  await page.locator("[data-region=layers]").click();
  await expect(page.locator("[data-help-card]")).toContainText("Map layers");
  await expect(page.locator("#screening-layers")).toHaveCount(0);

  await openWorkspace(page, "?mode=compare&rule=additive_no_u&compare=additive_u&help=1");
  await expect(page.locator("[data-region=compare-statement] > p[data-xp]")).toHaveCount(1);
});

const MISSING = {
  permanent_classroom_deficit: "Classroom count blank, or recorded as 0",
  teacher_housing_deficit: "Teacher or house count blank, or recorded as 0",
  facility_presence_deficit: "Facility counts blank",
  service_deficit: "Power or water source blank",
} as const;

test("the incomplete records filter by what is missing, count each choice and reproduce it from a link", async ({
  page,
}) => {
  const queued = (ROWS as unknown as { cohort: string; need_parts: Record<string, number | null> }[]).filter(
    (r) => r.cohort === "verification_queue"
  );
  const lacking = (detail: keyof typeof MISSING) =>
    queued.filter((r) => r.need_parts[detail] === null).length;
  const [detail, n] = (Object.keys(MISSING) as (keyof typeof MISSING)[])
    .map((d) => [d, lacking(d)] as const)
    .sort((x, y) => y[1] - x[1])[0];
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(queued.length);

  await openWorkspace(page, "?analyst=1&view=queue");
  const chips = page.getByRole("group", { name: "Show only schools missing this detail" });
  const rows = page.locator("ol[aria-label='Incomplete records'] button[data-school-key]");
  await expect(chips.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(queued.length);
  const chip = chips.getByRole("button", { name: new RegExp(`^${MISSING[detail]}`) });
  await expect(chip).toContainText(String(n));
  await chip.click();
  await expect(rows).toHaveCount(n);
  await expect(page.locator("[data-region=queue-order]")).toContainText(`Showing ${n} of ${queued.length}.`);
  expect(search(page)).toBe(`?analyst=1&view=queue&miss=${detail}`);

  await page.reload();
  await expect(rows).toHaveCount(n);
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await chips.getByRole("button", { name: /^All/ }).click();
  await expect(rows).toHaveCount(queued.length);
  expect(search(page)).toBe("?analyst=1&view=queue");
});

test("guide 4's group step turns the method details on and offers its Try it on the filter by what is missing", async ({
  page,
}) => {
  await openWorkspace(page, "?guide=q4&gstep=2");
  const rail = page.getByTestId("guide-rail");
  await expect(rail.getByText("Try it")).toBeVisible();
  await expect(rail).toContainText("Choose a kind of missing detail to show only those schools.");
  await expect(methodSwitch(page)).toHaveAttribute("aria-checked", "true");
  await expect(
    page
      .locator("[data-region=queue-missing]")
      .getByRole("group", { name: "Show only schools missing this detail" })
  ).toBeVisible();
  await expect(page.getByTestId("guide-drift")).toHaveCount(0);
});

test.describe("the narrow layout", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("the narrow menu turns the method details on and opens the export sheet, and hands focus back", async ({
    page,
  }) => {
    await openWorkspace(page);
    const menuButton = page.getByRole("button", { name: "Menu" });
    const menu = page.getByRole("group", { name: "Menu" });
    await menuButton.click();
    await menu.getByRole("button", { name: "Show method details" }).click();
    await expect(menu).toHaveCount(0);
    await expect.poll(() => search(page)).toBe("?analyst=1");
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await expect(menu.getByRole("button", { name: "Show method details" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await menu.getByRole("button", { name: "Download the top list" }).click();
    const sheet = page.locator("[data-region=export-sheet]");
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(menuButton).toBeFocused();
  });
});
