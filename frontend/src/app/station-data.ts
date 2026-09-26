import { apiUrl } from "./api-client.ts";
import {
  fallbackStationDetails,
  fallbackStationSummaries,
} from "./station-fixtures.ts";

export type StationAccessStatus = "normal" | "advisory" | "outage";
export type StationImpactType = "active-alert" | "planned-closure";
export type StationImpactSeverity = "delay" | "suspension" | "planned";

export type StationAccessOutageCounts = {
  elevator: number;
  escalator: number;
};

export type StationSummary = {
  id: string;
  name: string;
  mapX: number;
  mapY: number;
  interchange: boolean;
  lineIds: string[];
  hasActiveImpact: boolean;
  accessStatus: StationAccessStatus;
  accessOutageCounts?: StationAccessOutageCounts;
  wheelchairAccessible?: boolean;
  hasElevator?: boolean;
  hasWashroom?: boolean;
  hasParking?: boolean;
  hasBicycleLockup?: boolean;
  hasBicycleRepair?: boolean;
  hasBikeShare?: boolean;
  hasPpudo?: boolean;
};

export type StationListResponse = {
  generatedAt: string;
  stations: StationSummary[];
};

export type StationLine = {
  id: string;
  number: string;
  name: string;
  color: string;
  platformLabel: string;
  wheelchairAccessible: boolean;
  hasElevator: boolean;
};

export type StationFacilityOutage = {
  id: string;
  assetType: "elevator" | "escalator";
  title: string;
  description: string;
  cause?: string | null;
  updatedAt: string;
  source: string;
};

export type StationAccess = {
  status: StationAccessStatus;
  summary: string;
  updatedAgo: string;
  outages: StationFacilityOutage[];
};

export type StationImpact = {
  id: string;
  type: StationImpactType;
  severity: StationImpactSeverity;
  title: string;
  summary: string;
  updatedAgo: string | null;
  updatedAt?: string | null;
  source: string;
};

export type StationNotice = {
  id: string;
  category: "construction" | "service-change" | "facility" | "other";
  title: string;
  summary: string;
  sourceUrl: string;
  effectiveStart?: string | null;
  effectiveEnd?: string | null;
  sourceUpdatedAt?: string | null;
  lastVerifiedAt: string;
  source: string;
};

export function stationNoticeCategoryLabel(category: string): string {
  switch (category) {
    case "construction": return "Construction";
    case "service-change": return "Service Change";
    case "facility": return "Facility";
    default: return "Notice";
  }
}

export function formatStationNoticeDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(date);
}

export type StationArrival = {
  lineId: string;
  direction: string;
  minutes: number | null;
  predictedAt: string | null;
  label: string;
  source: string;
  status: "scheduled" | "live" | "unavailable" | "demo";
};

export type StationArrivalContext = {
  scheduleMayBeDisrupted: boolean;
  message: string;
  reason: string;
  severity: "normal" | StationImpactSeverity;
  source: string;
};

export type StationDetail = {
  id: string;
  name: string;
  mapX: number;
  mapY: number;
  interchange: boolean;
  lines: StationLine[];
  access: StationAccess;
  impacts: StationImpact[];
  notices?: StationNotice[];
  arrivals: StationArrival[];
  arrivalsSource: string;
  arrivalContext: StationArrivalContext;
  dataMode: "seeded-demo";
  disclaimer: string;
  hasWashroom?: boolean;
  hasParking?: boolean;
  hasBicycleLockup?: boolean;
  hasBicycleRepair?: boolean;
  hasBikeShare?: boolean;
  hasPpudo?: boolean;
};

export type StationDataResult<T> = {
  source: "backend" | "fallback";
  data: T;
  receivedAt: number;
};

export type StationFetchOptions = {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
  signal?: AbortSignal;
};

export const TTC_STATION_HTTP_FAILURE_GRACE_MS = 30_000;

export function preserveStationDetailOnRefresh(
  current: StationDataResult<StationDetail | null> | null | undefined,
  incoming: StationDataResult<StationDetail | null>,
  now = Date.now(),
): StationDataResult<StationDetail | null> {
  if (
    incoming.source === "fallback"
    && current?.source === "backend"
    && current.data?.id === incoming.data?.id
    && now >= current.receivedAt
    && now - current.receivedAt <= TTC_STATION_HTTP_FAILURE_GRACE_MS
  ) {
    return current;
  }

  return incoming;
}

export async function getStationSummaries(
  options: StationFetchOptions = {}
): Promise<StationDataResult<StationListResponse>> {
  const fetcher = options.fetcher ?? fetch;

  try {
    const response = await fetcher(apiUrl("/api/stations", options.apiBaseUrl));
    if (!response.ok) {
      throw new Error(`Station summaries request failed with ${response.status}`);
    }

    return { source: "backend", data: (await response.json()) as StationListResponse, receivedAt: Date.now() };
  } catch {
    return { source: "fallback", data: fallbackStationSummaries, receivedAt: Date.now() };
  }
}

export async function getStationDetail(
  id: string,
  options: StationFetchOptions = {}
): Promise<StationDataResult<StationDetail | null>> {
  const fetcher = options.fetcher ?? fetch;

  try {
    const fetchInit: RequestInit = { cache: "no-store" };
    if (options.signal) {
      fetchInit.signal = options.signal;
    }
    const response = await fetcher(
      apiUrl(`/api/stations/${encodeURIComponent(id)}`, options.apiBaseUrl),
      fetchInit,
    );
    if (response.status === 404) {
      return { source: "backend", data: null, receivedAt: Date.now() };
    }
    if (!response.ok) {
      throw new Error(`Station detail request failed with ${response.status}`);
    }

    return { source: "backend", data: (await response.json()) as StationDetail, receivedAt: Date.now() };
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError")
      || (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError")
    ) {
      throw error;
    }
    return { source: "fallback", data: fallbackStationDetails[id] ?? null, receivedAt: Date.now() };
  }
}

export * from "./station-catalog.ts";
export * from "./station-fixtures.ts";
