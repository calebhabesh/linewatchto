import { apiUrl } from "./api-client.ts";
import { regionalStations } from "./regional-data.ts";

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

export function cleanRegionalTripNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("notice-")) return "";
  const dateLineMatch = trimmed.match(/^\d{8}-[A-Za-z0-9]+-(\d+[A-Za-z]?)$/);
  if (dateLineMatch) return dateLineMatch[1];
  const dateMatch = trimmed.match(/^\d{8}-(\d+[A-Za-z]?)$/);
  if (dateMatch) return dateMatch[1];
  if (/^\d+[A-Za-z]?$/.test(trimmed)) return trimmed;
  const prefixMatch = trimmed.match(/^[A-Za-z]{1,4}[-_ ]?(\d+[A-Za-z]?)$/);
  if (prefixMatch) return prefixMatch[1];
  return trimmed;
}

function normalizeRegionalStationName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(go|station|centre|terminal)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function cleanRegionalDestinationText(destination: string | null | undefined): string {
  if (!destination) return "";
  const cleaned = destination.replace(/^[A-Za-z]{1,4}\s*-\s*/, "").trim();
  const normalized = normalizeRegionalStationName(cleaned);
  const matchedStation = regionalStations.find(
    (candidate) => normalizeRegionalStationName(candidate.name) === normalized,
  );
  if (matchedStation) {
    return matchedStation.name;
  }
  return cleaned
    .replace(/\s+(GO(\s+Station|\s+Centre)?|Station)$/i, "")
    .trim();
}

export function formatRegionalTripDisplayName(change: {
  tripNumber?: string | null;
  tripId?: string | null;
}): string {
  const number = cleanRegionalTripNumber(change.tripNumber || change.tripId);
  if (number) {
    return `Train ${number}`;
  }
  return "Train";
}

export function formatRegionalTripSubtitle(change: {
  lineName?: string | null;
  lineNumber?: string | null;
  destination?: string | null;
  affectedStops?: Array<{ stationName?: string | null }> | null;
}): string {
  const rawLineName = change.lineName?.trim() || "";
  const lineLabel = rawLineName
    ? rawLineName.endsWith("Line") || rawLineName.toLowerCase().includes("express")
      ? rawLineName
      : `${rawLineName} Line`
    : "";

  const destination = cleanRegionalDestinationText(change.destination);
  const rawFirstStop = change.affectedStops?.[0]?.stationName?.trim() || "";
  const firstStop = cleanRegionalDestinationText(rawFirstStop);

  let routeText = "";
  if (firstStop && destination && firstStop.toLowerCase() !== destination.toLowerCase()) {
    routeText = `${firstStop} to ${destination}`;
  } else if (destination) {
    routeText = `To ${destination}`;
  }

  if (lineLabel && routeText) {
    return `${lineLabel} · ${routeText}`;
  }
  return lineLabel || routeText;
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
