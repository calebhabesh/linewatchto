import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/api/client";
import type { NetworkId } from "@/api/dashboard-schema";
import {
  regionalTripChangeResponseSchema,
  surfaceNoticeResponseSchema,
  type RegionalTripChangeResponse,
  type SurfaceNoticeResponse,
} from "@/api/notices-schema";

export const noticeKeys = {
  all: ["notices"] as const,
  surface: (network: NetworkId, category?: string, query?: string) =>
    [...noticeKeys.all, "surface", network, category ?? "all", query ?? ""] as const,
  regionalTripChanges: (stationId?: string, query?: string) =>
    [...noticeKeys.all, "regional-trip-changes", stationId ?? "all", query ?? ""] as const,
};

export function fetchSurfaceNotices(
  network: NetworkId,
  category?: string,
  query?: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<SurfaceNoticeResponse> {
  const parameters = new URLSearchParams();
  if (network === "regional") {
    parameters.set("network", "regional");
  }
  if (category && category !== "all") {
    parameters.set("category", category);
  }
  if (query && query.trim()) {
    parameters.set("query", query.trim());
  }
  if (limit !== undefined) {
    parameters.set("limit", limit.toString());
  }
  const queryString = parameters.toString();
  const path = `/api/surface-notices${queryString ? `?${queryString}` : ""}`;

  return getJson(path, surfaceNoticeResponseSchema, signal);
}

export function fetchRegionalTripChanges(
  stationId?: string,
  query?: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<RegionalTripChangeResponse> {
  const parameters = new URLSearchParams();
  if (stationId) {
    parameters.set("stationId", stationId);
  }
  if (query && query.trim()) {
    parameters.set("query", query.trim());
  }
  if (limit !== undefined) {
    parameters.set("limit", limit.toString());
  }
  const queryString = parameters.toString();
  const path = `/api/regional/trip-changes${queryString ? `?${queryString}` : ""}`;

  return getJson(path, regionalTripChangeResponseSchema, signal);
}

export function useSurfaceNotices(
  network: NetworkId,
  category?: string,
  query?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: noticeKeys.surface(network, category, query),
    queryFn: ({ signal }) => fetchSurfaceNotices(network, category, query, undefined, signal),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useRegionalTripChanges(
  stationId?: string,
  query?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: noticeKeys.regionalTripChanges(stationId, query),
    queryFn: ({ signal }) => fetchRegionalTripChanges(stationId, query, undefined, signal),
    enabled,
    refetchInterval: enabled ? 20_000 : false,
    refetchIntervalInBackground: false,
  });
}
