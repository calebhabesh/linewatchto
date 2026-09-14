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
  predictedAt: string | null;
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

export type SurfaceBaySection = {
  bayKey: string;
  bayLabel: string;
  groups: SurfaceArrivalGroup[];
};

export type SurfaceRouteDetails = {
  displayRouteName: string;
  destinationTarget: string;
  cleanDestination: string;
  direction: string;
  metaSubtitle: string;
};

export const SURFACE_DETAILED_COUNTDOWN_THRESHOLD_SECONDS = 120;
export const SURFACE_DUE_EXPIRY_SECONDS = 90;
export const SURFACE_ARRIVAL_COUNTDOWN_TICK_MS = 3_000;
export const SURFACE_ARRIVAL_DELAY_DISPLAY_WINDOW_MINUTES = 30;
export const TTC_SURFACE_ARRIVAL_DELAY_MINIMUM_MINUTES = 5;
export const GO_BUS_ARRIVAL_DELAY_MINIMUM_MINUTES = 15;

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

export function hasValidSurfaceArrival(
  arrival: Pick<SurfaceArrival, "minutes" | "predictedAt" | "scheduledAt">,
): boolean {
  if (arrival.predictedAt && !Number.isNaN(Date.parse(arrival.predictedAt ?? arrival.scheduledAt ?? ""))) {
    return true;
  }
  if (arrival.scheduledAt && !Number.isNaN(Date.parse(arrival.scheduledAt))) {
    return true;
  }
  return arrival.minutes != null && Number.isFinite(arrival.minutes);
}

export function groupSurfaceArrivals(
  arrivals: SurfaceArrival[],
  activeArrivals?: SurfaceArrival[],
): SurfaceArrivalGroup[] {
  const activeSet = activeArrivals ? new Set(activeArrivals) : null;
  const activeTripIds = activeArrivals
    ? new Set(activeArrivals.map((a) => a.tripId || `${a.mode}:${a.route}:${a.destination}:${a.predictedAt}`))
    : null;
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
    const hasValidTime = hasValidSurfaceArrival(arrival);
    const isArrivalActive =
      hasValidTime &&
      (!activeSet ||
        activeSet.has(arrival) ||
        (activeTripIds?.has(arrival.tripId || `${arrival.mode}:${arrival.route}:${arrival.destination}:${arrival.predictedAt}`) ?? false));
    if (isArrivalActive) {
      group.arrivals.push(arrival);
    }
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      arrivals: group.arrivals.toSorted((a, b) => Date.parse(a.predictedAt ?? a.scheduledAt ?? "") - Date.parse(b.predictedAt ?? b.scheduledAt ?? "")),
    }))
    .toSorted((a, b) => {
      const hasA = a.arrivals.length > 0;
      const hasB = b.arrivals.length > 0;
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      const timeA = Date.parse(a.arrivals[0]?.predictedAt ?? a.arrivals[0]?.scheduledAt ?? "");
      const timeB = Date.parse(b.arrivals[0]?.predictedAt ?? b.arrivals[0]?.scheduledAt ?? "");
      if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
        return timeA - timeB;
      }
      return a.route.localeCompare(b.route, undefined, { numeric: true });
    });
}

export function parseSurfaceRouteDetails(
  group: Pick<SurfaceArrivalGroup, "mode" | "route" | "routeName" | "destination" | "bayPlatform">,
  networkId: "ttc" | "regional" = "ttc",
): SurfaceRouteDetails {
  const rawDestination = (group.destination || "").trim();
  const rawRouteName = (group.routeName || "").trim();
  const rawRoute = (group.route || "").trim();

  let direction = "";
  let working = rawDestination;

  // 1. Extract leading cardinal direction (e.g. "North - 935 Jane...", "Northbound towards...", "East: ...")
  const cardinalMatch = working.match(
    /^(Northbound|Southbound|Eastbound|Westbound|North|South|East|West)(?:\s*[-–—:]\s*|\s+)/i
  );
  if (cardinalMatch) {
    const rawDir = cardinalMatch[1].toLowerCase();
    if (rawDir.startsWith("north")) direction = "North";
    else if (rawDir.startsWith("south")) direction = "South";
    else if (rawDir.startsWith("east")) direction = "East";
    else if (rawDir.startsWith("west")) direction = "West";

    working = working.slice(cardinalMatch[0].length).trim();
  }

  // 2. Strip leading route number / branch (e.g. "935 ", "935A - ", "504 ", etc.)
  if (rawRoute) {
    const escapedRoute = rawRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const routeNumberRegex = new RegExp(`^(?:${escapedRoute}[a-zA-Z]?|\\d+[a-zA-Z]?)(?:\\s*[-–—:]\\s*|\\s+)`, "i");
    working = working.replace(routeNumberRegex, "").trim();
  } else {
    working = working.replace(/^\d+[a-zA-Z]?(?:\s*[-–—:]\s*|\s+)/, "").trim();
  }

  // 3. Extract destination target and condensed route name
  let destinationTarget = "";
  const towardMatch = working.match(/\btowards?\s+(.+)$/i);
  const toMatch = working.match(/\bto\s+(.+)$/i);

  if (towardMatch) {
    destinationTarget = `To ${towardMatch[1].trim()}`;
  } else if (toMatch) {
    destinationTarget = `To ${toMatch[1].trim()}`;
  } else if (working && rawRouteName && working.toLowerCase() !== rawRouteName.toLowerCase()) {
    destinationTarget = `To ${working}`;
  } else if (working && !rawRouteName) {
    destinationTarget = `To ${working}`;
  }

  // 4. Derive concise display route name (e.g. "Dupont", "Jane Express", "King", "Etobicoke-Bloor")
  let displayRouteName = rawRouteName;
  if (!displayRouteName) {
    if (towardMatch) {
      displayRouteName = working.slice(0, towardMatch.index).trim();
    } else if (toMatch) {
      displayRouteName = working.slice(0, toMatch.index).trim();
    } else {
      displayRouteName = working;
    }
  }
  if (!displayRouteName) {
    displayRouteName = `${group.mode === "streetcar" ? "Streetcar" : "Bus"} service`;
  }

  let cleanDestination = working;
  if (!cleanDestination) {
    cleanDestination = rawRouteName || displayRouteName;
  } else if (rawRouteName && cleanDestination.toLowerCase().startsWith("to ")) {
    cleanDestination = `${rawRouteName} ${cleanDestination}`;
  }

  // 5. Format bay label
  let bayLabel = (group.bayPlatform || "").trim();
  if (bayLabel && /^\d+$/.test(bayLabel)) {
    bayLabel = `Bay ${bayLabel}`;
  } else if (/^streetcar\s+platform$/i.test(bayLabel)) {
    bayLabel = "Platform";
  }

  // 6. Mode label
  const modeLabel = group.mode === "streetcar"
    ? "TTC Streetcar"
    : networkId === "regional"
      ? "GO Bus"
      : "TTC Bus";

  // 7. Assemble subtitle meta (e.g. "TTC Bus · East · Bay 3")
  const metaParts: string[] = [modeLabel];
  if (direction) {
    metaParts.push(direction);
  }
  if (bayLabel) {
    metaParts.push(bayLabel);
  } else {
    metaParts.push("Bay not supplied");
  }

  return {
    displayRouteName,
    destinationTarget,
    cleanDestination,
    direction,
    metaSubtitle: metaParts.join(" · "),
  };
}

export function buildPinnedSurfaceGroups(
  activeGroups: SurfaceArrivalGroup[],
  allSnapshotArrivals: SurfaceArrival[],
  pinnedLineIds: Iterable<string>,
  networkId: "ttc" | "regional" = "ttc",
): SurfaceArrivalGroup[] {
  const pinnedSet = new Set(pinnedLineIds);
  const isPinned = (route: string) => pinnedSet.has(route) || pinnedSet.has(`surface:${route}`);

  const pinnedActive = activeGroups.filter((group) => isPinned(group.route));
  const activePinnedRoutes = new Set(pinnedActive.map((group) => group.route));

  const missingPinnedRoutes: string[] = [];
  for (const pin of pinnedSet) {
    let route = "";
    if (pin.startsWith("surface:")) {
      route = pin.slice("surface:".length);
    } else if (!pin.startsWith("line-") && !pin.startsWith("regional-")) {
      route = pin;
    }
    if (route && !activePinnedRoutes.has(route) && !missingPinnedRoutes.includes(route)) {
      missingPinnedRoutes.push(route);
    }
  }

  const syntheticGroups: SurfaceArrivalGroup[] = missingPinnedRoutes.map((route) => {
    const sample = allSnapshotArrivals.find((arrival) => arrival.route === route);
    const mode = sample?.mode ?? (networkId === "regional" ? "bus" : (/^5[0-1][0-9]/.test(route) ? "streetcar" : "bus"));
    const routeName = sample?.routeName ?? `Route ${route}`;
    const destination = sample?.destination ?? "";
    const bayPlatform = sample?.bayPlatform ?? "";
    const stopName = sample?.stopName ?? "";

    return {
      key: `placeholder:surface:${route}`,
      mode,
      route,
      routeName,
      destination,
      bayPlatform,
      stopName,
      arrivals: [],
    };
  });

  return [...pinnedActive, ...syntheticGroups];
}

export function getSurfaceArrivalGroupBayKey(
  group: Pick<SurfaceArrivalGroup, "bayPlatform">,
): string {
  let bayLabel = (group.bayPlatform || "").trim();
  if (bayLabel && /^\d+$/.test(bayLabel)) {
    bayLabel = `Bay ${bayLabel}`;
  }
  return bayLabel || "unspecified";
}

export function groupSurfaceArrivalsByBay(
  groups: SurfaceArrivalGroup[],
  pinnedRouteIds: Iterable<string> = [],
): SurfaceBaySection[] {
  const pinnedSet = new Set(pinnedRouteIds);
  const isGroupPinned = (g: SurfaceArrivalGroup) =>
    pinnedSet.has(g.route) || pinnedSet.has(`surface:${g.route}`);

  const bayMap = new Map<string, SurfaceBaySection>();

  for (const group of groups) {
    let bayLabel = (group.bayPlatform || "").trim();
    if (bayLabel && /^\d+$/.test(bayLabel)) {
      bayLabel = `Bay ${bayLabel}`;
    }
    const bayKey = getSurfaceArrivalGroupBayKey(group);

    const section = bayMap.get(bayKey) ?? {
      bayKey,
      bayLabel: bayLabel || "Bay not supplied",
      groups: [],
    };
    section.groups.push(group);
    bayMap.set(bayKey, section);
  }

  for (const section of bayMap.values()) {
    section.groups.sort((a, b) => {
      const aPinned = isGroupPinned(a) ? 0 : 1;
      const bPinned = isGroupPinned(b) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;

      const timeA = Date.parse(a.arrivals[0]?.predictedAt ?? a.arrivals[0]?.scheduledAt ?? "");
      const timeB = Date.parse(b.arrivals[0]?.predictedAt ?? b.arrivals[0]?.scheduledAt ?? "");
      if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
        return timeA - timeB;
      }
      return a.route.localeCompare(b.route, undefined, { numeric: true });
    });
  }

  return [...bayMap.values()].sort((a, b) => {
    const aHasPinned = a.groups.some(isGroupPinned) ? 0 : 1;
    const bHasPinned = b.groups.some(isGroupPinned) ? 0 : 1;
    if (aHasPinned !== bHasPinned) return aHasPinned - bHasPinned;

    if (a.bayKey === "unspecified") return 1;
    if (b.bayKey === "unspecified") return -1;

    const numA = a.bayLabel.match(/\d+/);
    const numB = b.bayLabel.match(/\d+/);
    if (numA && numB) {
      const diff = parseInt(numA[0], 10) - parseInt(numB[0], 10);
      if (diff !== 0) return diff;
    }

    return a.bayLabel.localeCompare(b.bayLabel, undefined, { numeric: true });
  });
}

export function isSurfaceArrivalDue(
  arrival: Pick<SurfaceArrival, "minutes" | "predictedAt"> & Partial<Pick<SurfaceArrival, "scheduledAt">>,
  now: number | Date = Date.now(),
): boolean {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const predictedAt = Date.parse(arrival.predictedAt ?? arrival.scheduledAt ?? "");
  if (!Number.isNaN(predictedAt)) {
    return predictedAt <= nowMs;
  }
  return arrival.minutes != null && arrival.minutes <= 0;
}

export function isSurfaceArrivalExpired(
  arrival: Pick<SurfaceArrival, "predictedAt"> & Partial<Pick<SurfaceArrival, "scheduledAt">>,
  now: number | Date = Date.now(),
  graceSeconds: number = SURFACE_DUE_EXPIRY_SECONDS,
): boolean {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const predictedAt = Date.parse(arrival.predictedAt ?? arrival.scheduledAt ?? "");
  if (Number.isNaN(predictedAt)) return false;
  return nowMs - predictedAt > graceSeconds * 1000;
}

export function filterActiveSurfaceArrivals(
  arrivals: SurfaceArrival[],
  now: number | Date = Date.now(),
  graceSeconds: number = SURFACE_DUE_EXPIRY_SECONDS,
): SurfaceArrival[] {
  return arrivals.filter((arrival) => !isSurfaceArrivalExpired(arrival, now, graceSeconds));
}

export function shouldUseDetailedSurfaceArrivalCountdown(
  arrival: Pick<SurfaceArrival, "predictedAt"> & Partial<Pick<SurfaceArrival, "scheduledAt">>,
  now: number | Date = Date.now(),
): boolean {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const predictedAt = Date.parse(arrival.predictedAt ?? arrival.scheduledAt ?? "");
  if (Number.isNaN(predictedAt)) return false;
  const secondsUntilArrival = Math.ceil((predictedAt - nowMs) / 1000);
  return secondsUntilArrival > 0 && secondsUntilArrival < SURFACE_DETAILED_COUNTDOWN_THRESHOLD_SECONDS;
}

export function formatSurfaceCountdownDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatSurfaceArrivalMinutesDuration(minutes: number): string {
  if (minutes <= 0) return "Due";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

export function formatSurfaceArrivalTileLabel(
  arrival: Pick<SurfaceArrival, "minutes" | "predictedAt"> & Partial<Pick<SurfaceArrival, "scheduledAt">>,
  options: { detailedCountdown?: boolean; now?: number | Date } = {},
): string {
  const nowMs = options.now instanceof Date
    ? options.now.getTime()
    : options.now ?? Date.now();
  const predictedAt = Date.parse(arrival.predictedAt ?? arrival.scheduledAt ?? "");

  if (options.detailedCountdown && shouldUseDetailedSurfaceArrivalCountdown(arrival, nowMs)) {
    const secondsUntilArrival = Math.ceil((predictedAt - nowMs) / 1000);
    return `${formatSurfaceCountdownDuration(secondsUntilArrival)} - ${formatSurfaceCountdownDuration(secondsUntilArrival + 60)}`;
  }

  if (!Number.isNaN(predictedAt)) {
    const millisUntilArrival = predictedAt - nowMs;
    if (millisUntilArrival <= 0) {
      return "Due";
    }
    return formatSurfaceArrivalMinutesDuration(Math.ceil(millisUntilArrival / 60_000));
  }

  if (arrival.minutes == null) {
    return "—";
  }
  if (arrival.minutes <= 0) {
    return "Due";
  }
  return formatSurfaceArrivalMinutesDuration(arrival.minutes);
}

export function formatSurfaceArrivalClockTime(
  predictedAt: string | null | undefined,
): string | null {
  if (!predictedAt) return null;
  const date = new Date(predictedAt);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function surfaceArrivalMinutes(
  arrival: Pick<SurfaceArrival, "minutes" | "predictedAt"> & Partial<Pick<SurfaceArrival, "scheduledAt">>,
  now: number | Date = Date.now(),
): number {
  const predictedAt = Date.parse(arrival.predictedAt ?? arrival.scheduledAt ?? "");
  const nowMs = now instanceof Date ? now.getTime() : now;
  return Number.isNaN(predictedAt)
    ? arrival.minutes
    : Math.max(0, Math.ceil((predictedAt - nowMs) / 60_000));
}

export function getSurfaceArrivalDelayMinutes(
  arrival: Pick<SurfaceArrival, "agency" | "minutes" | "predictedAt" | "scheduledAt" | "status">,
  now: number | Date = Date.now(),
): number | null {
  if (arrival.status !== "live" || !arrival.scheduledAt) return null;
  const predictedAt = Date.parse(arrival.predictedAt ?? arrival.scheduledAt ?? "");
  const scheduledAt = Date.parse(arrival.scheduledAt);
  if (Number.isNaN(predictedAt) || Number.isNaN(scheduledAt)) return null;

  const delayMinutes = Math.trunc((predictedAt - scheduledAt) / 60_000);
  const minimumDelayMinutes = arrival.agency === "GO Transit"
    ? GO_BUS_ARRIVAL_DELAY_MINIMUM_MINUTES
    : TTC_SURFACE_ARRIVAL_DELAY_MINIMUM_MINUTES;
  if (delayMinutes <= minimumDelayMinutes) return null;
  return surfaceArrivalMinutes(arrival, now) <= SURFACE_ARRIVAL_DELAY_DISPLAY_WINDOW_MINUTES
    ? delayMinutes
    : null;
}

export function surfaceArrivalLabel(
  arrival: Pick<SurfaceArrival, "minutes" | "predictedAt"> & Partial<Pick<SurfaceArrival, "scheduledAt">>,
  now?: number | Date,
): string {
  const minutes = surfaceArrivalMinutes(arrival, now);
  if (minutes <= 0) return "Due";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`;
}

export function surfaceSourceSummary(snapshot: SurfaceArrivalSnapshot): string {
  if (snapshot.availability !== "available") {
    return snapshot.networkId === "regional" ? "GO Bus connections" : "TTC bus and streetcar connections";
  }
  const live = snapshot.arrivals.some((arrival) => arrival.status === "live");
  const scheduled = snapshot.arrivals.some((arrival) => arrival.status === "scheduled" && arrival.scheduledAt !== null);
  if (live && scheduled) return "Live estimates + scheduled departures";
  if (live) return snapshot.networkId === "regional" ? "Metrolinx live GO Bus estimates" : "TTC live surface estimates";
  return scheduled ? "Published scheduled departures" : "Route connections · predictions unavailable";
}
