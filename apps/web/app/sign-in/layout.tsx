import type { ReactNode } from "react";

import { screeningFonts } from "../fonts";

export default function SignInLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={screeningFonts}>{children}</div>;
}
