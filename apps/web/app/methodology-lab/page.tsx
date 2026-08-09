import type { Metadata } from "next";

import { MethodologyPanel } from "@/components/MethodologyPanel";

export const metadata: Metadata = {
  title: "Methodology",
  description: "Scoring methodology, data sources, and indicator definitions.",
};

export default function MethodologyLabPage() {
  return <MethodologyPanel />;
}
