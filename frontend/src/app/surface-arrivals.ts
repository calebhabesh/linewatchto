import { apiUrl } from "./api-client.ts";

export type SurfaceArrivalAvailability = "available" | "no-service" | "disabled" | "unavailable";
export type SurfaceArrivalMode = "bus" | "streetcar";

export type SurfaceArrival = {
  agency: string;
  mode: SurfaceArrivalMode;
  route: string;
  routeName: string;
  destination: string;
  minutes: number;
  predictedAt: string;
  scheduledAt: string | null;
  bayPlatform: string;
  stopName: string;
  tripId: string;
  source: string;
  status: "live" | "scheduled";
};

export type SurfaceArrivalSnapshot = {
  networkId: "ttc" | "regional";
  stationId: string;
  stationName: string;
  availability: SurfaceArrivalAvailability;
  generatedAt: string | null;
  sourceUpdatedAt: string | null;
  source: string;
  message: string;
  arrivals: SurfaceArrival[];
};

export type SurfaceArrivalGroup = {
  key: string;
  mode: SurfaceArrivalMode;
  route: string;
  routeName: string;
  destination: string;
  bayPlatform: string;
  stopName: string;
  arrivals: SurfaceArrival[];
};

type FetchOptions = {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
  signal?: AbortSignal;
};

export function emptySurfaceArrivalSnapshot(
  networkId: "ttc" | "regional",
  stationId: string,
): SurfaceArrivalSnapshot {
  return {
    networkId,
    stationId,
    stationName: "",
    availability: "unavailable",
    generatedAt: null,
    sourceUpdatedAt: null,
    source: networkId === "ttc" ? "TTC GTFS-RT" : "Metrolinx",
    message: "Surface connections are unavailable.",
    arrivals: [],
  };
}

export async function getSurfaceArrivals(
  networkId: "ttc" | "regional",
  stationId: string,
  options: FetchOptions = {},
): Promise<SurfaceArrivalSnapshot> {
  const prefix = networkId === "regional" ? "/api/regional/stations" : "/api/stations";
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(
      apiUrl(`${prefix}/${encodeURIComponent(stationId)}/surface-connections`, options.apiBaseUrl),
      { cache: "no-store", signal: options.signal },
    );
    if (!response.ok) throw new Error(`Surface connections request failed with ${response.status}`);
    return await response.json() as SurfaceArrivalSnapshot;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return emptySurfaceArrivalSnapshot(networkId, stationId);
  }
}

export function groupSurfaceArrivals(arrivals: SurfaceArrival[]): SurfaceArrivalGroup[] {
  const groups = new Map<string, SurfaceArrivalGroup>();
  for (const arrival of arrivals) {
    const key = [arrival.mode, arrival.route, arrival.destination, arrival.bayPlatform, arrival.stopName].join(":");
    const group = groups.get(key) ?? {
      key,
      mode: arrival.mode,
      route: arrival.route,
      routeName: arrival.routeName,
      destination: arrival.destination,
      bayPlatform: arrival.bayPlatform,
      stopName: arrival.stopName,
      arrivals: [],
    };
    group.arrivals.push(arrival);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      arrivals: group.arrivals.toSorted((a, b) => Date.parse(a.predictedAt) - Date.parse(b.predictedAt)),
    }))
    .toSorted((a, b) => {
      const time = Date.parse(a.arrivals[0]?.predictedAt ?? "") - Date.parse(b.arrivals[0]?.predictedAt ?? "");
      return Number.isNaN(time) || time === 0
        ? a.route.localeCompare(b.route, undefined, { numeric: true })
        : time;
    });
}

export function surfaceArrivalMinutes(
  arrival: Pick<SurfaceArrival, "minutes" | "predictedAt">,
  now: number | Date = Date.now(),
): number {
  const predictedAt = Date.parse(arrival.predictedAt);
  const nowMs = now instanceof Date ? now.getTime() : now;
  return Number.isNaN(predictedAt)
    ? arrival.minutes
    : Math.max(0, Math.ceil((predictedAt - nowMs) / 60_000));
}

export function surfaceArrivalLabel(
  arrival: Pick<SurfaceArrival, "minutes" | "predictedAt">,
  now?: number | Date,
): string {
  const minutes = surfaceArrivalMinutes(arrival, now);
  return minutes <= 0 ? "Due" : `${minutes} min`;
}

export function surfaceSourceSummary(snapshot: SurfaceArrivalSnapshot): string {
  if (snapshot.availability !== "available") {
    return snapshot.networkId === "regional" ? "GO Bus connections" : "TTC bus and streetcar connections";
  }
  const live = snapshot.arrivals.some((arrival) => arrival.status === "live");
  const scheduled = snapshot.arrivals.some((arrival) => arrival.status === "scheduled");
  if (live && scheduled) return "Live estimates + scheduled departures";
  if (live) return snapshot.networkId === "regional" ? "Metrolinx live GO Bus estimates" : "TTC live surface estimates";
  return "Published scheduled departures";
}
