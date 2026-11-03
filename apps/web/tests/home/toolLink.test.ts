/**
 * Which requests for `/` are old links to the tool.
 *
 * Failure modes, each with a row below:
 *  1. An old link with the workspace's state, or the guides', lands on the homepage and loses its view.
 *  2. The tool gets the link without its query, or with it changed.
 *  3. A homepage link that a sharing service tagged (`utm_*`, `fbclid`) is sent to the tool instead.
 *  4. A request for another page is redirected.
 */
import { describe, expect, it } from "vitest";

import { toolAddressFor } from "@/lib/home/toolLink";

const at = (address: string) => toolAddressFor(new URL(address, "https://rise.example.org"));

describe("old links to the tool at /", () => {
  it("go to the tool with their query unchanged, and nothing else does", () => {
    const cases: [string, string | null][] = [
      ["/", null],
      ["/?", null],
      ["/?rule=additive_u", "/screening?rule=additive_u"],
      ["/?school=4e65114f0b&prov=Morobe&dist=Lae", "/screening?school=4e65114f0b&prov=Morobe&dist=Lae"],
      ["/?guide=start", "/screening?guide=start"],
      ["/?guide=q2&gstep=1&present=1", "/screening?guide=q2&gstep=1&present=1"],
      ["/?q=St%20Mary%27s&view=queue", "/screening?q=St%20Mary%27s&view=queue"],
      // A key the tool does not read today: the tool ignores it, so sending it on costs nothing.
      ["/?ref=newsletter", "/screening?ref=newsletter"],
      ["/?utm_source=newsletter&utm_medium=email", null],
      ["/?fbclid=IwAR0abc", null],
      ["/?gclid=abc&msclkid=def", null],
      ["/?rule=additive_u&fbclid=IwAR0abc", "/screening?rule=additive_u&fbclid=IwAR0abc"],
      ["/screening?rule=additive_u", null],
      ["/sign-in?next=%2F%3Frule%3Dadditive_u", null],
    ];
    for (const [address, tool] of cases) expect(at(address), address).toBe(tool);
  });
});
