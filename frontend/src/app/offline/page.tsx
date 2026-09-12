import { LineWatchShell } from "../../components/LineWatchShell";
import { fallbackDashboardData } from "../dashboard-data";

// Public bootstrap only: never read cookies, account data, or URL tokens here.
export const dynamic = "force-static";
export const metadata = { title: "Offline dashboard", robots: { index: false, follow: false } };

export default function OfflineDashboard() {
  return <LineWatchShell initialData={fallbackDashboardData()} offlineShell />;
}
