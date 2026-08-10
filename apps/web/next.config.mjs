import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const VERCEL_API_BASE_URL = "https://rise-png-api-73728254844.asia-southeast1.run.app";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
