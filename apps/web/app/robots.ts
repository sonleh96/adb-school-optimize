import type { MetadataRoute } from "next";

/**
 * Search engines may read the homepage, which explains the project, so a search lands a reader there first. The
 * tool's views and the explore page's charts stay out of their index: their addresses change with every filter and
 * school, and with sign-in on each one leads to the sign-in page. Sign-in, its callbacks and the API stay out for the
 * same reason.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/screening", "/explore", "/sign-in", "/auth/", "/api/"],
    },
  };
}
