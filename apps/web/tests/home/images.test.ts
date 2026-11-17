/**
 * The homepage's pictures and their credits.
 *
 * Failure modes, each with the test that catches it:
 *  1. A picture is added to public/images with no record of where it came from or what licence it carries
 *                                                                          -> "every picture in public/images..."
 *  2. The credit the page shows for an outside picture drifts from the one CREDITS.md records, so the two disagree
 *     about what the licence asks                                          -> "the credits the page shows..."
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HOME } from "@/lib/home/copy";

const IMAGES = path.resolve(__dirname, "../../public/images");
const credits = () => readFileSync(path.join(IMAGES, "CREDITS.md"), "utf8");

describe("the homepage's pictures", () => {
  it("every picture in public/images has an entry in CREDITS.md", () => {
    const pictures = readdirSync(IMAGES).filter((file) => file !== "CREDITS.md" && !file.startsWith("."));
    expect(pictures.length).toBeGreaterThan(0);
    for (const picture of pictures) expect(credits(), picture).toContain(`\`${picture}\``);
  });

  it("the credits the page shows are the ones CREDITS.md records, word for word", () => {
    expect(HOME.images.credits.length).toBeGreaterThan(0);
    for (const credit of HOME.images.credits) expect(credits()).toContain(`"${credit.text}"`);
  });
});
