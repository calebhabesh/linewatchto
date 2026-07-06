import type { Metadata } from "next";
import { LineWatchDevBootstrap } from "../components/LineWatchDevBootstrap";
import { loadDashboardInitialData } from "./dashboard-data";
import { lineWatchSeoTitle } from "./seo";

export const metadata: Metadata = {
  title: lineWatchSeoTitle,
};

export default async function Home() {
  const initialData = await loadDashboardInitialData();
  return <LineWatchDevBootstrap initialData={initialData} />;
}
