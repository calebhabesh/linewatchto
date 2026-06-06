import { LineWatchShell } from "../components/LineWatchShell";
import { loadDashboardInitialData } from "./dashboard-data";

export default async function Home() {
  const initialData = await loadDashboardInitialData();
  return <LineWatchShell initialData={initialData} />;
}
