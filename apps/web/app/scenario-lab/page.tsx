import type { Metadata } from "next";

import { ScenarioPanel } from "@/components/ScenarioPanel";

export const metadata: Metadata = {
  title: "Scenario Lab",
  description: "Configure scoring weights and preview scenario results.",
};

export default function ScenarioLabPage() {
  return <ScenarioPanel />;
}
