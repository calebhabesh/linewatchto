import type { DashboardData } from "./DataContext";

export function normalizeDashboardSourceLabel(source: string) {
  const normalized = source.trim();
  if (normalized === "TTC Live Alert" || normalized === "TTC Service Advisory") {
    return "TTC Live Alerts";
  }
  return normalized;
}

export function dashboardImpactSourceLabel(
  dashboard: Pick<DashboardData, "networkId" | "dataSource">,
  itemSource?: string,
) {
  if (itemSource) return normalizeDashboardSourceLabel(itemSource);
  if (dashboard.networkId === "regional") {
    return dashboard.dataSource === "backend"
      ? "Metrolinx Open API"
      : "Metrolinx Open API · Not connected";
  }
  return "TTC Live Alerts";
}
