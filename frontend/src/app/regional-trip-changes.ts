import { apiUrl } from "./api-client.ts";

export type RegionalTripChangeKind = "cancellation" | "skipped-stop" | "added-stop";

export type RegionalTripChangeStop = {
  stationId: string;
  stationName: string;
  kind: RegionalTripChangeKind;
  scheduledAt: string | null;
  platform: string;
};

export type RegionalTripChange = {
  id: string;
  kind: RegionalTripChangeKind;
  tripId: string;
  tripNumber: string;
  lineId: string;
  lineNumber: string;
  lineName: string;
  destination: string;
  serviceDate: string;
  scheduledStartAt: string | null;
  updatedAt: string | null;
  scheduleMatched: boolean;
  title: string;
  description: string;
  cause: string;
  sourceSystems: string[];
  affectedStops: RegionalTripChangeStop[];
};

export type RegionalTripChangeResponse = {
  generatedAt: string | null;
  fresh: boolean;
  source: string;
  sourceUpdatedAt: string | null;
  totalCount: number;
  changes: RegionalTripChange[];
};

export type RegionalTripChangeResult = {
  source: "backend" | "fallback";
  data: RegionalTripChangeResponse;
};

export type RegionalTripChangeFetchOptions = {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
  stationId?: string;
  query?: string;
  limit?: number;
  signal?: AbortSignal;
};

export const emptyRegionalTripChangeResponse: RegionalTripChangeResponse = {
  generatedAt: null,
  fresh: false,
  source: "LineWatchTO fixture",
  sourceUpdatedAt: null,
  totalCount: 0,
  changes: [],
};

export async function getRegionalTripChanges(
  options: RegionalTripChangeFetchOptions = {},
): Promise<RegionalTripChangeResult> {
  const params = new URLSearchParams();
  if (options.stationId?.trim()) params.set("stationId", options.stationId.trim());
  if (options.query?.trim()) params.set("query", options.query.trim());
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  const query = params.toString();
  const path = `/api/regional/trip-changes${query ? `?${query}` : ""}`;

  try {
    const response = await (options.fetcher ?? fetch)(apiUrl(path, options.apiBaseUrl), {
      cache: "no-store",
      signal: options.signal,
    });
    if (!response.ok) throw new Error(`Regional trip changes request failed with ${response.status}`);
    return { source: "backend", data: await response.json() as RegionalTripChangeResponse };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { source: "fallback", data: emptyRegionalTripChangeResponse };
  }
}

export function regionalTripChangeLabel(kind: RegionalTripChangeKind): string {
  if (kind === "cancellation") return "Cancelled";
  if (kind === "skipped-stop") return "Not stopping";
  return "Additional stop";
}

function torontoServiceDate(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export function findRegionalArrivalTripChange(
  arrival: Pick<{ tripNumber: string; scheduledAt: string }, "tripNumber" | "scheduledAt">,
  changes: RegionalTripChange[],
  stationId: string,
): RegionalTripChange | undefined {
  const serviceDate = torontoServiceDate(arrival.scheduledAt);
  return changes.find((change) =>
    change.scheduleMatched
    &&
    change.serviceDate === serviceDate
    && (change.tripNumber === arrival.tripNumber || change.tripId === arrival.tripNumber)
    && change.affectedStops.some((stop) => stop.stationId === stationId)
  );
}
