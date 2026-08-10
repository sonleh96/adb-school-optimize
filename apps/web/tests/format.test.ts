import { describe, expect, it } from "vitest";

import {
  formatCoordinate,
  formatDistrictIndicator,
  formatNumber,
  formatPercent,
  formatScore,
  formatScoreDelta,
} from "@/lib/format";

describe("shared formatters", () => {
  it("uses consistent fallbacks and score scaling", () => {
    expect(formatNumber(null)).toBe("n/a");
    expect(formatScore(0.824)).toBe("82.4");
    expect(formatScoreDelta(0.824, 0.8)).toBe("+2.4 pts");
  });

  it("formats percentages, coordinates, and district units", () => {
    expect(formatPercent(0.625)).toBe("62.5%");
    expect(formatCoordinate(-9.44)).toBe("-9.440000");
    expect(formatDistrictIndicator("Fixed broadband download speed", 12.4)).toBe("12.4 Mbps");
  });
});
