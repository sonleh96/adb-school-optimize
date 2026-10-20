/**
 * Failure modes of the access token lookup: reads that start together each ask for the token, so a page's first
 * requests queue behind duplicate round trips; and a failed lookup is remembered, so a retry never asks again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const requested = (fetchMock: ReturnType<typeof vi.fn>, path: string) =>
  fetchMock.mock.calls.filter(([url]) => url === path).length;

describe("apiFetch and the access token", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // `fetch` is the browser's, not ours; the module under test is the real one, loaded fresh for each case.
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the token once when several reads start together", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    fetchMock.mockImplementation(async (url: string) =>
      url === "/auth/token" ? json({ required: true, accessToken: "token-a", expiresAt }) : json({ ok: true })
    );
    const { apiFetch } = await import("@/lib/api");

    await Promise.all([apiFetch("/api/v1/one"), apiFetch("/api/v1/two"), apiFetch("/api/v1/three")]);

    expect(requested(fetchMock, "/auth/token")).toBe(1);
    const sent = fetchMock.mock.calls.filter(([url]) => url !== "/auth/token");
    expect(sent.map(([, init]) => init.headers.Authorization)).toEqual([
      "Bearer token-a",
      "Bearer token-a",
      "Bearer token-a",
    ]);
  });

  it("asks again after a failed lookup instead of remembering the failure", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    fetchMock
      .mockResolvedValueOnce(json({ required: true, accessToken: null }, 401))
      .mockResolvedValueOnce(json({ required: true, accessToken: "token-b", expiresAt }))
      .mockResolvedValue(json({ ok: true }));
    const { apiFetch } = await import("@/lib/api");

    await expect(apiFetch("/api/v1/one")).rejects.toMatchObject({ status: 401 });
    await apiFetch("/api/v1/one");

    expect(requested(fetchMock, "/auth/token")).toBe(2);
  });
});
