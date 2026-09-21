import { apiUrl } from "./api-client.ts";
import type { NetworkId } from "./regional-data.ts";
import { SNAPSHOT_RETENTION_MS } from "./dashboard-snapshot.ts";

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
  scheduleAnnouncement?: boolean;
  alertClass?: "service-alert" | "service-advisory" | null;
};

export function surfaceNoticeServiceLabel(notice: SurfaceNoticeDetail) {
  if (notice.routeType === "Bus" || notice.routeType === "GO Bus") return "Bus";
  if (notice.routeType === "Streetcar") return "Streetcar";
  if (notice.routeType === "GO / UP") return "GO / UP";
  return null;
}

export type SurfaceNoticeStopDetail = {
  stopId: string;
  stopName: string;
};

export type SurfaceNoticeResponse = {
  savedAt?: number;
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
  const key = `linewatch-service-notices-v1:${options.networkId ?? "ttc"}`;
  const readSaved = (): SurfaceNoticeResult | null => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) || "null") as { savedAt: number; data: SurfaceNoticeResponse } | null;
      if (!stored || !Number.isFinite(stored.savedAt) || stored.savedAt > Date.now()
        || Date.now() - stored.savedAt > SNAPSHOT_RETENTION_MS || !validNotices(stored.data)) return null;
      const query = options.query?.trim().toLowerCase();
      const notices = stored.data.notices.filter((notice) =>
        (!options.category || options.category === "all" || notice.category === options.category)
        && (!query || `${notice.title} ${notice.description} ${notice.routeIds.join(" ")}`.toLowerCase().includes(query)));
      return { source: "fallback", data: { ...stored.data, fresh: false, savedAt: stored.savedAt,
        notices: options.limit === undefined ? notices : notices.slice(0, options.limit) } };
    } catch { return null; }
  };

  try {
    const response = await fetcher(apiUrl(path, options.apiBaseUrl), { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) {
      throw new Error(`Surface notices request failed with ${response.status}`);
    }

    const data: unknown = await response.json();
    if (!validNotices(data)) throw new Error("Incomplete service notices");
    if (!data.fresh) return readSaved() ?? { source: "backend", data };
    // Keep one complete unfiltered public collection per network, not search history.
    if (!options.query?.trim() && (!options.category || options.category === "all") && options.limit === undefined) {
      try { window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* Optional browser storage. */ }
    }
    return { source: "backend", data };
  } catch {
    return readSaved() ?? {
      source: "fallback",
      data: fallbackSurfaceNotices,
    };
  }
}

function validNotices(value: unknown): value is SurfaceNoticeResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as SurfaceNoticeResponse;
  return typeof data.generatedAt === "string" && typeof data.fresh === "boolean"
    && typeof data.source === "string" && Array.isArray(data.categories)
    && Array.isArray(data.notices) && data.notices.every((notice) => notice
      && typeof notice.id === "string" && typeof notice.title === "string"
      && typeof notice.description === "string" && typeof notice.category === "string"
      && Array.isArray(notice.routeIds) && Array.isArray(notice.stopIds));
}
