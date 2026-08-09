import type { Metadata } from "next";
import { Suspense } from "react";

import { SchoolExplorer } from "@/components/SchoolExplorer";

export const metadata: Metadata = {
  title: "School Explorer",
  description: "Explore individual schools, their priority scores, and contributing indicators.",
};

export default function SchoolExplorerPage() {
  return (
    <Suspense fallback={null}>
      <SchoolExplorer />
    </Suspense>
  );
}
