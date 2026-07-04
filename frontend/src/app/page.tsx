import type { Metadata } from "next";
import { LineWatchShell } from "../components/LineWatchShell";
import { loadDashboardInitialData } from "./dashboard-data";
import { lineWatchSeoTitle } from "./seo";

export const metadata: Metadata = {
  title: lineWatchSeoTitle,
};

export default async function Home() {
  const initialData = await loadDashboardInitialData();
  return <LineWatchShell initialData={initialData} />;
}
