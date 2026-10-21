import type { ReactNode } from "react";

import { screeningFonts } from "../fonts";

export default function ScreeningLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={screeningFonts} style={{ position: "absolute", inset: 0 }}>
      {children}
    </div>
  );
}
