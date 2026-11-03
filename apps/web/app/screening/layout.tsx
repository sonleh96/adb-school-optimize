import type { ReactNode } from "react";

import { screeningFonts } from "../fonts";
import styles from "./layout.module.css";

export default function ScreeningLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={`${screeningFonts} ${styles.frame}`}>{children}</div>;
}
