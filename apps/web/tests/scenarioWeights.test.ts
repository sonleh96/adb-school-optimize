import { describe, expect, it } from "vitest";

import { buildWeightGroups, normalizeWeightOverrides } from "@/lib/scenarioWeights";

describe("scenario weight normalization", () => {
  it("normalizes every numeric group to one", () => {
    expect(normalizeWeightOverrides({ need: { S: 2, A: 1, ignored: "bad" } })).toEqual({
      need: { S: 2 / 3, A: 1 / 3 },
    });
  });

  it("uses equal shares when a group sums to zero", () => {
    expect(normalizeWeightOverrides({ priority: { Need: 0, I: 0 } })).toEqual({
      priority: { Need: 0.5, I: 0.5 },
    });
  });

  it("falls back safely and keeps display ordering deterministic", () => {
    const fallback = { need: { S: 0.55, A: 0.25, R_phys: 0.2 } };
    expect(normalizeWeightOverrides({}, fallback)).toEqual(fallback);
    expect(buildWeightGroups({ other: { z: 1 }, need: { S: 1 } }).map((group) => group.label)).toEqual([
      "Need",
      "Other",
    ]);
  });
});
