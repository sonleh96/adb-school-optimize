import bundleAnalyzer from "@next/bundle-analyzer";

import { assertNoTestSeams } from "./scripts/test-seams.mjs";

assertNoTestSeams(process.env);

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const VERCEL_API_BASE_URL = "https://rise-png-api-73728254844.asia-southeast1.run.app";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The app is the screening workspace. A redirect from the config keeps the query string, so a link with the
  // workspace's URL state in it opens the same view, and the page's boot script reads the final address.
  async redirects() {
    return [{ source: "/", destination: "/screening", permanent: false }];
  },
  async rewrites() {
    const target = (
      process.env.API_PROXY_TARGET || (process.env.VERCEL === "1" ? VERCEL_API_BASE_URL : "")
    ).replace(/\/$/, "");
    if (!target) return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${target}/api/v1/:path*`,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
