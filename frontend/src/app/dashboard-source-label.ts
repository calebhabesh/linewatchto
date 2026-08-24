import type { DashboardData } from "./DataContext";

export function normalizeDashboardSourceLabel(source: string) {
  const normalized = source.trim();
  if (normalized === "TTC Live Alert" || normalized === "TTC Service Advisory") {
    return "TTC Live Alerts";
  }
  if (
    normalized === "TTC.ca Subway Service Advisories" ||
    normalized === "TTC.ca Subway Closures"
  ) {
    return "TTC.ca Advisories";
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

export function dashboardImpactSourcesLabel(
  dashboard: Pick<DashboardData, "networkId" | "dataSource">,
  itemSources: Array<string | null | undefined>,
) {
  const sources = Array.from(
    new Set(
      itemSources
        .filter((source): source is string => Boolean(source?.trim()))
        .map(normalizeDashboardSourceLabel),
    ),
  );

  if (sources.length === 0) return dashboardImpactSourceLabel(dashboard);
  if (sources.length === 1) return sources[0];

  if (
    sources.length === 2 &&
    sources.includes("TTC Live Alerts") &&
    sources.includes("TTC.ca Advisories")
  ) {
    return "TTC Live Alerts + TTC.ca";
  }

  return dashboard.networkId === "ttc" ? "Multiple TTC Sources" : "Multiple Sources";
}
