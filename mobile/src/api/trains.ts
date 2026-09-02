import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/api/client";
import type { NetworkId } from "@/api/dashboard-schema";
import {
  estimatedTrainSnapshotSchema,
  type EstimatedTrainSnapshot,
} from "@/api/trains-schema";

export const trainsKeys = {
  all: ["estimated-trains"] as const,
  network: (network: NetworkId) => [...trainsKeys.all, network] as const,
};

export function fetchEstimatedTrains(
  network: NetworkId,
  signal?: AbortSignal,
): Promise<EstimatedTrainSnapshot> {
  const path = network === "regional" ? "/api/regional/trains" : "/api/trains";
  return getJson(path, estimatedTrainSnapshotSchema, signal);
}

export function useEstimatedTrains(
  network: NetworkId,
  enabled = true,
  isOpen = true,
) {
  const isQueryEnabled = enabled && isOpen;
  return useQuery({
    queryKey: trainsKeys.network(network),
    queryFn: ({ signal }) => fetchEstimatedTrains(network, signal),
    enabled: isQueryEnabled,
    refetchInterval: isQueryEnabled ? (network === "regional" ? 15_000 : 5_000) : false,
    refetchIntervalInBackground: false,
  });
}
