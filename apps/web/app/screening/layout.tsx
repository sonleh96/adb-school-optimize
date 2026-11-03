import type { ReactNode } from "react";

import { QueryProvider } from "@/components/QueryProvider";

import { screeningFonts } from "../fonts";
import styles from "./layout.module.css";

// The workspace is the only page that reads the API from the browser, so React Query loads with it and not with the
// homepage or the sign-in page.
export default function ScreeningLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={`${screeningFonts} ${styles.frame}`}>
      <QueryProvider>{children}</QueryProvider>
    </div>
  );
}
