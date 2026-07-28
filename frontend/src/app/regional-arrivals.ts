import { apiUrl } from "./api-client.ts";

export type RegionalArrivalAvailability = "available" | "disabled" | "unavailable";

export type RegionalArrival = {
  lineId: string;
  lineNumber: string;
  lineName: string;
  direction: string;
  minutes: number;
  predictedAt: string;
  scheduledAt: string;
  delayMinutes: number;
  platform: string;
  tripNumber: string;
  source: string;
  status: "live";
};

export type RegionalArrivalSnapshot = {
  stationId: string;
  stationName: string;
  availability: RegionalArrivalAvailability;
  generatedAt: string | null;
  sourceUpdatedAt: string | null;
  source: string;
  message: string;
  arrivals: RegionalArrival[];
};

export type RegionalArrivalDataResult = {
  source: "backend" | "fallback";
  data: RegionalArrivalSnapshot;
};

type RegionalArrivalFetchOptions = {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
  signal?: AbortSignal;
};

export function emptyRegionalArrivalSnapshot(stationId: string): RegionalArrivalSnapshot {
  return {
    stationId,
    stationName: "",
    availability: "unavailable",
    generatedAt: null,
    sourceUpdatedAt: null,
    source: "Metrolinx",
    message: "Regional station arrivals are unavailable.",
    arrivals: [],
  };
}

export async function getRegionalStationArrivals(
  stationId: string,
  options: RegionalArrivalFetchOptions = {},
): Promise<RegionalArrivalDataResult> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(
      apiUrl(`/api/regional/stations/${encodeURIComponent(stationId)}/arrivals`, options.apiBaseUrl),
      { cache: "no-store", signal: options.signal },
    );
    if (!response.ok) {
      throw new Error(`Regional station arrivals request failed with ${response.status}`);
    }
    return { source: "backend", data: await response.json() as RegionalArrivalSnapshot };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return { source: "fallback", data: emptyRegionalArrivalSnapshot(stationId) };
  }
}

export function regionalArrivalMinuteLabel(minutes: number) {
  if (minutes <= 0) return "Due";
  return `${minutes} min`;
}
