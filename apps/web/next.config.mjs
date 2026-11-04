import { assertNoTestSeams } from "./scripts/test-seams.mjs";

assertNoTestSeams(process.env);

const VERCEL_API_BASE_URL = "https://rise-png-api-73728254844.asia-southeast1.run.app";

/** The server the app's `/api/v1` routes go to, or "" when they go nowhere (a build with no API to proxy to). */
const API_ORIGIN = (
  process.env.API_PROXY_TARGET || (process.env.VERCEL === "1" ? VERCEL_API_BASE_URL : "")
).replace(/\/$/, "");

const originOf = (value) => {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
};

/**
 * What the pages may load. The API is reached through this origin's own /api/v1 proxy unless
 * NEXT_PUBLIC_API_BASE_URL names another; the light basemap's style, tiles, sprites and label fonts come from
 * *.cartocdn.com; MapLibre runs its worker from this origin or a blob URL, and it and deck.gl draw with WebGL, which
 * needs no directive. Next.js puts the page's data and its boot script inline, so inline scripts are allowed; nothing
 * else is, and no other site may frame the tool.
 */
function contentSecurityPolicy() {
  const dev = process.env.NODE_ENV !== "production";
  const api = originOf(process.env.NEXT_PUBLIC_API_BASE_URL);
  const directives = {
    "default-src": ["'self'"],
    // The development server evaluates its modules and reloads them over a socket.
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://*.cartocdn.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", "https://*.cartocdn.com", ...(api ? [api] : []), ...(dev ? ["ws:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  // Another site learns this origin, never the page's address with the school a reader opened.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` would otherwise write its own AGENTS.md into the app's folder on every start.
  agentRules: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The homepage reads its counts on the server, from the same API the rewrite below proxies to (lib/home/counts.ts).
  env: { SCREENING_API_ORIGIN: API_ORIGIN },
  // The homepage's pictures (public/images): AVIF where the browser takes it, else WebP. The screenshots hold small
  // text, which 75 blurs, so they ask for 85; the satellite background asks for 75.
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 85],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // `/` is the homepage. An old link to the tool at `/`, with the workspace's state in its query, goes on to
  // /screening from the proxy (lib/home/toolLink.ts), which keeps the query.
  async rewrites() {
    if (!API_ORIGIN) return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_ORIGIN}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
