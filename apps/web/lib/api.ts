// Prefer same-origin `/api/v1/*` (Next rewrite proxy) to avoid Cloud Run CORS on local ports.
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
/** A request the API (or the sign-in check before it) answered with a failure. `status` is the HTTP status. */
export class ApiRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

const SESSION_ENDED = "Your session has expired. Sign in again.";
let cachedAuthState: { required: false } | { required: true; token: string; expiresAt: number } | null = null;
let pendingToken: Promise<string | null> | null = null;

async function fetchAccessToken(): Promise<string | null> {
  const response = await fetch("/auth/token", { cache: "no-store" });
  if (!response.ok) throw new ApiRequestError(SESSION_ENDED, 401);
  const data = (await response.json()) as {
    required: boolean;
    accessToken: string | null;
    expiresAt?: number;
  };
  if (!data.required) {
    cachedAuthState = { required: false };
    return null;
  }
  if (!data.accessToken || !data.expiresAt) throw new ApiRequestError(SESSION_ENDED, 401);
  cachedAuthState = { required: true, token: data.accessToken, expiresAt: data.expiresAt };
  return data.accessToken;
}

async function getApiAccessToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAuthState?.required === false) return null;
  if (cachedAuthState?.required && cachedAuthState.expiresAt > now + 30) return cachedAuthState.token;
  // Reads that start together (a page's first requests) share one token request instead of each making their own.
  pendingToken ??= fetchAccessToken().finally(() => {
    pendingToken = null;
  });
  return pendingToken;
}

/**
 * Every call carries the user's bearer token, so it may only go to the API's own routes.
 * A path that starts anywhere else (another route of this app, a full URL, a way back up the tree) is refused.
 */
export function assertApiPath(path: string): void {
  const route = path.split("?")[0];
  if (!route.startsWith("/api/v1/") || route.includes("..") || route.includes("\\")) {
    throw new Error(`apiFetch only calls /api/v1/ routes, not ${JSON.stringify(path)}.`);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  assertApiPath(path);
  const method = (init?.method ?? "GET").toUpperCase();
  const accessToken = await getApiAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
    // GETs are cacheable; mutations stay uncached.
    cache: method === "GET" ? "default" : "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new ApiRequestError(message || `Request failed: ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

/**
 * A file the API writes (a CSV export), as its text and the headers that describe it. Same rules as `apiFetch`: the
 * API's own routes only, with the user's token. A file is never cached, so each read is the API's current answer.
 */
export async function apiFetchFile(
  path: string,
  init?: RequestInit
): Promise<{ text: string; type: string | null; disposition: string | null }> {
  assertApiPath(path);
  const accessToken = await getApiAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    const message = await response.text();
    throw new ApiRequestError(message || `Request failed: ${response.status}`, response.status);
  }
  // The text keeps the file's byte order mark, so the download is the API's file byte for byte.
  const bytes = await response.arrayBuffer();
  return {
    text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
    type: response.headers.get("Content-Type"),
    disposition: response.headers.get("Content-Disposition"),
  };
}
