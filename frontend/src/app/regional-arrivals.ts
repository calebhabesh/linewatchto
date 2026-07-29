import { apiUrl } from "./api-client.ts";
import {
  REGIONAL_ROUTE_CARDINAL_DIRECTIONS,
  REGIONAL_ROUTE_STATIONS,
  regionalStations,
  type RegionalRouteCode,
} from "./regional-data.ts";

export type RegionalArrivalAvailability = "available" | "no-service" | "disabled" | "unavailable";

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
  status: "live" | "scheduled";
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

export type RegionalArrivalPlatformGroup = {
  key: string;
  label: string;
  arrivals: RegionalArrival[];
};

export type RegionalArrivalDirectionGroup = {
  key: string;
  lineId: string;
  lineNumber: string;
  lineName: string;
  directionLabel: string;
  destinationLabel: string;
  platforms: RegionalArrivalPlatformGroup[];
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

export type RegionalArrivalTimeDisplay = {
  primary: string;
  secondary: string;
};

export function regionalArrivalTimeDisplay(
  arrival: Pick<RegionalArrival, "minutes" | "predictedAt">,
  now: Date | number = Date.now(),
): RegionalArrivalTimeDisplay {
  const clock = formatRegionalArrivalClockTime(arrival.predictedAt, now);
  if (arrival.minutes < 60 || !clock) {
    return {
      primary: regionalArrivalMinuteLabel(arrival.minutes),
      secondary: clock,
    };
  }

  const separator = clock.indexOf(", ");
  if (separator === -1) {
    return { primary: clock, secondary: "Today" };
  }
  return {
    primary: clock.slice(separator + 2),
    secondary: clock.slice(0, separator),
  };
}

const REGIONAL_OUTWARD_DIRECTIONS: Record<RegionalRouteCode, string> = {
  BR: "Northbound",
  KI: "Westbound",
  LE: "Eastbound",
  LW: "Westbound",
  MI: "Westbound",
  RH: "Northbound",
  ST: "Northbound",
  UP: "Westbound",
};

function normalizeStationName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(go|station|terminal)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanRegionalDestination(value: string, routeCode: RegionalRouteCode) {
  const routePrefix = new RegExp(`^\\s*${routeCode}\\s*-\\s*`, "i");
  return value.replace(routePrefix, "").trim();
}

function regionalTravelDirection(arrival: RegionalArrival, stationId: string) {
  const routeCode = arrival.lineNumber.toUpperCase() as RegionalRouteCode;
  const stationIds = REGIONAL_ROUTE_STATIONS[routeCode];
  const pairedDirections = REGIONAL_ROUTE_CARDINAL_DIRECTIONS[routeCode]?.split(" / ");
  if (!stationIds || !pairedDirections || pairedDirections.length !== 2) {
    return "Outbound";
  }

  const currentIndex = stationIds.indexOf(stationId);
  const destinationName = normalizeStationName(cleanRegionalDestination(arrival.direction, routeCode));
  const destination = regionalStations.find(
    (candidate) => normalizeStationName(candidate.name) === destinationName,
  );
  const destinationIndex = destination ? stationIds.indexOf(destination.id) : -1;
  const outwardDirection = REGIONAL_OUTWARD_DIRECTIONS[routeCode];
  const inwardDirection = pairedDirections.find((direction) => direction !== outwardDirection) ?? pairedDirections[1];

  if (destinationIndex >= 0 && currentIndex >= 0) {
    if (destinationIndex === currentIndex) {
      if (destinationIndex === 0) return inwardDirection;
      if (destinationIndex === stationIds.length - 1) return outwardDirection;
    }
    return destinationIndex > currentIndex ? outwardDirection : inwardDirection;
  }

  return destinationName === "union" ? inwardDirection : outwardDirection;
}

export function groupRegionalStationArrivals(
  arrivals: RegionalArrival[],
  stationId: string,
): RegionalArrivalDirectionGroup[] {
  const groups = new Map<string, RegionalArrivalDirectionGroup>();

  for (const arrival of arrivals) {
    const routeCode = arrival.lineNumber.toUpperCase() as RegionalRouteCode;
    const destination = cleanRegionalDestination(arrival.direction, routeCode);
    const directionLabel = regionalTravelDirection(arrival, stationId);
    const key = `${arrival.lineId}:${directionLabel}:${normalizeStationName(destination)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        lineId: arrival.lineId,
        lineNumber: arrival.lineNumber,
        lineName: arrival.lineName,
        directionLabel,
        destinationLabel: `To ${destination}`,
        platforms: [],
      };
      groups.set(key, group);
    }

    const platformKey = arrival.platform.trim() || "unassigned";
    let platform = group.platforms.find((candidate) => candidate.key === platformKey);
    if (!platform) {
      platform = {
        key: platformKey,
        label: platformKey === "unassigned" ? "Platform not assigned" : `Platform ${platformKey}`,
        arrivals: [],
      };
      group.platforms.push(platform);
    }
    platform.arrivals.push(arrival);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    platforms: group.platforms.map((platform) => ({
      ...platform,
      arrivals: [...platform.arrivals].sort((a, b) => a.minutes - b.minutes),
    })),
  }));
}

export function formatRegionalArrivalClockTime(value: string, now: Date | number = Date.now()) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
  const dateKey = (date: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const current = new Date(now);
  const todayKey = dateKey(current);
  const arrivalKey = dateKey(parsed);
  if (arrivalKey === todayKey) return time;
  const tomorrow = new Date(current.getTime() + 86_400_000);
  if (arrivalKey === dateKey(tomorrow)) return `Tomorrow, ${time}`;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    weekday: "short",
  }).format(parsed);
  return `${day}, ${time}`;
}
