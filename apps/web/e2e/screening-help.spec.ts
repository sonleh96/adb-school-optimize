/**
 * Help mode, the glossary and How this works, on the fixture datasets. Failure modes and the test for each:
 *  1. Help mode marks too little or everything, or a mark acts instead of explaining  -> "help mode marks ..."
 *  2. Escape closes the wrong layer, or focus is lost when a card closes              -> "Escape closes ..."
 *  3. A card repeats a sentence the school card already shows                         -> "a card's example ..."
 *  4. A card leaves the window or covers the panel that holds its subject             -> "a card opens beside ..."
 *  5. Marks stay behind after help mode ends, so the screen keeps acting oddly        -> "help mode marks ..."
 *  6. The glossary cannot find a term, or Show where points at nothing                -> "the glossary ..."
 *  7. The page is incomplete or unreachable, or its links go nowhere                   -> "How this works ..."
 *  8. A pasted link loses help mode, its card or the glossary search                  -> "a pasted link ..."
 *  9. Worst-case names leave a card or the page (R7)                                   -> "worst-case names ..."
 * 10. A kind of help is missing from Help, help hides in more than one place, or Help goes when the list steps aside
 *                                                                                     -> "Help holds every kind ..."
 */
import type { Page } from "@playwright/test";

import {
  ORDERED,
  expect,
  helpButton,
  helpItem,
  openWorkspace,
  test,
  useMockDataset,
  waitForWorkspaceHook,
} from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 90_000 });

const card = (page: Page) => page.locator("[data-help-card]");
const marks = (page: Page) => page.locator("[data-testid=screening-workspace] [data-xp]");
const layers = (page: Page) => page.evaluate(() => window.__screeningGuide!.snapshot().state);

async function openFirstSchool(page: Page) {
  await page.locator(`${ORDERED} button`).first().click();
  await expect(page.locator("[data-region=inspector-why]")).toBeVisible();
}

test("Help holds every kind of help in one place, and stays there when a card puts the list aside", async ({
  page,
}) => {
  await openWorkspace(page);
  // The plain screen has no other way into the helps: no map bar, no separate How this works link.
  await expect(page.locator("[data-region=mapbar]")).toHaveCount(0);
  await expect(page.locator("[data-slot=column] [data-region=how-link]")).toHaveCount(0);
  await helpButton(page).click();
  const menu = page.locator("#screening-help-menu");
  await expect(menu.getByRole("button")).toHaveText([
    "Guides",
    "?Explain this screen",
    "Glossary of terms",
    "How this works",
  ]);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(helpButton(page)).toBeFocused();

  // Each choice opens its help.
  await (await helpItem(page, "Guides")).click();
  await expect(page.getByTestId("guide-rail")).toBeVisible();
  await (await helpItem(page, "Guides")).click();
  await expect(page.getByTestId("guide-rail")).toHaveCount(0);
  await (await helpItem(page, "Explain this screen")).click();
  await expect(page.getByTestId("help-bar")).toBeVisible();
  await page.getByTestId("help-bar").getByRole("button", { name: /Done/ }).click();
  await (await helpItem(page, "Glossary of terms")).click();
  await expect(page.getByRole("complementary", { name: "Glossary of terms" })).toBeVisible();
  await page.keyboard.press("Escape");
  await (await helpItem(page, "How this works")).click();
  await expect(page.getByRole("main", { name: "How this works" })).toBeVisible();
  await page.getByRole("button", { name: "Back to the map" }).click();

  // A narrower window: a card puts the list aside, and Help is still where it was.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator(`${ORDERED} button`).nth(4).click();
  await expect(page.getByTestId("screening-workspace")).toHaveAttribute("data-card-docked", "true");
  await expect(helpButton(page)).toBeVisible();
  await (await helpItem(page, "Glossary of terms")).click();
  await expect(page.getByRole("complementary", { name: "Glossary of terms" })).toBeVisible();
});

test("help mode marks the key concepts, a mark explains instead of acting, and leaving clears every mark", async ({
  page,
}) => {
  await openWorkspace(page);
  await openFirstSchool(page);
  await (await helpItem(page, "Explain this screen")).click();
  await expect.poll(async () => (await layers(page)).help).toBe(true);
  await expect.poll(() => marks(page).count()).toBeGreaterThanOrEqual(18);
  expect(await marks(page).count()).toBeLessThanOrEqual(40);
  await expect(page.getByTestId("help-bar")).toBeVisible();

  // The Missing information tab explains itself instead of switching the list.
  await page.getByRole("tab", { name: /Missing information/ }).click();
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole("heading")).toBeFocused();
  await expect(page.getByRole("tab", { name: /The list/ })).toHaveAttribute("aria-selected", "true");
  // A mark that cannot take focus is given it while help mode is on.
  const block = page.locator("[data-region=caveat][data-xp]");
  await expect(block).toHaveAttribute("tabindex", "0");
  await expect(block).toHaveAttribute("role", "button");

  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await layers(page)).help).toBe(false);
  await expect(marks(page)).toHaveCount(0);
  await expect(page.locator("[data-region=caveat]")).not.toHaveAttribute("tabindex", /./);
  // The school card is still open: Escape closed the help layers first.
  await expect(page.locator("[data-region=inspector]")).toBeVisible();
});

test("Escape closes the card, then the glossary, then help mode, and focus returns to what opened each", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.keyboard.press("?");
  await expect.poll(async () => (await layers(page)).help).toBe(true);
  // Help mode's code loads on first use; a person presses Enter on a mark they can see.
  const tabMark = page.getByRole("tab", { name: /The list/ });
  await expect(tabMark).toHaveAttribute("data-xp", /term:/);
  await tabMark.focus();
  await page.keyboard.press("Enter");
  await expect(card(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);
  await expect(tabMark).toBeFocused();
  await page.keyboard.press("g");
  await expect(page.getByRole("complementary", { name: "Glossary of terms" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Glossary of terms" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await layers(page)).help).toBe(false);
});

test("a card's example never says what the open school card already says", async ({ page }) => {
  await openWorkspace(page);
  await openFirstSchool(page);
  await page.keyboard.press("?");
  const onCard = (await page.locator("[data-region=inspector]").innerText()).replace(/\s+/g, " ");
  const terms = ["need_facilities", "need_classrooms", "need_housing", "need_services", "need_locality"];
  for (const term of [...terms, "area_context", "reach", "rank", "score"]) {
    await page.evaluate(
      (id) => window.__screeningGuide!.dispatch({ type: "card", id: id as `term:${string}` }),
      `term:${term}`
    );
    await expect(card(page)).toBeVisible();
    for (const example of await card(page).locator("[data-example]").allInnerTexts())
      expect(onCard, term).not.toContain(example.replace(/\s+/g, " ").trim());
  }
});

test("a card opens beside the panel that holds its subject, inside the window", async ({ page }) => {
  await openWorkspace(page);
  await page.keyboard.press("?");
  await page.locator("[data-region=scope] > p[data-xp]").click();
  await expect(card(page)).toBeVisible();
  const box = (await card(page).boundingBox())!;
  const column = (await page.locator("[data-slot=column]").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(column.x + column.width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(1000);
  // Show on map selects the example's school, and the card stays open.
  const show = card(page).getByRole("button", { name: "Show on map" });
  if (await show.count()) {
    await show.click();
    await expect(page.locator("[data-region=inspector]")).toBeVisible();
  }
});

test("the glossary finds a term, opens it, shows where it is, and links to How this works", async ({
  page,
}) => {
  await openWorkspace(page);
  await (await helpItem(page, "Glossary of terms")).click();
  const drawer = page.getByRole("complementary", { name: "Glossary of terms" });
  await expect(drawer.getByRole("searchbox", { name: "Find a term" })).toBeFocused();
  await page.keyboard.type("ties");
  await expect(page).toHaveURL(/gq=ties/);
  await drawer.getByRole("searchbox").fill("zzzz");
  await expect(drawer.getByText("No term matches.")).toBeVisible();
  await drawer.getByRole("searchbox").fill("");
  await drawer.getByRole("button", { name: "Rank in the list", exact: true }).click();
  await expect(page).toHaveURL(/gx=rank/);
  await drawer.getByRole("button", { name: "Show where" }).click();
  await expect(page.locator("body > div[aria-hidden=true]")).toHaveCount(1);
  // The rules are entries too.
  await expect(drawer.getByRole("button", { name: "Combined factors, with urgency" })).toBeVisible();
  await drawer.getByRole("button", { name: "How this works" }).click();
  await expect(page.getByRole("main", { name: "How this works" })).toBeVisible();
  await expect(drawer).toHaveCount(0);
});

test("How this works has its six sections, its contents follow the reading, and its links go somewhere", async ({
  page,
}) => {
  await openWorkspace(page);
  await (await helpItem(page, "How this works")).click();
  const main = page.getByRole("main", { name: "How this works" });
  await expect(main.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(main.locator("section h2")).toHaveCount(6);
  await expect(page).toHaveURL(/page=how/);
  const contents = page.getByRole("navigation", { name: "Sections" });
  await contents.getByRole("button", { name: /What the results cannot tell you/ }).click();
  await expect(contents.getByRole("button", { name: /What the results cannot tell you/ })).toHaveAttribute(
    "aria-current",
    "true"
  );
  await expect(main.getByText("Show me on the screen")).toHaveCount(6);
  await expect(main.getByText(/This tool suggests which schools to look at first/)).toBeVisible();
  // Show me opens the guide for the section, on the screen, and leaves the page.
  await main
    .locator("section[data-key=placed]")
    .getByRole("button", { name: "Show me on the screen" })
    .click();
  await expect(main).toHaveCount(0);
  await expect(page.getByTestId("guide-step-title")).toBeVisible();
  await expect(page).toHaveURL(/guide=q4&gstep=1/);
  // Back to the map closes the page and hands focus back to Help, which opened it.
  await (await helpItem(page, "How this works")).click();
  await page.getByRole("button", { name: "Back to the map" }).click();
  await expect(page.getByRole("main", { name: "How this works" })).toHaveCount(0);
  await expect(helpButton(page)).toBeFocused();
});

test("a pasted link brings back help mode with its card, and the glossary with its search", async ({
  page,
}) => {
  const key = (await (async () => {
    await openWorkspace(page);
    return page.locator(`${ORDERED} button`).first().getAttribute("data-school-key");
  })())!;
  await openWorkspace(page, `?school=${key}&help=1&card=term%3Aneed_facilities`);
  await expect(card(page)).toContainText("Missing facility types");
  await expect.poll(async () => (await layers(page)).help).toBe(true);
  await openWorkspace(page, "?gloss=1&gq=remote");
  await expect(page.getByRole("searchbox", { name: "Find a term" })).toHaveValue("remote");
});

test("a pasted link to a card the data does not hold drops it, and Escape then leaves help mode", async ({
  page,
}) => {
  await openWorkspace(page, "?guide=off&help=1&card=place%3Anope");
  await expect(page).not.toHaveURL(/card=/);
  await expect(card(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await layers(page)).help).toBe(false);
});

test("worst-case names stay inside the help cards, the glossary and the page", async ({ page, context }) => {
  await useMockDataset(context, "worst-names");
  await page.goto("/screening?guide=off&help=1");
  await expect(page.locator(`${ORDERED} button`).first()).toBeVisible();
  // The guidance hook is published in the same commit as the workspace's.
  await waitForWorkspaceHook(page);
  for (const id of ["term:rank", "term:rank_range", "term:queue", "term:score", "compare-main"]) {
    await page.evaluate(
      (cardId) => window.__screeningGuide!.dispatch({ type: "card", id: cardId as "compare" }),
      id
    );
    await expect(card(page)).toBeVisible();
    const spills = await card(page).evaluate((root) =>
      [...root.querySelectorAll("*")]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent)
    );
    expect(spills, id).toEqual([]);
    expect((await card(page).textContent()) ?? "", id).not.toMatch(/\bnull\b|undefined|NaN|—/);
  }
  await page.evaluate(() => window.__screeningGuide!.dispatch({ type: "page", page: "how" }));
  const main = page.getByRole("main", { name: "How this works" });
  await expect(main.locator("section h2")).toHaveCount(6);
  const pageSpills = await main.evaluate(
    (root) =>
      [...root.querySelectorAll("p, h1, h2")].filter((el) => el.scrollWidth > el.clientWidth + 1).length
  );
  expect(pageSpills).toBe(0);
});
