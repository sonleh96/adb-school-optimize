/**
 * Collisions the whole-stack acceptance run found at the sizes notes/final.md specifies ("Responsive layout"), each
 * checked at the size it occurs. Failure modes and the test for each:
 *  1. At 1024 with the rail open, the actions cover the column's masthead and Help, or anything covers the hint                                   -> "at 1024 by 768 with the rail open..."
 *  2. At 1024 with the rail and a card open, the card covers the key, its Key button and the caveat
 *     -> "at 1024 by 768 with the rail and a card open..."
 *  3. In the narrow layout, Other rules opens past the window's right edge and cuts rules off
 *     -> "Other rules stays in the window..."
 *  4. At 200 percent zoom the rail's start pins its foot over the guides, so none can be started and the saved
 *     view's name is cut off; on a phone or at 768 the start list covers the list or is covered by it, clips a guide,
 *     or Hide does not bring the list up
 *     -> "the rail's start lets every guide..." and "the start list sits in the list region..."
 *  5. In the narrow layout, help mode's bar sits under the key -> "help mode's bar..."
 *  6. Compare mode's chart heading squeezes its middle caption to one word a line -> "compare mode's chart heading..."
 *  7. With the method details on, help mode widens the map bar into the actions (1440), or, with the rail open and
 *     compare mode's wide column (1280), the map bar runs past the window and the help bar rises into it
 *     -> "help mode with the method details on..."
 */
import type { Locator, Page } from "@playwright/test";

import {
  ORDERED,
  expect,
  helpItem,
  keyOf,
  openRules,
  openWorkspace,
  test,
  waitForMap,
} from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

interface Box {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The boxes of what `named` finds and the page shows. A hidden or empty element is left out. */
async function boxes(page: Page, named: Record<string, string>): Promise<Box[]> {
  return page.evaluate((named) => {
    return Object.entries(named).flatMap(([name, selector]) =>
      [...document.querySelectorAll(selector)].flatMap((el) => {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)
          return [];
        const r = el.getBoundingClientRect();
        return r.width && r.height
          ? [{ name, left: r.left, top: r.top, right: r.right, bottom: r.bottom }]
          : [];
      })
    );
  }, named);
}

const overlap = (a: Box, b: Box) =>
  a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

/** Waits for the panels to stop moving, then no two of `named` overlap and each lies inside the window. */
async function expectApart(page: Page, named: Record<string, string>, expected: readonly string[]) {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const found = await boxes(page, named);
  expect(found.map((b) => b.name).sort()).toEqual([...expected].sort());
  const size = page.viewportSize()!;
  const problems: string[] = [];
  for (const box of found) {
    if (box.left < -1 || box.top < -1 || box.right > size.width + 1 || box.bottom > size.height + 1)
      problems.push(`${box.name} leaves the window`);
  }
  for (let i = 0; i < found.length; i += 1)
    for (let j = i + 1; j < found.length; j += 1)
      if (overlap(found[i], found[j])) problems.push(`${found[i].name} overlaps ${found[j].name}`);
  expect(problems).toEqual([]);
}

/** Nothing covers the element: the point at its centre hits it, or something inside it. */
async function expectUncovered(target: Locator, name: string) {
  const top = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && (el === hit || el.contains(hit)) ? "itself" : (hit?.outerHTML.slice(0, 100) ?? "nothing");
  });
  expect(top, `what covers ${name}`).toBe("itself");
}

const COLUMN = "section[data-slot=column]:not([data-aside])";
const ACTIONS = "[data-region=actions]";
const MAP_BAR = "[data-region=mapbar]";
const HINT = "#slot-hint";
const ZOOM = ".maplibregl-ctrl-top-left .maplibregl-ctrl-group";
const RAIL = "[data-testid=guide-rail]";

test.describe("at 1024 by 768 with the rail open", () => {
  test.use({ viewport: { width: 1024, height: 768 }, firstVisit: true });

  for (const [state, search] of [
    ["at its start", ""],
    ["while presenting", "?guide=q1&gstep=1&present=1"],
  ] as const) {
    test(`at 1024 by 768 with the rail open ${state}, the actions and the hint stay clear of the column and each other`, async ({
      page,
    }) => {
      await openWorkspace(page, search || "?");
      await expect(page.locator(RAIL)).toBeVisible();
      await expect(page.locator(HINT)).toBeVisible();
      await expectApart(
        page,
        // The plain screen has no map bar: every kind of help is under Help, at the top of the column.
        { column: COLUMN, actions: ACTIONS, mapbar: MAP_BAR, hint: HINT, zoom: ZOOM, rail: RAIL },
        ["column", "actions", "hint", "zoom", "rail"]
      );
      for (const action of await page.locator(`${ACTIONS} button`).all())
        await expectUncovered(action, (await action.textContent()) ?? "an action");
    });
  }
});

test.describe("at 1024 by 768 with the rail and a card open", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("at 1024 by 768 with the rail and a card open, the card leaves the key, its Key button and the caveat clear", async ({
    page,
  }) => {
    await page.goto(`/screening?school=${keyOf("additive_no_u", "Sample School 08")}&guide=start`);
    await waitForMap(page);
    await expect(page.locator(RAIL)).toBeVisible();
    await expect(page.locator("[data-slot=school-card]")).toBeVisible();
    await expectApart(
      page,
      {
        card: "[data-slot=school-card]",
        key: "[data-slot=legend]",
        caveat: "[data-region=caveat]",
        actions: ACTIONS,
        mapbar: MAP_BAR,
        rail: RAIL,
      },
      ["card", "key", "caveat", "actions", "rail"]
    );
    await expectUncovered(page.locator("[data-slot=legend] button"), "the Key button");
    await expectUncovered(page.locator("[data-region=caveat]"), "the caveat");
  });
});

for (const size of [
  { name: "768 by 1024", width: 768, height: 1024, scale: 1 },
  { name: "1600 by 1000 at 200 percent", width: 800, height: 500, scale: 2 },
]) {
  test.describe(`at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.scale });

    test(`Other rules stays in the window at ${size.name}, and each of its rules can be reached`, async ({
      page,
    }) => {
      await openWorkspace(page);
      await openRules(page);
      await page.locator("[aria-controls=screening-other-rules]").click();
      const pop = page.locator("#screening-other-rules");
      await expect(pop).toBeVisible();
      await expectApart(page, { pop: "#screening-other-rules" }, ["pop"]);
      const items = pop.locator("button");
      expect(await items.count()).toBe(7);
      for (const item of await items.all()) {
        await item.scrollIntoViewIfNeeded();
        await expectUncovered(item, (await item.textContent()) ?? "a rule");
      }
    });
  });
}

test.describe("the rail's start at 200 percent zoom", () => {
  test.use({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 2, firstVisit: true });

  test("the rail's start lets every guide, the saved view's name and Hide be reached at 200 percent zoom", async ({
    page,
  }) => {
    await openWorkspace(page, "?");
    const rail = page.locator(RAIL);
    // Start here is a short card at the head of the list region; Open the guides unfolds the five under it.
    await rail.locator("[data-region=open-guides]").click();
    await expect(rail.locator("button[data-guide]")).toHaveCount(5);
    for (const target of [
      ...(await rail.locator("button[data-guide]").all()),
      rail.getByRole("textbox", { name: "Name this view" }),
      rail.getByRole("button", { name: "Save this view" }),
      rail.locator("[data-region=hide-guides]"),
    ]) {
      await target.scrollIntoViewIfNeeded();
      // Wholly inside the window, and not under the top bar, the switch or anything else.
      await expect(target).toBeInViewport({ ratio: 1 });
      await expectUncovered(target, (await target.textContent()) || "the name field");
    }
  });
});

for (const size of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
]) {
  test.describe(`the start list on a first visit at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size, firstVisit: true });

    test(`at ${size.width} by ${size.height} the start list sits in the list region: nothing covers it, it covers nothing, and Hide brings the list up`, async ({
      page,
    }) => {
      await openWorkspace(page, "?");
      const rail = page.locator(RAIL);
      // It sits in the list region, under the switch, which scrolls as one; folded, it is one line and two controls.
      const region = (await page.locator("[data-slot=column]").boundingBox())!;
      const switchBox = (await page.locator("[data-region=pane-switch]").boundingBox())!;
      const railBox = (await rail.boundingBox())!;
      expect(railBox.y).toBeGreaterThanOrEqual(switchBox.y + switchBox.height - 1);
      expect(railBox.y).toBeGreaterThanOrEqual(region.y - 1);
      expect(railBox.x).toBeGreaterThanOrEqual(0);
      expect(railBox.x + railBox.width).toBeLessThanOrEqual(size.width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth)).toBe(
        true
      );
      await rail.locator("[data-region=open-guides]").click();
      await expect(rail.locator("button[data-guide]")).toHaveCount(5);
      // Hide and every guide can be read and pressed where they are, once scrolled to.
      const hide = rail.getByRole("button", { name: "Hide the guides" });
      await expectUncovered(hide, "Hide");
      for (const guide of await rail.locator("button[data-guide]").all()) {
        await guide.scrollIntoViewIfNeeded();
        await expectUncovered(guide, (await guide.getAttribute("data-guide")) ?? "a guide");
      }
      // The list follows the start list in the same region, uncovered.
      const first = page.locator(`${ORDERED} button`).first();
      await first.scrollIntoViewIfNeeded();
      await expectUncovered(first, "the first school");

      // Hide takes the start list away; the list's first school comes up into the window.
      await hide.scrollIntoViewIfNeeded();
      await hide.click();
      await expect(rail).toHaveCount(0);
      await page.locator("[data-slot=column]").evaluate((column) => column.scrollTo({ top: 0 }));
      await expect(first).toBeInViewport();
      await expectUncovered(first, "the first school");
    });
  });
}

for (const state of [
  {
    name: "at 1280 by 800 with the rail open in compare mode",
    viewport: { width: 1280, height: 800 },
    search: "?analyst=1&mode=compare&rule=bottleneck_no_u&compare=additive_no_u&guide=start",
    rail: true,
  },
  { name: "at 1440 by 900", viewport: { width: 1440, height: 900 }, search: "?analyst=1", rail: false },
]) {
  test.describe(`help mode with the method details on ${state.name}`, () => {
    test.use({ viewport: state.viewport });

    test(`help mode with the method details on ${state.name}: the map bar, the help bar, the actions and the zoom buttons stay apart and in the window`, async ({
      page,
    }) => {
      await openWorkspace(page, state.search);
      await (await helpItem(page, "Explain this screen")).click();
      await expect(page.getByTestId("help-bar")).toBeVisible();
      const named: Record<string, string> = {
        column: COLUMN,
        actions: ACTIONS,
        mapbar: MAP_BAR,
        helpbar: "[data-testid=help-bar] > div",
        zoom: ZOOM,
        key: "[data-slot=legend]",
      };
      if (state.rail) named.rail = RAIL;
      await expectApart(page, named, Object.keys(named));
      await expectUncovered(page.getByTestId("help-bar").getByRole("button", { name: /Done/ }), "Done");
    });
  });
}

test.describe("help mode in the narrow layout", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("help mode's bar sits clear of the key in the narrow layout, and Done can be pressed", async ({
    page,
  }) => {
    await openWorkspace(page);
    await (await helpItem(page, "Explain this screen")).click();
    const bar = page.getByTestId("help-bar");
    await expect(bar).toBeVisible();
    // The list alone: the bar keeps to the window's foot, over the list, and Done can be pressed.
    await expect(bar).toBeInViewport({ ratio: 1 });
    await expectUncovered(bar.getByRole("button", { name: /Done/ }), "Done");
    // With the map band open, the bar sits above the key, clear of it.
    await page.locator("[data-region=pane-switch]").getByRole("button", { name: "Map", exact: true }).click();
    await expect(page.locator("[data-slot=legend]")).toBeVisible();
    await expectApart(page, { bar: "[data-testid=help-bar] > div", key: "[data-slot=legend]" }, [
      "bar",
      "key",
    ]);
    await expectUncovered(bar.getByRole("button", { name: /Done/ }), "Done");
    await expectUncovered(page.locator("[data-slot=legend] button"), "the Key button");
  });
});

for (const size of [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
]) {
  test.describe(`compare mode at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size });

    test(`compare mode's chart heading gives its middle caption room at ${size.width} by ${size.height}`, async ({
      page,
    }) => {
      await openWorkspace(page, "?analyst=1&mode=compare&rule=bottleneck_no_u&compare=additive_no_u");
      const head = page.locator("[data-region=slope-chart] [class*=slopeHead]");
      const caption = head.locator("[class*=capMid]");
      await expect(caption).toBeAttached();
      // Two lines at most (16 px each), so the chart is not pushed down by a word a line.
      const box = (await caption.boundingBox())!;
      expect(box.height, `caption ${Math.round(box.width)} px wide`).toBeLessThanOrEqual(34);
      const parts = await head.evaluate((el) =>
        [...el.children].map((child, i) => {
          const r = child.getBoundingClientRect();
          return { name: `part ${i}`, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        })
      );
      const problems = parts.flatMap((a, i) =>
        parts.slice(i + 1).flatMap((b) => (overlap(a, b) ? [`${a.name} overlaps ${b.name}`] : []))
      );
      expect(problems).toEqual([]);
    });
  });
}
