import type { DashboardData } from "./DataContext";

export function dashboardImpactSourceLabel(
  dashboard: Pick<DashboardData, "networkId" | "dataSource">,
  itemSource?: string,
) {
  if (itemSource) return itemSource;
  if (dashboard.networkId === "regional") {
    return dashboard.dataSource === "backend"
      ? "Metrolinx GTFS-RT"
      : "Metrolinx GTFS-RT · Not connected";
  }
  return "TTC Live Alerts";
}
