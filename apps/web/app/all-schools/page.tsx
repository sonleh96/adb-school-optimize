import { CountrySchoolExplorer } from "@/components/CountrySchoolExplorer";
import { DashboardPageShell } from "@/components/DashboardPageShell";

export default function AllSchoolsPage() {
  return (
    <DashboardPageShell>
      <CountrySchoolExplorer />
    </DashboardPageShell>
  );
}
