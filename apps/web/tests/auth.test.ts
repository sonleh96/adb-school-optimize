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
  ])("keeps %s, which stays on this origin", (value) => {
    expect(safeNextPath(value)).toBe(value);
    expect(new URL(resolves(value)).origin).toBe(ORIGIN);
  });
});
