/**
 * The homepage's counts, read from the screening API. The API is another service, so these tests stand a small
 * HTTP server in for it and serve its own saved responses.
 *
 * Failure modes, each with the test that catches it:
 *  1. The page shows the wrong group: all records as "can be put in order", or the range schools left out of it
 *                                                                          -> "a list's groups..."
 *  2. A body without the groups, or with groups that do not add up, reaches the page as numbers that contradict
 *     each other; or an empty run, before the data is loaded, reaches it as "0 records"
 *                                                                          -> "a body without..."
 *  3. The read asks for some other list than the main rule's, whose groups can differ
 *                                                                          -> "reads the main rule's list..."
 *  4. An API that is down, refuses, answers with an error or never answers stops or stalls the page instead of
 *     leaving it without numbers                                          -> "no numbers when..."
 */
// @vitest-environment node
import { type AddressInfo, createServer as createNetServer } from "node:net";
import { type Server, createServer } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { UNKNOWN_COUNTS, countsFromBody, readHomeCounts } from "@/lib/home/counts";
import { ParseError } from "@/lib/screening/schema";

import { readFixture } from "../screening/fixtures";

type Answer = (path: string) => { status: number; body: string } | null;

let server: Server | null = null;
const asked: string[] = [];

/** An API at a local port that answers each request with `answer`, or never answers when it gives null. */
async function api(answer: Answer): Promise<string> {
  server = createServer((request, response) => {
    asked.push(request.url ?? "");
    const reply = answer(request.url ?? "");
    if (!reply) return;
    response.writeHead(reply.status, { "Content-Type": "application/json" });
    response.end(reply.body);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

/** A port nothing listens on: taken from the system, then let go. */
async function closedPort(): Promise<string> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

const savedList = () =>
  readFixture("results/additive_no_u.json") as { manifest: { cohort_counts: Record<string, number> } };

afterEach(async () => {
  asked.length = 0;
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
  vi.restoreAllMocks();
});

describe("the homepage's counts", () => {
  it("a list's groups give every record, the schools that can be put in order, and the records to verify", () => {
    const body = savedList();
    const g = body.manifest.cohort_counts;
    // Put in order: one rank (complete) or a range of ranks (interval). To verify: the verification queue.
    expect(countsFromBody(body)).toEqual({
      kind: "known",
      records: g.records,
      inOrder: g.complete + g.interval,
      toVerify: g.verification_queue,
    });
  });

  it("a body without the groups, with groups that do not add up, or with no records gives no numbers", () => {
    const withGroups = (groups: Record<string, unknown>) => ({
      ...savedList(),
      manifest: { cohort_counts: groups },
    });
    const { records, complete, interval, verification_queue } = savedList().manifest.cohort_counts;
    for (const body of [
      readFixture("results/additive_no_u.json", "empty"),
      { manifest: {} },
      withGroups({ records: records + 1, complete, interval, verification_queue }),
      withGroups({ records, complete, interval, verification_queue: String(verification_queue) }),
      withGroups({ records: 0, complete: -1, interval: 1, verification_queue: 0 }),
      withGroups({ records: 0, complete: 0, interval: 0, verification_queue: 0 }),
    ])
      expect(() => countsFromBody(body)).toThrow(ParseError);
  });

  it("reads the main rule's list from the API it is given", async () => {
    const list = JSON.stringify(savedList());
    const origin = await api(() => ({ status: 200, body: list }));
    const counts = await readHomeCounts(origin);
    expect(counts.kind).toBe("known");
    expect(asked).toEqual(["/api/v1/screening/results?rule=additive_no_u"]);
  });

  it("no numbers when there is no API, it is down, it refuses, its body is not the list, or it never answers", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await readHomeCounts("")).toBe(UNKNOWN_COUNTS);
    expect(await readHomeCounts(await closedPort())).toBe(UNKNOWN_COUNTS);
    for (const reply of [
      { status: 503, body: JSON.stringify({ error: { code: "unavailable", message: "Down for a moment" } }) },
      { status: 401, body: JSON.stringify({ error: { code: "auth_required", message: "Sign in" } }) },
      { status: 200, body: "<!doctype html><title>Sign in</title>" },
    ]) {
      const origin = await api(() => reply);
      expect(await readHomeCounts(origin), String(reply.status)).toBe(UNKNOWN_COUNTS);
      server?.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    const silent = await api(() => null);
    const started = Date.now();
    expect(await readHomeCounts(silent, 300)).toBe(UNKNOWN_COUNTS);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
