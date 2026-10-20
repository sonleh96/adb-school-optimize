import type { Metadata } from "next";

import { ScreeningWorkspace } from "@/components/screening/ScreeningWorkspace";

export const metadata: Metadata = { title: "Screening" };

export default function ScreeningPage() {
  return <ScreeningWorkspace />;
}
