/**
 * `safeNextPath` decides where the sign-in callback sends a person after signing in, from a `next` the address
 * carries. Failure mode: a value the browser resolves to another origin gets through, so the callback redirects a
 * signed-in person to a site the sender chose. Each rejected value below is one way to write that.
 */
import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth";

const ORIGIN = "https://app.test";
const resolves = (value: string) => new URL(value, ORIGIN).href;

describe("safeNextPath", () => {
  it.each([
    ["backslash after the slash, which a browser reads as a slash", "/\\evil.com"],
    ["slash, backslash, slash", "/\\/evil.com"],
    ["two slashes", "//evil.com"],
    ["a full URL", "https://evil.com"],
    ["a bare host", "evil.com"],
    ["a backslash first", "\\\\evil.com"],
    ["an encoded backslash", "/%5Cevil.com"],
    ["a double-encoded backslash", "/%255Cevil.com"],
    ["encoded slashes", "/%2F%2Fevil.com"],
    ["an encoded slash then a slash", "/%2F/evil.com"],
    ["a tab, which the URL parser removes", "/\t/evil.com"],
    ["a line feed", "/\n/evil.com"],
    ["a carriage return", "/\r/evil.com"],
    ["an encoded tab", "/%09/evil.com"],
    ["an encoded line feed", "/%0a/evil.com"],
    ["a null byte", "/\u0000/evil.com"],
    ["a control character after a path", "/screening\u0007"],
    ["a backslash inside a path", "/screening\\..\\evil.com"],
    ["an encoded form that does not decode", "/%E0%A4%A"],
    ["a lone percent sign before an encoded backslash", "/%%35Cevil.com"],
    ["an encoded percent sign before an encoded backslash", "/50%25%5Cevil.com"],
    ["nothing", ""],
  ])("refuses %s", (_name, value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it("refuses a missing value", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });

  // Each decoding can reveal a host, so a value still changing after the five decodings the check allows is refused
  // rather than accepted in its encoded form.
  const encodedTimes = (text: string, times: number) => {
    let encoded = text;
    for (let i = 0; i < times; i += 1) encoded = encodeURIComponent(encoded);
    return encoded;
  };
  it.each([
    [
      "five encodings of a backslash, which reach the backslash on the fifth decoding",
      "/%252525255Cevil.com",
    ],
    ["six encodings of a backslash", `/${encodedTimes("\\evil.com", 6)}`],
    ["eight encodings of a backslash", `/${encodedTimes("\\evil.com", 8)}`],
  ])("refuses %s", (_name, value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it.each([
    "/",
    "/screening",
    "/screening?rule=additive_no_u&guide=off",
    "/screening?rule=additive_no_u&k=20",
    "/screening?next=%2Fscreening",
    "/screening%3Frule%3Dadditive_no_u",
    "/screening#top",
    "/a//b",
    "/sign-in?error=allowlist",
    // An encoded percent sign decodes to a `%` that starts no escape, which every later decoding leaves alone.
    "/screening?x=50%25",
    "/screening?x=50%25&y=5%25",
  ])("keeps %s, which stays on this origin", (value) => {
    expect(safeNextPath(value)).toBe(value);
    expect(new URL(resolves(value)).origin).toBe(ORIGIN);
  });
});

/**
 * Failure mode for any change to the decoding: a value the check accepts reveals a host only after a decoding it did
 * not try. The oracle is independent of `safeNextPath`: it decodes every ASCII escape a pass at a time, `%5C` and the
 * legacy `%u005C` alike, as a sloppy server might, and requires each form to stay a path on this origin. The inputs
 * are random strings built from the pieces such values are made of, from a fixed seed, so a failure reproduces.
 */
describe("safeNextPath on random values", () => {
  // prettier-ignore
  const PIECES = [
    "/", "//", "\\", "%", "%%", "%25", "%2", "%5C", "%5c", "%2F", "%2f", "%09", "%0a", "%0D", "%00", "%7F", "%35",
    "5C", "2F", "25", "C", "%E0", "%A4", "%C3%A9", "%u005C", "\t", "\n", "\u007f", "evil.com", "screening", "?", "#",
    "&", "x=", "50", "..", ".", "@", ":",
  ];
  const HIDES = /[\\\u0000-\u001f\u007f]/;
  const decodeAscii = (text: string) =>
    text.replace(/%(?:u00)?([0-7][0-9a-fA-F])/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  const staysHere = (value: string) => {
    let form = value;
    for (let pass = 0; pass <= 8; pass += 1) {
      if (!form.startsWith("/") || form.startsWith("//") || HIDES.test(form)) return false;
      if (new URL(form, ORIGIN).origin !== ORIGIN) return false;
      form = decodeAscii(form);
    }
    return true;
  };
  // mulberry32: a small seeded generator, so every run tries the same values.
  const random = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it("accepts only values that stay a path on this origin through every decoding", () => {
    const next = random(20261021);
    const pick = () => PIECES[Math.floor(next() * PIECES.length)];
    const leaks: string[] = [];
    let kept = 0;
    for (let i = 0; i < 50_000; i += 1) {
      const length = 1 + Math.floor(next() * 7);
      const value = (next() < 0.85 ? "/" : "") + Array.from({ length }, pick).join("");
      const result = safeNextPath(value);
      if (result !== "/" && result !== value)
        leaks.push(`${JSON.stringify(value)} became ${JSON.stringify(result)}`);
      if (result === value && value !== "/") {
        kept += 1;
        if (!staysHere(value)) leaks.push(JSON.stringify(value));
      }
    }
    expect(leaks).toEqual([]);
    // The generator reaches both outcomes, so the property is not met by refusing everything.
    expect(kept).toBeGreaterThan(1_000);
  });
});
