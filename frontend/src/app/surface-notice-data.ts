import { apiUrl } from "./api-client.ts";
import type { NetworkId } from "./regional-data.ts";

export type SurfaceNoticeCategory = "service-change" | "bypass" | "detour" | "no-service" | "notice";

export type SurfaceNoticeCategorySummary = {
  category: string;
  label: string;
  count: number;
};

export type SurfaceNoticeDetail = {
  id: string;
  category: string;
  routeType: string;
  routeIds: string[];
  title: string;
  description: string;
  location?: string | null;
  stopIds: string[];
  direction?: string | null;
  cause?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  updatedAt: string;
  url?: string | null;
  source: string;
  stops?: SurfaceNoticeStopDetail[];
};

export type SurfaceNoticeStopDetail = {
  stopId: string;
  stopName: string;
};

export type SurfaceNoticeResponse = {
  generatedAt: string;
  fresh: boolean;
  source: string;
  categories: SurfaceNoticeCategorySummary[];
  notices: SurfaceNoticeDetail[];
};

export type SurfaceNoticeResult = {
  source: "backend" | "fallback";
  data: SurfaceNoticeResponse;
};

export type SurfaceNoticeFetchOptions = {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
  category?: SurfaceNoticeCategory | "all";
  query?: string;
  limit?: number;
  networkId?: NetworkId;
};

export const fallbackSurfaceNotices: SurfaceNoticeResponse = {
  generatedAt: new Date().toISOString(),
  fresh: false,
  source: "LineWatchTO fixture",
  categories: [],
  notices: [],
};

export async function getSurfaceNotices(
  options: SurfaceNoticeFetchOptions = {}
): Promise<SurfaceNoticeResult> {
  const fetcher = options.fetcher ?? fetch;

  const params = new URLSearchParams();
  if (options.networkId === "regional") {
    params.append("network", "regional");
  }
  if (options.category && options.category !== "all") {
    params.append("category", options.category);
  }
  if (options.query && options.query.trim()) {
    params.append("query", options.query.trim());
  }
  if (options.limit !== undefined) {
    params.append("limit", options.limit.toString());
  }

  const queryString = params.toString();
  const path = queryString ? `/api/surface-notices?${queryString}` : "/api/surface-notices";

  try {
    const response = await fetcher(apiUrl(path, options.apiBaseUrl));
    if (!response.ok) {
      throw new Error(`Surface notices request failed with ${response.status}`);
    }

    return {
      source: "backend",
      data: (await response.json()) as SurfaceNoticeResponse,
    };
  } catch {
    return {
      source: "fallback",
      data: fallbackSurfaceNotices,
    };
  }
}
