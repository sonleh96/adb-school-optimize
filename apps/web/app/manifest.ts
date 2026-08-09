import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RISE-PNG Dashboard",
    short_name: "RISE-PNG",
    description:
      "Decision-support dashboard for prioritizing secondary school investments in Papua New Guinea.",
    start_url: "/all-schools",
    display: "standalone",
    background_color: "#d7dade",
    theme_color: "#0a2e73",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
