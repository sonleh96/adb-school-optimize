/**
 * Failure modes of the one console message the browser tests ignore:
 *  1. The software GL driver note is not recognised, so a CI run without a GPU fails on it (the original defect).
 *  2. The pattern is wider than that note and hides a real problem: an error with the same words, another driver
 *     message, a warning from the page that merely mentions ReadPixels.
 */
import { describe, expect, it } from "vitest";

import { isSoftwareGlNote } from "../../e2e/console-noise";

const NOTE = "GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels";

describe("isSoftwareGlNote", () => {
  it("recognises the note as the browser words it, with and without its last line", () => {
    expect(isSoftwareGlNote({ type: "warning", text: `[.WebGL-0x140401004c00]${NOTE}` })).toBe(true);
    expect(
      isSoftwareGlNote({
        type: "warning",
        text: `[.WebGL-0x1c00992600]${NOTE} (this message will no longer repeat)`,
      })
    ).toBe(true);
  });

  it.each([
    ["an error with the same words", { type: "error", text: `[.WebGL-0x1c00992600]${NOTE}` }],
    [
      "another driver message",
      {
        type: "warning",
        text: "[.WebGL-0x1c00992600]GL Driver Message (OpenGL, Error, GL_INVALID_OPERATION, High): bad",
      },
    ],
    [
      "the same note at another severity",
      { type: "warning", text: `[.WebGL-0x1c00992600]${NOTE}`.replace("High", "Low") },
    ],
    ["a page warning that mentions it", { type: "warning", text: `The map reported: ${NOTE}` }],
    [
      "the note with something after it",
      { type: "warning", text: `[.WebGL-0x1c00992600]${NOTE}. Context lost` },
    ],
    [
      "a page error about ReadPixels",
      { type: "error", text: "gl.readPixels failed: GPU stall due to ReadPixels" },
    ],
  ])("does not hide %s", (_name, message) => {
    expect(isSoftwareGlNote(message)).toBe(false);
  });
});
