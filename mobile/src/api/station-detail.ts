import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/api/client";
import type { NetworkId } from "@/api/dashboard-schema";
import {
  regionalArrivalSnapshotSchema,
  surfaceArrivalSnapshotSchema,
  ttcStationDetailSchema,
  type RegionalArrivalSnapshot,
  type SurfaceArrivalSnapshot,
  type TtcStationDetail,
} from "@/api/station-detail-schema";

export const stationDetailKeys = {
  all: ["station"] as const,
  ttc: (stationId: string) => [...stationDetailKeys.all, "ttc", stationId] as const,
  regionalArrivals: (stationId: string) => [...stationDetailKeys.all, "regional", stationId, "arrivals"] as const,
  surface: (network: NetworkId, stationId: string) =>
    [...stationDetailKeys.all, network, stationId, "surface"] as const,
};

export function fetchTtcStationDetail(stationId: string, signal?: AbortSignal): Promise<TtcStationDetail> {
  return getJson(`/api/stations/${encodeURIComponent(stationId)}`, ttcStationDetailSchema, signal);
}

export function fetchRegionalStationArrivals(
  stationId: string,
  signal?: AbortSignal,
): Promise<RegionalArrivalSnapshot> {
  return getJson(
    `/api/regional/stations/${encodeURIComponent(stationId)}/arrivals`,
    regionalArrivalSnapshotSchema,
    signal,
  );
}

export function fetchStationSurfaceConnections(
  network: NetworkId,
  stationId: string,
  signal?: AbortSignal,
): Promise<SurfaceArrivalSnapshot> {
  const prefix = network === "regional" ? "/api/regional/stations" : "/api/stations";
  return getJson(
    `${prefix}/${encodeURIComponent(stationId)}/surface-connections`,
    surfaceArrivalSnapshotSchema,
    signal,
  );
}

export function useTtcStationDetail(stationId: string, enabled: boolean) {
  return useQuery({
    queryKey: stationDetailKeys.ttc(stationId),
    queryFn: ({ signal }) => fetchTtcStationDetail(stationId, signal),
    enabled: Boolean(stationId),
    refetchInterval: enabled ? 20_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useRegionalStationArrivals(stationId: string, enabled: boolean) {
  return useQuery({
    queryKey: stationDetailKeys.regionalArrivals(stationId),
    queryFn: ({ signal }) => fetchRegionalStationArrivals(stationId, signal),
    enabled: Boolean(stationId),
    refetchInterval: enabled ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useStationSurfaceConnections(network: NetworkId, stationId: string, enabled: boolean) {
  return useQuery({
    queryKey: stationDetailKeys.surface(network, stationId),
    queryFn: ({ signal }) => fetchStationSurfaceConnections(network, stationId, signal),
    enabled: Boolean(stationId),
    refetchInterval: enabled ? 20_000 : false,
    refetchIntervalInBackground: false,
  });
}
