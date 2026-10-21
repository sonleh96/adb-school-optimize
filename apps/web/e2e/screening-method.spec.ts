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
