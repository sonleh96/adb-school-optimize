/**
 * Collisions the whole-stack acceptance run found at the sizes notes/final.md specifies ("Responsive layout"), each
 * checked at the size it occurs. Failure modes and the test for each:
 *  1. At 1024 with the rail open, the actions cover the column's masthead and "How this works", or the map bar
 *     covers the hint                                   -> "at 1024 by 768 with the rail open..."
 *  2. At 1024 with the rail and a card open, the card covers the key, its Key button and the caveat
 *     -> "at 1024 by 768 with the rail and a card open..."
 *  3. In the narrow layout, Other rules opens past the window's right edge and cuts rules off
 *     -> "Other rules stays in the window..."
 *  4. At 200 percent zoom the rail's start pins its foot over the guides, so none can be started and the saved
 *     view's name is cut off; at 768 more guides sit below the fold with no sign of them
 *     -> "the rail's start lets every guide..." and "the rail's start shows that more..."
 *  5. In the narrow layout, help mode's bar sits under the key -> "help mode's bar..."
 *  6. Compare mode's chart heading squeezes its middle caption to one word a line -> "compare mode's chart heading..."
 *  7. With the method details on, help mode widens the map bar into the actions (1440), or, with the rail open and
 *     compare mode's wide column (1280), the map bar runs past the window and the help bar rises into it
 *     -> "help mode with the method details on..."
 */
import type { Locator, Page } from "@playwright/test";

import { expect, keyOf, openWorkspace, test, waitForMap } from "./screening-helpers";

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
    test(`at 1024 by 768 with the rail open ${state}, the actions, the map bar and the hint stay clear of the column and each other`, async ({
      page,
    }) => {
      await openWorkspace(page, search || "?");
      await expect(page.locator(RAIL)).toBeVisible();
      await expect(page.locator(HINT)).toBeVisible();
      await expectApart(
        page,
        { column: COLUMN, actions: ACTIONS, mapbar: MAP_BAR, hint: HINT, zoom: ZOOM, rail: RAIL },
        ["column", "actions", "mapbar", "hint", "zoom", "rail"]
      );
      await expectUncovered(page.locator(`${COLUMN} [data-region=how-link]`), "How this works");
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
      ["card", "key", "caveat", "actions", "mapbar", "rail"]
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

  test("the rail's start lets every guide, the saved view's name and Explore on my own be reached at 200 percent zoom", async ({
    page,
  }) => {
    await openWorkspace(page, "?");
    const rail = page.locator(RAIL);
    await expect(rail.locator("button[data-guide]")).toHaveCount(5);
    for (const target of [
      ...(await rail.locator("button[data-guide]").all()),
      rail.getByRole("textbox", { name: "Name this view" }),
      rail.getByRole("button", { name: "Save this view" }),
      rail.getByRole("button", { name: "Explore on my own" }),
    ]) {
      await target.scrollIntoViewIfNeeded();
      const box = (await target.boundingBox())!;
      const band = (await rail.boundingBox())!;
      // Wholly inside the band the rail takes, and not under anything pinned in it.
      expect(box.y).toBeGreaterThanOrEqual(band.y - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(band.y + band.height + 1);
      await expectUncovered(target, (await target.textContent()) || "the name field");
    }
  });
});

test.describe("the rail's start at 768 by 1024", () => {
  test.use({ viewport: { width: 768, height: 1024 }, firstVisit: true });

  test("the rail's start shows that more lies below while it does, at 768 by 1024", async ({ page }) => {
    await openWorkspace(page, "?");
    const rail = page.locator(RAIL);
    await expect(rail.locator("button[data-guide]")).toHaveCount(5);
    // The part of the rail that scrolls, whichever element that is.
    await rail.evaluate((el) => {
      const scrolling = [el, ...el.querySelectorAll("*")].filter(
        (node) =>
          ["auto", "scroll"].includes(getComputedStyle(node).overflowY) &&
          node.scrollHeight > node.clientHeight
      );
      scrolling[0]?.setAttribute("data-test-scroller", "");
    });
    const box = rail.locator("[data-test-scroller]");
    await expect(box).toHaveCount(1);
    const more = await box.evaluate((el) => el.scrollHeight > el.clientHeight + 40);
    expect(more).toBe(true);
    // The rail's own paper at the scroller's bottom edge, left of the content's padding: shaded while more lies below,
    // plain at the end.
    const edge = async () => {
      const at = (await box.boundingBox())!;
      const png = await page.screenshot({
        clip: { x: at.x + 2, y: at.y + at.height - 6, width: 6, height: 4 },
      });
      return page.evaluate(async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const { data: px } = context.getImageData(0, 0, image.width, image.height);
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
        return sum / (px.length / 4) / 3;
      }, png.toString("base64"));
    };
    const shaded = await edge();
    await box.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForTimeout(100);
    const plain = await edge();
    expect(
      plain - shaded,
      `edge brightness: ${shaded.toFixed(1)} with more below, ${plain.toFixed(1)} at the end`
    ).toBeGreaterThan(4);
  });
});

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
      await page
        .getByRole("toolbar")
        .getByRole("button", { name: /Explain this screen/ })
        .click();
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
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page
      .getByRole("group", { name: "Menu" })
      .getByRole("button", { name: "Explain this screen" })
      .click();
    const bar = page.getByTestId("help-bar");
    await expect(bar).toBeVisible();
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
