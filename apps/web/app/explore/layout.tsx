import type { ReactNode } from "react";

import { QueryProvider } from "@/components/QueryProvider";

import { screeningFonts } from "../fonts";

// The explore page reads the API from the browser, as the workspace does, so React Query loads with it and not with
// the homepage or the sign-in page. It sets the workspace's typeface.
export default function ExploreLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={screeningFonts}>
      <QueryProvider>{children}</QueryProvider>
    </div>
  );
}
