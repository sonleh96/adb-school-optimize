/** The production API on Cloud Run. Its URL carries no revision tag, so it always reaches the serving revision. */
export const PRODUCTION_API_ORIGIN = "https://rise-png-api-73728254844.asia-southeast1.run.app";

/**
 * The server the app's `/api/v1` routes go to, or "" when they go nowhere (a build with no API to proxy to).
 * `API_PROXY_TARGET` wins, so a release preview can be built against a tagged Cloud Run revision before it serves
 * traffic. Without it, a Vercel build proxies to production and any other build proxies nowhere.
 */
export function apiOrigin(env) {
  return (env.API_PROXY_TARGET || (env.VERCEL === "1" ? PRODUCTION_API_ORIGIN : "")).replace(/\/$/, "");
}
