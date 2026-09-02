import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/api/client";
import { dashboardSchema, type NetworkId } from "@/api/dashboard-schema";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  network: (network: NetworkId) => [...dashboardKeys.all, network] as const,
};

export function fetchDashboard(network: NetworkId, signal?: AbortSignal) {
  return getJson(`/api/dashboard?network=${encodeURIComponent(network)}`, dashboardSchema, signal);
}

export function useDashboard(network: NetworkId, appIsActive: boolean) {
  return useQuery({
    queryKey: dashboardKeys.network(network),
    queryFn: ({ signal }) => fetchDashboard(network, signal),
    refetchInterval: appIsActive ? 20_000 : false,
    refetchIntervalInBackground: false,
    meta: { persist: true },
  });
}
