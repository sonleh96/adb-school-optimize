/**
 * The workspace's text inks, read from its stylesheet. Failure modes, each with the test that catches it:
 *  1. The lightest text reads as faint: first-time testers called it so at 6.2:1 on the white panels where most of
 *     it sits, so it keeps 7:1 there                                   -> "the lightest text..."
 *  2. The lightest text falls under 4.5:1 on another surface it sits on: the paper, the rail or a switch's track
 *                                                                        -> "the lightest text..."
 *  3. The lightest ink comes so close to the second that the two levels of text look the same
 *                                                                        -> "the three inks..."
 *  4. The sign-in page's copy of a token drifts from the workspace's    -> "the sign-in page..."
 *  5. The homepage's copy of a token drifts from the workspace's        -> "the homepage's colours share..."
 *  6. A homepage text colour falls under 4.5:1 on a surface it sits on, or its text on the navy band, the navy card
 *     and the footer under 7:1                                          -> "the homepage's colours keep..."
 *  7. The explore page's copy of a token drifts from the workspace's, or its dots leave the map's ramp
 *                                                                        -> "the explore page's colours share..."
 *  8. An explore dot falls under 3:1 on its card, or the marked school's dot under 3:1 against the others, so it
 *     cannot be told apart by its colour                                -> "the explore page's marks keep..."
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/lib/screening/contrast";
import { RAMP_HEX } from "@/lib/screening/marks";

const tokensOf = (file: string): Record<string, string> =>
  Object.fromEntries(
    [
      ...readFileSync(path.resolve(__dirname, "../..", file), "utf8").matchAll(
        /--([\w-]+):\s*(#[0-9a-f]{3,6})\b/gi
      ),
    ].map((m) => [m[1], m[2].toLowerCase()])
  );
const WORKSPACE = tokensOf("components/screening/screening.module.css");
const SIGN_IN = tokensOf("app/sign-in/sign-in.module.css");
const HOME = tokensOf("app/home.module.css");
const EXPLORE = tokensOf("components/explore/explore.module.css");
const hex = (value: string) => (value === "#fff" ? "#ffffff" : value);

describe("the workspace's inks", () => {
  it("keep the lightest text at 7:1 on the white panels and 4.5:1 on every other surface it sits on", () => {
    expect(contrastRatio(WORKSPACE["ink-3"], hex(WORKSPACE.panel))).toBeGreaterThanOrEqual(7);
    for (const surface of ["paper", "rail-bg", "track"])
      expect(contrastRatio(WORKSPACE["ink-3"], WORKSPACE[surface]), surface).toBeGreaterThanOrEqual(4.5);
  });

  it("the three inks stay three levels, each lighter than the one before", () => {
    const onPanel = (ink: string) => contrastRatio(WORKSPACE[ink], hex(WORKSPACE.panel));
    expect(onPanel("ink")).toBeGreaterThan(onPanel("ink-2"));
    expect(onPanel("ink-2")).toBeGreaterThan(onPanel("ink-3"));
    expect(contrastRatio(WORKSPACE["ink-2"], WORKSPACE["ink-3"])).toBeGreaterThanOrEqual(1.25);
  });

  it("are the same on the sign-in page", () => {
    const shared = Object.keys(SIGN_IN).filter((k) => k in WORKSPACE);
    expect(shared).toEqual(expect.arrayContaining(["ink", "ink-2", "ink-3", "paper", "navy"]));
    for (const k of shared) expect(SIGN_IN[k], k).toBe(WORKSPACE[k]);
  });
});

describe("the homepage's colours", () => {
  it("share the workspace's values for the tokens both use", () => {
    const shared = Object.keys(HOME).filter((k) => k in WORKSPACE);
    expect(shared).toEqual(
      expect.arrayContaining(["paper", "panel", "ink", "ink-2", "ink-3", "navy", "navy-2"])
    );
    for (const k of shared) expect(HOME[k], k).toBe(WORKSPACE[k]);
  });

  it("keep each text colour readable on every surface it sits on", () => {
    const ratio = (ink: string, surface: string) => contrastRatio(hex(HOME[ink]), hex(HOME[surface]));
    // The light bands and cards: body text, the lightest text, the eyebrows and figures, and the headline's accent.
    for (const surface of ["paper", "panel", "navy-tint"])
      for (const ink of ["ink", "ink-2", "ink-3", "navy", "navy-2"])
        expect(ratio(ink, surface), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    // The navy band, the navy card, the footer and the near-black panel carry body text, so they keep 7:1.
    for (const surface of ["navy", "ink"])
      for (const ink of ["on-navy", "on-navy-2"])
        expect(ratio(ink, surface), `${ink} on ${surface}`).toBeGreaterThanOrEqual(7);
  });
});

describe("the explore page's colours", () => {
  it("share the workspace's values for the tokens both use, and take their dots from the map's ramp", () => {
    const shared = Object.keys(EXPLORE).filter((k) => k in WORKSPACE);
    expect(shared).toEqual(
      expect.arrayContaining(["paper", "panel", "ink", "ink-2", "ink-3", "navy", "navy-2"])
    );
    for (const k of shared) expect(EXPLORE[k], k).toBe(WORKSPACE[k]);
    expect(EXPLORE["mark-chosen"]).toBe(RAMP_HEX[0].toLowerCase());
    expect(EXPLORE["mark-other"]).toBe(RAMP_HEX[RAMP_HEX.length - 1].toLowerCase());
  });

  it("the explore page's marks keep 3:1 on the card, and the marked school's 3:1 against every other dot", () => {
    for (const mark of ["mark-chosen", "mark-other"])
      expect(contrastRatio(EXPLORE[mark], hex(EXPLORE.panel)), mark).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(EXPLORE["mark-chosen"], EXPLORE["mark-other"])).toBeGreaterThanOrEqual(3);
    for (const surface of ["paper", "panel"])
      for (const ink of ["ink", "ink-2", "ink-3", "navy"])
        expect(
          contrastRatio(EXPLORE[ink], hex(EXPLORE[surface])),
          `${ink} on ${surface}`
        ).toBeGreaterThanOrEqual(4.5);
  });
});
