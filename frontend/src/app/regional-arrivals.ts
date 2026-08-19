import { apiUrl } from "./api-client.ts";
import {
  REGIONAL_ROUTE_CARDINAL_DIRECTIONS,
  REGIONAL_ROUTE_DEFINITIONS,
  REGIONAL_ROUTE_STATIONS,
  regionalStations,
  stationName,
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

export function formatRegionalArrivalSourceSummary(
  arrivals: Pick<RegionalArrival, "lineId" | "status">[],
): string {
  const liveArrivals = arrivals.filter((arrival) => arrival.status === "live");
  const hasLive = liveArrivals.length > 0;
  const hasScheduled = arrivals.some((arrival) => arrival.status === "scheduled");

  if (hasLive && hasScheduled) {
    return "Metrolinx live estimates + published schedule";
  }
  if (hasLive) {
    const hasUp = liveArrivals.some((arrival) => arrival.lineId === "regional-up");
    const hasGo = liveArrivals.some((arrival) => arrival.lineId !== "regional-up");
    if (hasGo && hasUp) {
      return "Metrolinx GO + UP Express live estimates";
    }
    return hasUp
      ? "Metrolinx UP Express live estimates"
      : "Metrolinx GO live estimates";
  }
  if (hasScheduled) {
    return "Metrolinx published schedule";
  }
  return "Metrolinx regional arrivals";
}

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
  isTerminating: boolean;
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
  if (arrival.predictedAt) {
    const predictedAt = Date.parse(arrival.predictedAt);
    if (!Number.isNaN(predictedAt)) {
      return predictedAt <= toMillis(now);
    }
  }
  const minutes = getRegionalArrivalMinutes(arrival, now);
  return minutes <= 0;
}

export function isRegionalArrivalSoon(
  arrival: Pick<RegionalArrival, "minutes"> & Partial<Pick<RegionalArrival, "predictedAt">>,
  now?: Date | number | string,
  thresholdMinutes = 5,
): boolean {
  if (arrival.predictedAt) {
    const predictedAt = Date.parse(arrival.predictedAt);
    if (!Number.isNaN(predictedAt)) {
      const millisUntilArrival = predictedAt - toMillis(now);
      return millisUntilArrival > 0 && millisUntilArrival <= thresholdMinutes * 60_000;
    }
  }
  const minutes = getRegionalArrivalMinutes(arrival, now);
  return minutes > 0 && minutes <= thresholdMinutes;
}

export type RegionalArrivalTimeDisplay = {
  primary: string;
  secondary: string;
};

type RegionalArrivalTimeDisplayOptions = {
  detailedCountdown?: boolean;
};

const DETAILED_COUNTDOWN_THRESHOLD_SECONDS = 120;
export const REGIONAL_ARRIVAL_COUNTDOWN_TICK_MS = 3_000;

export function regionalArrivalTimeDisplay(
  arrival: Pick<RegionalArrival, "minutes" | "predictedAt">,
  now: Date | number = Date.now(),
  options: RegionalArrivalTimeDisplayOptions = {},
): RegionalArrivalTimeDisplay {
  if (options.detailedCountdown && shouldUseDetailedRegionalArrivalCountdown(arrival, now)) {
    const predictedAt = Date.parse(arrival.predictedAt);
    const secondsUntilArrival = Math.ceil((predictedAt - toMillis(now)) / 1000);
    return {
      primary: `${formatCountdownDuration(secondsUntilArrival)} - ${formatCountdownDuration(secondsUntilArrival + 60)}`,
      secondary: formatRegionalArrivalClockTime(arrival.predictedAt, now),
    };
  }
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

export function shouldUseDetailedRegionalArrivalCountdown(
  arrival: Pick<RegionalArrival, "predictedAt">,
  now?: Date | number | string,
): boolean {
  const predictedAt = Date.parse(arrival.predictedAt);
  if (Number.isNaN(predictedAt)) {
    return false;
  }
  const secondsUntilArrival = Math.ceil((predictedAt - toMillis(now)) / 1000);
  return secondsUntilArrival > 0 && secondsUntilArrival < DETAILED_COUNTDOWN_THRESHOLD_SECONDS;
}

function formatCountdownDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

export const REGIONAL_ROUTE_TERMINALS: Record<RegionalRouteCode, { outward: string; inward: string }> = {
  BR: { outward: "Allandale Waterfront", inward: "Union" },
  KI: { outward: "Kitchener", inward: "Union" },
  LE: { outward: "Durham College Oshawa", inward: "Union" },
  LW: { outward: "Niagara Falls", inward: "Union" },
  MI: { outward: "Milton", inward: "Union" },
  RH: { outward: "Bloomington", inward: "Union" },
  ST: { outward: "Old Elm", inward: "Union" },
  UP: { outward: "Pearson Airport", inward: "Union" },
};

function normalizeStationName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(go|station|terminal)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function formatRegionalDestinationName(
  rawDirection: string | null | undefined,
  routeCode?: RegionalRouteCode,
): string {
  if (!rawDirection) return "";
  let cleaned = rawDirection.trim();
  if (routeCode) {
    const routePrefix = new RegExp(`^\\s*${routeCode}\\s*-\\s*`, "i");
    cleaned = cleaned.replace(routePrefix, "").trim();
  } else {
    cleaned = cleaned.replace(/^[A-Za-z]{1,4}\s*-\\s*/, "").trim();
  }
  const normalized = normalizeStationName(cleaned);
  const matchedStation = regionalStations.find(
    (candidate) => normalizeStationName(candidate.name) === normalized,
  );
  if (matchedStation) {
    return matchedStation.name;
  }
  return cleaned
    .replace(/\s+(GO(\s+Station|\s+Centre)?|Station)$/i, "")
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

  const outwardDirection = REGIONAL_OUTWARD_DIRECTIONS[routeCode];
  const inwardDirection = pairedDirections.find((direction) => direction !== outwardDirection) ?? pairedDirections[1];

  const rawDirection = (arrival.direction || "").trim().toLowerCase();
  for (const cardinal of pairedDirections) {
    if (rawDirection.startsWith(cardinal.toLowerCase())) {
      return cardinal;
    }
  }

  const currentIndex = stationIds.indexOf(stationId);
  const destinationName = normalizeStationName(cleanRegionalDestination(arrival.direction, routeCode));
  const destination = regionalStations.find(
    (candidate) => normalizeStationName(candidate.name) === destinationName,
  );
  const destinationIndex = destination ? stationIds.indexOf(destination.id) : -1;

  if (destinationIndex >= 0 && currentIndex >= 0) {
    if (destinationIndex === currentIndex) {
      return currentIndex === 0 ? inwardDirection : outwardDirection;
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
    const stationIds = REGIONAL_ROUTE_STATIONS[routeCode] ?? [];
    const currentIndex = stationIds.indexOf(stationId);
    const directionLabel = regionalTravelDirection(arrival, stationId);
    const outwardDirection = REGIONAL_OUTWARD_DIRECTIONS[routeCode];
    const isOutward = directionLabel === outwardDirection;
    const isTerminating = (currentIndex === 0 && !isOutward)
      || (currentIndex === stationIds.length - 1 && isOutward);
    const terminal = isOutward
      ? (REGIONAL_ROUTE_TERMINALS[routeCode]?.outward ?? "Terminal")
      : (REGIONAL_ROUTE_TERMINALS[routeCode]?.inward ?? "Union");

    const key = `${arrival.lineId}:${directionLabel}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        lineId: arrival.lineId,
        lineNumber: arrival.lineNumber,
        lineName: arrival.lineName,
        directionLabel,
        destinationLabel: `To ${terminal}`,
        isTerminating,
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
      const routeCode = group.lineNumber.toUpperCase() as RegionalRouteCode;
      const stationIds = REGIONAL_ROUTE_STATIONS[routeCode] ?? [];
      const currentIndex = stationIds.indexOf(stationId);
      const outwardDirection = REGIONAL_OUTWARD_DIRECTIONS[routeCode];
      const isOutward = group.directionLabel === outwardDirection;
      const isTerminating = (currentIndex === 0 && !isOutward)
        || (currentIndex === stationIds.length - 1 && isOutward);
      const terminal = isOutward
        ? (REGIONAL_ROUTE_TERMINALS[routeCode]?.outward ?? "Terminal")
        : (REGIONAL_ROUTE_TERMINALS[routeCode]?.inward ?? "Union");

      const allGroupArrivals = group.platforms.flatMap((platform) => platform.arrivals);
      const uniqueDestinations = [
        ...new Set(
          allGroupArrivals
            .map((arrival) => formatRegionalDestinationName(arrival.direction, routeCode))
            .filter(Boolean),
        ),
      ];

      let destinationLabel: string;
      if (uniqueDestinations.length === 1) {
        destinationLabel = `To ${uniqueDestinations[0]}`;
      } else if (isTerminating) {
        destinationLabel = `To ${stationName(stationId) || terminal}`;
      } else {
        destinationLabel = `To ${terminal}`;
      }

      return {
        ...group,
        destinationLabel,
        isTerminating,
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

      // Terminating arrivals always appear below departing groups.
      const terminatingRankA = groupA.isTerminating ? 1 : 0;
      const terminatingRankB = groupB.isTerminating ? 1 : 0;
      if (terminatingRankA !== terminatingRankB) {
        return terminatingRankA - terminatingRankB;
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
    hour12: true,
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
