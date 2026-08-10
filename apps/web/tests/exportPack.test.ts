import { describe, expect, it } from "vitest";

import { buildSchoolsCsv, createStoreZip } from "@/lib/exportPack";
import type { SchoolRecord } from "@/lib/types";

const school: SchoolRecord = {
  school_id: "school-1",
  school_name: '=HYPERLINK("https://example.org")',
  province: "NCD",
  district: "National Capital District",
  latitude: -9.44,
  longitude: 147.18,
  stage1_selected: null,
};

describe("briefing export", () => {
  it("protects text formulas without changing negative coordinates or null booleans", () => {
    const csv = buildSchoolsCsv([school]);
    expect(csv).toContain("'=");
    expect(csv).toContain("-9.440000");
    expect(csv).not.toContain(",false,-9.440000");
  });

  it("creates a store ZIP containing each requested filename", async () => {
    const archive = await createStoreZip([
      { name: "map.png", data: new Uint8Array([1, 2, 3]) },
      { name: "schools.csv", data: "school_name\r\nDemo\r\n" },
    ]);
    const bytes = new Uint8Array(await archive.arrayBuffer());
    const decoded = new TextDecoder().decode(bytes);

    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(decoded).toContain("map.png");
    expect(decoded).toContain("schools.csv");
  });
});
