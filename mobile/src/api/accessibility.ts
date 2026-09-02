import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/api/client";
import type { NetworkId } from "@/api/dashboard-schema";
import {
  accessibilityOutagesResponseSchema,
  type AccessibilityOutagesResponse,
} from "@/api/accessibility-schema";

export type AccessibilityAssetFilter = "all" | "elevator" | "escalator";

export const accessibilityKeys = {
  all: ["accessibility-outages"] as const,
  list: (network: NetworkId, asset: AccessibilityAssetFilter) =>
    [...accessibilityKeys.all, network, asset] as const,
};

export function fetchAccessibilityOutages(
  network: NetworkId,
  asset: AccessibilityAssetFilter,
  signal?: AbortSignal,
): Promise<AccessibilityOutagesResponse> {
  const parameters = new URLSearchParams();
  if (asset !== "all") {
    parameters.set("asset", asset);
  }
  if (network === "regional") {
    parameters.set("network", "regional");
  }
  const query = parameters.toString();
  const path = `/api/accessibility-outages${query ? `?${query}` : ""}`;

  return getJson(path, accessibilityOutagesResponseSchema, signal);
}

export function useAccessibilityOutages(
  network: NetworkId,
  asset: AccessibilityAssetFilter = "all",
  enabled = true,
) {
  return useQuery({
    queryKey: accessibilityKeys.list(network, asset),
    queryFn: ({ signal }) => fetchAccessibilityOutages(network, asset, signal),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
}
