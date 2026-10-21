/**
 * Build-time variables that exist only for the browser tests. They are inlined into the client bundle, so a
 * production build must not carry them: `next build` stops when one is set with VERCEL_ENV=production.
 */
export const TEST_SEAMS = ["NEXT_PUBLIC_SCREENING_TEST_HOOKS", "NEXT_PUBLIC_SCREENING_BASEMAP_STYLE"];

export function assertNoTestSeams(env) {
  if (env.VERCEL_ENV !== "production") return;
  const set = TEST_SEAMS.filter((name) => env[name]);
  if (set.length > 0) {
    throw new Error(
      `${set.join(" and ")} must not be set for a production build (VERCEL_ENV=production). ` +
        "They are test seams that would ship in the client bundle."
    );
  }
}
