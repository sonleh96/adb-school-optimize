import type { MetadataRoute } from "next";

/**
 * Search engines may read the homepage, which explains the project, so a search lands a reader there first. The
 * tool's views stay out of their index: a view's address changes with every filter and school, and with sign-in on
 * each one leads to the sign-in page. Sign-in, its callbacks and the API stay out for the same reason.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/screening", "/sign-in", "/auth/", "/api/"] },
  };
}
