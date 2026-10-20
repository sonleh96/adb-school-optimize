/**
 * The column when a read fails, when the keyboard drives it, when the browser moves through its history and when the
 * rule changes faster than its list loads. Failure modes and the test for each:
 *  1. A URL that holds only defaults or junk is left as it was                -> "a URL that says nothing..."
 */
import type { Page } from "@playwright/test";

import { ORDERED, ORDERED_COUNT, expect, openWorkspace, test } from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

const search = (page: Page) => new URL(page.url()).search;

test("a URL that says nothing but defaults and junk is tidied, keeping the keys other layers own", async ({
  page,
}) => {
  await openWorkspace(page, "?view=bogus&rule=additive_u&scope=0&qgroup=zzz&guide=q1");
  await expect.poll(() => search(page)).toBe("?guide=q1");
  await expect(page.locator(`${ORDERED} button`)).toHaveCount(ORDERED_COUNT);
});
