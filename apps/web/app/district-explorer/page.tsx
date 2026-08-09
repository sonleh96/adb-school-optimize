import type { Metadata } from "next";

import { DistrictExplorer } from "@/components/DistrictExplorer";

export const metadata: Metadata = {
  title: "District Explorer",
  description: "Compare districts and choropleth indicators across Papua New Guinea.",
};

export default function DistrictExplorerPage() {
  return <DistrictExplorer />;
}
