/**
 * The column of the /screening workspace: the rule area, What changed, the tabs, the scope line and the list's notes,
 * plus the URL and the controller that drive them. Failure modes and the test for each:
 *  1. A pasted link does not reproduce the screen, or the URL falls behind a change -> "a pasted link..."
 *  2. The statement and What changed show together, or What changed compares the wrong rules, or the way back does
 *     not return to the default screen                                               -> "the statement..."
 *  3. Other rules hides a rule, stays open after a choice, traps Escape, animates a keyboard open, or the rule line
 *     does not name the rule chosen                                                  -> "Other rules..."
 *  4. Counts in the tabs or the scope line are not the run's own                       -> "a pasted link...", "the scope line..."
 *  5. The scope detail cannot be opened or closed in place, or stays hidden when two rows show the same bare number
 *     with two meanings (R19)                                                          -> "the scope line..."
 *  6. The range note is missing or in the wrong place                                  -> "the range note..."
 *  7. The incomplete records lose their grouping or their counts                       -> "the incomplete records..."
 *  8. The controller accepts an invalid value, cannot clear a key, does not report a change, or says ready before the
 *     map has drawn                                                                    -> "the controller..."
 */
import {
  INCOMPLETE,
  ORDERED,
  RULE,
  allowUncapturedComparisons,
  expect,
  mainRule,
  openWorkspace,
  orderedRow,
  tab,
  test,
  waitForMap,
} from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

const STATEMENT =
  "Which list should I use? This one, the paper's main rule, until the research team decides. Leaving urgency out keeps the same schools at the top among the 16 with every input recorded.";
const REASSURANCE =
  "Among the 16 schools with every input recorded, all 16 schools with every input recorded are in the top 20 with or without the urgency value. Leaving it out changes the order in the list, and the largest move for any school is 2 places. For the five schools that show a range, leaving it out can still move their possible places.";
const EXAMPLE =
  "Under the combined-factors rule with urgency (S), Sample School 17 could be anywhere from 11th to 18th among the 21 schools that can be put in order. Under the combined-factors rule without urgency (S0), it could be anywhere from 10th to 17th among the 22 schools that can be put in order.";
const SCOPE_DETAIL =
  "Being put in order is not a selection or an approval; it only means the record has enough detail to compare. Single places count among the 16 schools with every input recorded, and ranges among all 21 schools that can be put in order.";

const statement = (page: import("@playwright/test").Page) => page.locator("[data-region=list-statement]");
const changed = (page: import("@playwright/test").Page) => page.locator("[data-region=what-changed]");
const search = (page: import("@playwright/test").Page) => new URL(page.url()).search;

test("a pasted link reproduces the screen, and the URL follows every change", async ({ page }) => {
  await openWorkspace(page, "?rule=additive_no_u&compare=additive_u&scope=1&guide=q1");

  await expect(mainRule(page, RULE.proposed)).toHaveAttribute("aria-pressed", "true");
  await expect(changed(page).locator("[data-region=changed-lead]")).toHaveText(REASSURANCE);
  await expect(changed(page).locator("[data-region=changed-example]")).toHaveText(`Example${EXAMPLE}`);
  await expect(page.locator("#screening-scope-detail")).toHaveText(
    "Being put in order is not a selection or an approval; it only means the record has enough detail to compare. Single places count among the 17 schools with every input the rule reads recorded, and ranges among all 22 schools that can be put in order."
  );
  // The run's own counts: one more school can be put in order without urgency.
  await expect(tab(page, /The list/)).toHaveText("The list(22)");
  await expect(tab(page, /Incomplete records/)).toHaveText("Incomplete records(3)");

  await changed(page).getByRole("button", { name: "Hide this comparison" }).click();
  await expect(changed(page)).toHaveCount(0);
  expect(search(page)).toBe("?rule=additive_no_u&scope=1&guide=q1");

  await tab(page, /Incomplete records/).click();
  await page.getByRole("button", { name: "Show less" }).waitFor({ state: "detached" });
  expect(search(page)).toBe("?rule=additive_no_u&view=queue&scope=1&guide=q1");

  // The same link, opened again, is the same screen.
  await page.reload();
  await waitForMap(page);
  await expect(tab(page, /Incomplete records/)).toHaveAttribute("aria-selected", "true");
  await expect(mainRule(page, RULE.proposed)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`${INCOMPLETE} button`)).toHaveCount(3);
});

test("the statement shows under the main rule only, never beside What changed, and the way back restores it", async ({
  page,
}) => {
  await openWorkspace(page);
  await expect(statement(page)).toHaveText(`${STATEMENT} See what changes without urgency`);
  await expect(changed(page)).toHaveCount(0);

  await statement(page).getByRole("button", { name: "See what changes without urgency" }).click();
  await expect(mainRule(page, RULE.proposed)).toHaveAttribute("aria-pressed", "true");
  await expect(changed(page).locator("[data-region=changed-lead]")).toHaveText(REASSURANCE);
  await expect(statement(page)).toHaveCount(0);
  expect(search(page)).toBe("?rule=additive_no_u&compare=additive_u");

  await changed(page).getByRole("button", { name: "Back to the paper's main rule" }).click();
  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "true");
  await expect(changed(page)).toHaveCount(0);
  await expect(statement(page)).toHaveText(`${STATEMENT} See what changes without urgency`);
  expect(search(page)).toBe("");

  // The switch itself shows What changed too; hiding it leaves the rule's own line with a way back.
  await mainRule(page, RULE.proposed).click();
  await expect(changed(page)).toBeVisible();
  await changed(page).getByRole("button", { name: "Hide this comparison" }).click();
  const line = page.locator("[data-region=rule-role]");
  await expect(line).toHaveText(
    "The screening score adds up several factors, each with a fixed share, and leaves urgency out. A proposed revision of the main rule that leaves urgency out, awaiting the research team's review. Back to the paper's main rule"
  );
  await expect(statement(page)).toHaveCount(0);
  await line.getByRole("button", { name: "Back to the paper's main rule" }).click();
  await expect(statement(page)).toBeVisible();
});

test("Other rules lists all seven, closes on a choice or on Escape, and the rule line names the choice", async ({
  page,
  problems,
}) => {
  await openWorkspace(page);
  const button = page.getByRole("button", { name: "Other rules (5)" });
  const popover = page.locator("#screening-other-rules");

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(popover.getByRole("button")).toHaveCount(7);
  await expect(popover.getByRole("button", { pressed: true })).toContainText(RULE.main);
  await expect(popover.getByRole("button", { name: new RegExp(`^${RULE.needFirst}`) })).toContainText(
    "Strict alternative, as circulated in the paper"
  );
  await expect(popover).not.toHaveAttribute("data-instant", /.*/);

  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(button).toBeFocused();

  // Opened from the keyboard, it appears at once: keyboard actions never animate.
  await page.keyboard.press("Enter");
  await expect(popover).toHaveAttribute("data-instant", "true");
  await popover.getByRole("button", { name: new RegExp(`^${RULE.needFirst}`) }).click();
  await expect(popover).toHaveCount(0);

  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "false");
  await expect(mainRule(page, RULE.proposed)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-region=rule-role]")).toContainText(
    "Need-first rule, with urgency. Schools go in order of school need"
  );
  expect(search(page)).toBe("?rule=need_first_u&compare=additive_u");
  allowUncapturedComparisons(problems);
});

test("the scope line opens its detail in place, and opens it by itself when two rows would show the same number", async ({
  page,
}) => {
  await openWorkspace(page);
  const more = page.getByRole("button", { name: "Read more" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#screening-scope-detail")).toHaveCount(0);
  await more.click();
  const less = page.getByRole("button", { name: "Show less" });
  await expect(less).toHaveAttribute("aria-expanded", "true");
  await expect(less).toHaveAttribute("aria-controls", "screening-scope-detail");
  await expect(page.locator("#screening-scope-detail")).toHaveText(SCOPE_DETAIL);
  await less.click();
  await expect(page.locator("#screening-scope-detail")).toHaveCount(0);

  // Under the need-first rule a range school sits at exactly 10th beside a complete school's 10th.
  await page.goto("/screening?rule=need_first_u");
  await expect(orderedRow(page, "Sample School 17").locator("[data-place]")).toHaveText("10thof 21");
  await expect(orderedRow(page, "Sample School 07").locator("[data-place]")).toHaveText("10th");
  await expect(page.locator("#screening-scope-detail")).toHaveText(SCOPE_DETAIL);
  await expect(page.getByRole("button", { name: /Read more|Show less/ })).toHaveCount(0);
  await waitForMap(page);
});

test("the range note sits just before the first range school", async ({ page }) => {
  await openWorkspace(page);
  const note = page.locator(`${ORDERED} > [data-region=list-order]`);
  await expect(note).toHaveText(
    "The five schools that show a range are listed where they would sit if their missing readings added nothing to their screening score. The study uses this as its main order."
  );
  const next = note.locator("xpath=following-sibling::li[1]//button");
  await expect(next).toContainText("Sample School 17");
  const before = note.locator("xpath=preceding-sibling::li[1]//button");
  await expect(before).toContainText("Sample School 01");
});

test("the incomplete records are grouped by province, each group with its count", async ({ page }) => {
  await openWorkspace(page, "?view=queue");
  await expect(page.locator(`${INCOMPLETE} > li > div`)).toHaveText(["North Province2", "South Province2"]);
  await expect(page.locator(`${INCOMPLETE} button`).first()).toHaveText("Sample School 21 · North One");
});

test("the controller ignores invalid values, clears with null, reports each change and waits for the map", async ({
  page,
}) => {
  await page.goto("/screening");
  const report = await page.evaluate(async () => {
    const ws = window.__screeningWorkspace!;
    await ws.ready;
    // Drawn means the map's canvas exists and every school's mark has a place on it.
    const first = document.querySelector<HTMLElement>("[data-school-key]")!.dataset.schoolKey!;
    const drawn =
      document.querySelector("canvas.maplibregl-canvas") !== null &&
      window.__screeningMapTest!.project(first as never) !== null;
    const heard: string[] = [];
    ws.onChange((now, before) => heard.push(`${before.rule}>${now.rule} ${now.view}`));
    ws.setState({ rule: "not_a_rule", view: "sideways" });
    ws.setState({ rule: "additive_no_u", view: "queue" });
    const after = ws.getState();
    ws.setState({ view: null });
    return { drawn, heard, rule: after.rule, view: after.view, end: ws.getState().view };
  });
  expect(report).toEqual({
    drawn: true,
    heard: ["additive_u>additive_no_u queue", "additive_no_u>additive_no_u ranked"],
    rule: "additive_no_u",
    view: "queue",
    end: "ranked",
  });
  await expect(mainRule(page, RULE.proposed)).toHaveAttribute("aria-pressed", "true");
  await expect(tab(page, /The list/)).toHaveAttribute("aria-selected", "true");
});
