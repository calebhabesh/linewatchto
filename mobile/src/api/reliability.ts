import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/api/client";
import type { NetworkId } from "@/api/dashboard-schema";
import {
  reliabilityResponseSchema,
  type ReliabilityResponse,
} from "@/api/reliability-schema";

export const reliabilityKeys = {
  all: ["reliability"] as const,
  lines: (network: NetworkId) => [...reliabilityKeys.all, "lines", network] as const,
  station: (network: NetworkId, stationId: string) =>
    [...reliabilityKeys.all, "station", network, stationId] as const,
};

export function fetchLineReliability(
  network: NetworkId,
  signal?: AbortSignal,
): Promise<ReliabilityResponse> {
  const path = `/api/reliability/lines?network=${encodeURIComponent(network)}`;
  return getJson(path, reliabilityResponseSchema, signal);
}

export function fetchStationReliability(
  network: NetworkId,
  stationId: string,
  signal?: AbortSignal,
): Promise<ReliabilityResponse> {
  const path = `/api/reliability/stations/${encodeURIComponent(stationId)}?network=${encodeURIComponent(network)}`;
  return getJson(path, reliabilityResponseSchema, signal);
}

export function useLineReliability(network: NetworkId, enabled = true) {
  return useQuery({
    queryKey: reliabilityKeys.lines(network),
    queryFn: ({ signal }) => fetchLineReliability(network, signal),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useStationReliability(network: NetworkId, stationId: string, enabled = true) {
  return useQuery({
    queryKey: reliabilityKeys.station(network, stationId),
    queryFn: ({ signal }) => fetchStationReliability(network, stationId, signal),
    enabled: Boolean(stationId) && enabled,
    refetchInterval: enabled ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
}
