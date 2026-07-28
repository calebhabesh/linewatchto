import type { NetworkId } from "./regional-data.ts";

export type DashboardPresentationState = {
  networkId: NetworkId;
  dataSource: "backend" | "fallback";
};

export function titleCasePollText(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function networkStatusKicker(networkId: NetworkId): string {
  return networkId === "regional"
    ? "GO & UP regional rail"
    : "Current TTC rapid transit";
}

export function dashboardStatusSourceLabel(
  state: DashboardPresentationState,
  pollText: string,
  variant: "full" | "compact" = "full",
): string {
  if (state.dataSource === "backend") {
    return `Updated ${titleCasePollText(pollText)}`;
  }

  if (state.networkId === "regional") {
    return variant === "compact"
      ? "Regional Demo · Not Live"
      : "Regional demo data — not live service information.";
  }

  return variant === "compact"
    ? "Fixture Mode"
    : "Backend offline. Fixture mode.";
}

export function clearServiceStatusLabel(state: DashboardPresentationState): string {
  if (state.dataSource === "backend") return "Good Service";
  return state.networkId === "regional" ? "Demo Status Unavailable" : "Fixture Data";
}
