/**
 * The column of the /screening workspace: the rule area, What changed, the tabs, the scope line and the list's notes,
 * plus the URL and the controller that drive them. Failure modes and the test for each:
 *  1. A pasted link does not reproduce the screen, or the URL falls behind a change -> "a pasted link..."
 *  2. The statement and What changed show together, or What changed compares the wrong rules, or the way back does
 *     not return to the default screen                                               -> "the statement..."
 *  3. Other rules hides a rule, stays open after a choice, traps Escape, animates a keyboard open, or the rule line
 *     does not name the rule chosen                                                  -> "Other rules..."
 *  4. Counts in the tabs or the scope line are not the run's own                       -> "a pasted link...", "the scope line..."
 *  5. The scope detail cannot be opened or closed in place, or a range row's place is a bare number that a single
 *     place could also mean (R19)                                                      -> "the scope line..."
 *  6. The range note is missing or in the wrong place                                  -> "the range note..."
 *  7. A row does not say why it sits there, or a range row names a reading the school has -> "each row says why..."
 *  8. The incomplete records lose their grouping, their counts or their missing details, the grouping by what is
 *     missing is lost from the URL, or the arrow keys leave the order on screen       -> "the incomplete records..."
 *  9. The controller accepts an invalid value, cannot clear a key, does not report a change, or says ready before the
 *     map has drawn                                                                    -> "the controller..."
 */
import {
  INCOMPLETE,
  ORDERED,
  RULE,
  expect,
  mainRule,
  openWorkspace,
  orderedRow,
  tab,
  test,
  waitForMap,
  waitForWorkspaceHook,
} from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

const STATEMENT =
  "Which list should I use? This one, the paper's main rule. Urgency is left out because its source could not be traced, which says nothing about real hazards. Putting it back keeps the same schools at the top among the 16 with every input recorded.";
const REASSURANCE =
  "Among the 16 schools with every input recorded, all 16 schools with every input recorded are in the top 20 with or without the urgency value. Putting it back changes the order in the list, and the largest move for any school is 2 places. For the five schools that show a range, putting it back can still move their possible places.";
// What changed from the rule with urgency to the main rule, as the statement's link and guide 5 show it.
const EXAMPLE =
  "Under the combined-factors rule with urgency (S), Sample School 17 could be anywhere from 11th to 18th among the 21 schools that can be put in order. Under the combined-factors rule without urgency (S0), it could be anywhere from 10th to 17th among the 22 schools that can be put in order.";
// The same, read the other way: from the main rule to the rule with urgency.
const EXAMPLE_BACK =
  "Under the combined-factors rule without urgency (S0), Sample School 17 could be anywhere from 10th to 17th among the 22 schools that can be put in order. Under the combined-factors rule with urgency (S), it could be anywhere from 11th to 18th among the 21 schools that can be put in order.";
// The scope detail under the rule with urgency, and under the main rule, which reads one input fewer.
const SCOPE_DETAIL =
  "Being put in order is not a selection or an approval; it only means the record has enough detail to compare. Single places count among the 16 schools with every input recorded, and ranges among all 21 schools that can be put in order.";
const SCOPE_DETAIL_MAIN =
  "Being put in order is not a selection or an approval; it only means the record has enough detail to compare. Single places count among the 17 schools with a record for every input the rule uses, and ranges among all 22 schools that can be put in order.";

const statement = (page: import("@playwright/test").Page) => page.locator("[data-region=list-statement]");
const changed = (page: import("@playwright/test").Page) => page.locator("[data-region=what-changed]");
const search = (page: import("@playwright/test").Page) => new URL(page.url()).search;

test("a pasted link reproduces the screen, and the URL follows every change", async ({ page }) => {
  await openWorkspace(page, "?rule=additive_u&compare=additive_no_u&scope=1&guide=start");

  await expect(mainRule(page, RULE.urgency)).toHaveAttribute("aria-pressed", "true");
  await expect(changed(page).locator("[data-region=changed-lead]")).toHaveText(REASSURANCE);
  await expect(changed(page).locator("[data-region=changed-example]")).toHaveText(`Example${EXAMPLE_BACK}`);
  await expect(page.locator("#screening-scope-detail")).toHaveText(SCOPE_DETAIL);
  // The run's own counts: one school fewer can be put in order with urgency.
  await expect(tab(page, /The list/)).toHaveText("The list(21)");
  await expect(tab(page, /Incomplete records/)).toHaveText("Incomplete records(4)");

  await changed(page).getByRole("button", { name: "Hide this comparison" }).click();
  await expect(changed(page)).toHaveCount(0);
  expect(search(page)).toBe("?rule=additive_u&scope=1&guide=start");

  await tab(page, /Incomplete records/).click();
  await page.getByRole("button", { name: "Show less" }).waitFor({ state: "detached" });
  expect(search(page)).toBe("?rule=additive_u&view=queue&scope=1&guide=start");

  // The same link, opened again, is the same screen.
  await page.reload();
  await waitForMap(page);
  await expect(tab(page, /Incomplete records/)).toHaveAttribute("aria-selected", "true");
  await expect(mainRule(page, RULE.urgency)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`${INCOMPLETE} button`)).toHaveCount(4);
});

test("the statement shows under the main rule only, never beside What changed, and the way back restores it", async ({
  page,
}) => {
  await openWorkspace(page);
  // The main rule comes first in the switch, pressed.
  await expect(page.locator("[data-region=rule-switch] button").first()).toHaveText(`S0${RULE.main}`);
  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "true");
  await expect(statement(page)).toHaveText(`${STATEMENT} See what changes with the urgency value`);
  await expect(changed(page)).toHaveCount(0);

  // The statement's link opens What changed for the main rule against the rule with urgency, on the main rule's list.
  await statement(page).getByRole("button", { name: "See what changes with the urgency value" }).click();
  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "true");
  await expect(changed(page).locator("[data-region=changed-lead]")).toHaveText(REASSURANCE);
  await expect(changed(page).locator("[data-region=changed-example]")).toHaveText(`Example${EXAMPLE}`);
  await expect(statement(page)).toHaveCount(0);
  expect(search(page)).toBe("?compare=additive_u");
  // The screen is on the main rule already, so What changed offers no way back to it, only Hide.
  await expect(changed(page).getByRole("button", { name: "Back to the paper's main rule" })).toHaveCount(0);

  await changed(page).getByRole("button", { name: "Hide this comparison" }).click();
  await expect(changed(page)).toHaveCount(0);
  await expect(statement(page)).toHaveText(`${STATEMENT} See what changes with the urgency value`);
  expect(search(page)).toBe("");

  // The switch shows What changed too, and from the rule with urgency What changed has the way back.
  await mainRule(page, RULE.urgency).click();
  await expect(changed(page).locator("[data-region=changed-example]")).toHaveText(`Example${EXAMPLE_BACK}`);
  await changed(page).getByRole("button", { name: "Back to the paper's main rule" }).click();
  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "true");
  await expect(changed(page)).toHaveCount(0);
  await expect(statement(page)).toBeVisible();
  expect(search(page)).toBe("");

  // Hiding What changed leaves the rule's own line with a way back.
  await mainRule(page, RULE.urgency).click();
  await expect(changed(page)).toBeVisible();
  await changed(page).getByRole("button", { name: "Hide this comparison" }).click();
  const line = page.locator("[data-region=rule-role]");
  await expect(line).toHaveText(
    "The screening score adds up several factors, each with a fixed share, and urgency is one of them. A sensitivity check that puts the urgency value back, from the circulated paper. Back to the paper's main rule"
  );
  await expect(statement(page)).toHaveCount(0);
  await line.getByRole("button", { name: "Back to the paper's main rule" }).click();
  await expect(statement(page)).toBeVisible();
});

test("Other rules lists all seven, closes on a choice or on Escape, and the rule line names the choice", async ({
  page,
}) => {
  await openWorkspace(page);
  const button = page.getByRole("button", { name: "Other rules (5)" });
  const popover = page.locator("#screening-other-rules");

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(popover.getByRole("button")).toHaveCount(7);
  await expect(popover.getByRole("button", { pressed: true })).toContainText(RULE.main);
  await expect(popover.getByRole("button", { name: new RegExp(`^${RULE.needFirst}`) })).toContainText(
    "Urgency sensitivity, from the circulated paper"
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
  await expect(mainRule(page, RULE.urgency)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-region=rule-role]")).toContainText(
    "Need-first rule, with urgency. Schools go in order of school need"
  );
  expect(search(page)).toBe("?rule=need_first_u&compare=additive_no_u");
});

test("the scope line opens its detail in place, and a range row's place names the group it counts in", async ({
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
  await expect(page.locator("#screening-scope-detail")).toHaveText(SCOPE_DETAIL_MAIN);
  await less.click();
  await expect(page.locator("#screening-scope-detail")).toHaveCount(0);

  // A range row says which group it counts in, so its number never reads as a single place (R19).
  await expect(orderedRow(page, "Sample School 17").locator("[data-place]")).toHaveText("10thto17thof 22");
  await expect(orderedRow(page, "Sample School 25").locator("[data-place]")).toHaveText("22ndof 22");
  await expect(orderedRow(page, "Sample School 08").locator("[data-place]")).toHaveText("1st");

  // Under the need-first rule a range school sits at exactly 10th beside a complete school's 10th; the detail stays
  // the reader's to open.
  await page.goto("/screening?rule=need_first_u");
  await expect(orderedRow(page, "Sample School 17").locator("[data-place]")).toHaveText("10thof 21");
  await expect(orderedRow(page, "Sample School 07").locator("[data-place]")).toHaveText("10th");
  await expect(page.getByRole("button", { name: "Read more" })).toHaveAttribute("aria-expanded", "false");
  await waitForMap(page);
});

test("each row says why it sits there, and a range row names the reading it lacks", async ({ page }) => {
  await openWorkspace(page);
  const why = (name: string) => orderedRow(page, name).locator("[data-region=row-why]");
  await expect(why("Sample School 08")).toHaveText(
    "Why None of its 8 classrooms is built of permanent materials."
  );
  await expect(why("Sample School 12")).toHaveText("Why It has 1 teacher house for its 10 teachers.");
  const range = (what: string) =>
    `Why No ${what} is recorded for this school, so it is not counted as 0. The school shows a range of places instead of one place.`;
  await expect(why("Sample School 17")).toHaveText(range("air-quality reading"));
  await expect(why("Sample School 18")).toHaveText(range("land-cover figure"));
  await expect(why("Sample School 19")).toHaveText(range("nearby emissions figure"));
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
  await expect(before).toContainText("Sample School 05");
});

test("the incomplete records are grouped by province or by what is missing, with each row's missing details", async ({
  page,
}) => {
  // Under the rule with urgency, so the list holds a school held back only for its urgency value as well.
  await openWorkspace(page, "?rule=additive_u&view=queue");
  const headings = page.locator(`${INCOMPLETE} > li > div`);
  const rows = page.locator(`${INCOMPLETE} button`);
  const byProvince = page.getByRole("button", { name: "Province", exact: true });
  const byMissing = page.getByRole("button", { name: "Missing details" });
  await expect(byProvince).toHaveAttribute("aria-pressed", "true");
  await expect(headings).toHaveText(["North Province2", "South Province2"]);
  await expect(page.locator("[data-region=queue-order]")).toHaveText(
    "Listed by province, district and school name. This is not an order of priority."
  );
  await expect(rows.first()).toHaveText("Sample School 21 · North OneTeacher count blank");
  await expect(rows.nth(3).locator("[data-region=queue-chips] > span")).toHaveText([
    "Teacher count blank",
    "District figure missing or unusable",
    "Walking reach missing or unusable",
    "Urgency value not recorded",
  ]);

  // By what is missing: one heading per school's gap, the largest group first and then by heading; each row names
  // its district and province, since the heading names the gap.
  await byMissing.click();
  await expect(byMissing).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).searchParams.get("qgroup")).toBe("evidence");
  await expect(headings).toHaveText([
    "4 kinds of detail missing1",
    "Remoteness off the scale, needs checking1",
    "Teacher count blank1",
    "Urgency value not recorded1",
  ]);
  await expect(rows.first()).toContainText("Sample School 24 · South Two, South Province");
  // Each grouping says how the list is ordered.
  await expect(page.locator("[data-region=queue-order]")).toHaveText(
    "Grouped by what is missing, the largest group first. Within a group, listed by province, district and school name. This is not an order of priority."
  );

  // The arrow keys follow the groups on screen, not the order the rows arrived in.
  await rows.first().click();
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(rows.nth(1)).toContainText("Sample School 22");

  // A pasted link keeps the grouping.
  await page.reload();
  await expect(headings.first()).toHaveText("4 kinds of detail missing1");
});

test("the controller ignores invalid values, clears with null, reports each change and waits for the map", async ({
  page,
}) => {
  await page.goto("/screening");
  await waitForWorkspaceHook(page);
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
    ws.setState({ rule: "additive_u", view: "queue" });
    const after = ws.getState();
    ws.setState({ view: null });
    return { drawn, heard, rule: after.rule, view: after.view, end: ws.getState().view };
  });
  expect(report).toEqual({
    drawn: true,
    heard: ["additive_no_u>additive_u queue", "additive_u>additive_u ranked"],
    rule: "additive_u",
    view: "queue",
    end: "ranked",
  });
  await expect(mainRule(page, RULE.urgency)).toHaveAttribute("aria-pressed", "true");
  await expect(tab(page, /The list/)).toHaveAttribute("aria-selected", "true");
});
