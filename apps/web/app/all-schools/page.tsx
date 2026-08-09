import type { Metadata } from "next";
import { Suspense } from "react";

import { CountrySchoolExplorer } from "@/components/CountrySchoolExplorer";

export const metadata: Metadata = {
  title: "Overview",
  description: "National overview of secondary school investment priorities across Papua New Guinea.",
};

export default function AllSchoolsPage() {
  return (
    <Suspense fallback={null}>
      <CountrySchoolExplorer />
    </Suspense>
  );
}
