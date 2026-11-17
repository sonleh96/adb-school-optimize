import type { MetadataRoute } from "next";

import { SITE } from "@/lib/home/copy";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RISE-PNG Dashboard",
    short_name: "RISE-PNG",
    description: SITE.description,
    // An installed app opens the tool; the homepage at `/` is for a first visit.
    start_url: "/screening",
    display: "standalone",
    background_color: "#d7dade",
    theme_color: "#002569",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
