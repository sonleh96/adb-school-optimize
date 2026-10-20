/**
 * Loading the on-demand copy survives a failed download.
 *
 * Failure modes, each with the test that catches it:
 *  1. A rejected load is kept, so every later call fails the same way until the page is reloaded.
 *  2. Two callers at once start two loads.
 *  3. A load that worked is run again on every call.
 */
import { describe, expect, it } from "vitest";

import { retryable } from "@/lib/screening/copy/once";

describe("a load that can fail", () => {
  it("is tried again after it fails, and the first caller sees the failure", async () => {
    let calls = 0;
    const load = retryable(async () => {
      calls += 1;
      if (calls === 1) throw new Error("chunk did not load");
      return "loaded";
    });
    await expect(load()).rejects.toThrow("chunk did not load");
    await expect(load()).resolves.toBe("loaded");
    expect(calls).toBe(2);
  });

  it("is started once for callers that ask together, and once more for none after it worked", async () => {
    let calls = 0;
    const load = retryable(async () => {
      calls += 1;
      return { calls };
    });
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toBe(b);
    expect(await load()).toBe(a);
    expect(calls).toBe(1);
  });

  it("gives every caller of a failed load the failure, then lets the next one try", async () => {
    let calls = 0;
    const load = retryable(async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return "ok";
    });
    const both = await Promise.allSettled([load(), load()]);
    expect(both.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toBe(1);
    await expect(load()).resolves.toBe("ok");
  });
});
