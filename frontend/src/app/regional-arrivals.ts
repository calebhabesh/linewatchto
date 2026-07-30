import { apiUrl } from "./api-client.ts";
import {
  REGIONAL_ROUTE_CARDINAL_DIRECTIONS,
  REGIONAL_ROUTE_DEFINITIONS,
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

function toMillis(value: Date | number | string | undefined): number {
  if (value instanceof Date) {
    const dateMillis = value.getTime();
    return Number.isNaN(dateMillis) ? Date.now() : dateMillis;
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? Date.now() : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  return Date.now();
}

export function getRegionalArrivalMinutes(
  arrival: Pick<RegionalArrival, "minutes"> & Partial<Pick<RegionalArrival, "predictedAt">>,
  now: Date | number | string = Date.now(),
): number {
  if (arrival.predictedAt) {
    const predictedMs = Date.parse(arrival.predictedAt);
    if (!Number.isNaN(predictedMs)) {
      const nowMs = toMillis(now);
      return Math.floor((predictedMs - nowMs) / 60_000);
    }
  }
  return arrival.minutes;
}

export function isRegionalArrivalDue(
  arrival: Pick<RegionalArrival, "minutes"> & Partial<Pick<RegionalArrival, "predictedAt">>,
  now?: Date | number | string,
): boolean {
  const minutes = getRegionalArrivalMinutes(arrival, now);
  return minutes <= 0;
}

export function isRegionalArrivalSoon(
  arrival: Pick<RegionalArrival, "minutes"> & Partial<Pick<RegionalArrival, "predictedAt">>,
  now?: Date | number | string,
  thresholdMinutes = 5,
): boolean {
  const minutes = getRegionalArrivalMinutes(arrival, now);
  return minutes > 0 && minutes <= thresholdMinutes;
}

export type RegionalArrivalTimeDisplay = {
  primary: string;
  secondary: string;
};

export function regionalArrivalTimeDisplay(
  arrival: Pick<RegionalArrival, "minutes" | "predictedAt">,
  now: Date | number = Date.now(),
): RegionalArrivalTimeDisplay {
  const minutes = getRegionalArrivalMinutes(arrival, now);
  const clock = formatRegionalArrivalClockTime(arrival.predictedAt, now);
  if (minutes < 60 || !clock) {
    return {
      primary: regionalArrivalMinuteLabel(minutes),
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

const REGIONAL_ROUTE_INDEX = new Map<string, number>(
  REGIONAL_ROUTE_DEFINITIONS.map((route, index) => [route.number.toUpperCase(), index]),
);

function regionalLineRank(lineNumber: string, lineId: string): number {
  const code = (lineNumber || "").trim().toUpperCase();
  if (REGIONAL_ROUTE_INDEX.has(code)) {
    return REGIONAL_ROUTE_INDEX.get(code)!;
  }
  const cleanId = (lineId || "").toLowerCase().replace(/^(regional|line|go)-/, "");
  const foundIndex = REGIONAL_ROUTE_DEFINITIONS.findIndex(
    (route) => route.id.toLowerCase().endsWith(cleanId) || route.number.toLowerCase() === cleanId
  );
  if (foundIndex !== -1) {
    return foundIndex;
  }
  return 999;
}

function regionalDirectionRank(directionLabel: string): number {
  if (/^Northbound/i.test(directionLabel)) return 0;
  if (/^Eastbound/i.test(directionLabel)) return 1;
  if (/^Southbound/i.test(directionLabel)) return 2;
  if (/^Westbound/i.test(directionLabel)) return 3;
  return 4;
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
    const key = `${arrival.lineId}:${directionLabel}`;
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

  return [...groups.values()]
    .map((group) => {
      const destinations = [...new Set(group.platforms
        .flatMap((platform) => platform.arrivals)
        .map((arrival) => cleanRegionalDestination(
          arrival.direction,
          arrival.lineNumber.toUpperCase() as RegionalRouteCode,
        ))
        .filter(Boolean))];
      return {
        ...group,
        destinationLabel: destinations.length > 1
          ? `Destinations: ${destinations.join(" / ")}`
          : `To ${destinations[0] ?? group.lineName}`,
        platforms: group.platforms.map((platform) => ({
          ...platform,
          arrivals: [...platform.arrivals].sort((a, b) => a.minutes - b.minutes),
        })),
      };
    })
    .sort((groupA, groupB) => {
      const lineRankA = regionalLineRank(groupA.lineNumber, groupA.lineId);
      const lineRankB = regionalLineRank(groupB.lineNumber, groupB.lineId);
      if (lineRankA !== lineRankB) {
        return lineRankA - lineRankB;
      }

      const dirRankA = regionalDirectionRank(groupA.directionLabel);
      const dirRankB = regionalDirectionRank(groupB.directionLabel);
      if (dirRankA !== dirRankB) {
        return dirRankA - dirRankB;
      }

      const firstArrivalA = groupA.platforms[0]?.arrivals[0]?.minutes ?? Number.MAX_SAFE_INTEGER;
      const firstArrivalB = groupB.platforms[0]?.arrivals[0]?.minutes ?? Number.MAX_SAFE_INTEGER;
      return firstArrivalA - firstArrivalB;
    });
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
