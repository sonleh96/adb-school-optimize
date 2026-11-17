/**
 * Failure modes of the request URL:
 *  1. An unset option is sent as the text "undefined", or an empty filter changes what the API returns.
 *  2. A school key with reserved characters breaks the path.
 *  3. Equal reads build different URLs, so the browser cache and the API's ETag never match.
 */
import { describe, expect, it } from "vitest";

import { screeningUrl } from "@/lib/screening/api";

describe("screeningUrl", () => {
  it("leaves unset and empty parameters out", () => {
    expect(screeningUrl("/results", { rule: "additive_u", placement: undefined, province: "" })).toBe(
      "/api/v1/screening/results?rule=additive_u"
    );
  });

  it("has no query string when nothing is set", () => {
    expect(screeningUrl("/rules", {})).toBe("/api/v1/screening/rules");
  });

  it("encodes values", () => {
    expect(screeningUrl("/results", { province: "North & South" })).toBe(
      "/api/v1/screening/results?province=North+%26+South"
    );
  });

  it("keeps the order the caller gave", () => {
    expect(screeningUrl("/compare", { a: "x", b: "y", package_version: "0.1.0" })).toBe(
      "/api/v1/screening/compare?a=x&b=y&package_version=0.1.0"
    );
  });
});
