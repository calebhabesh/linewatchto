import type { StationArrival, StationLine } from "./station-data";

type ArrivalTimeFields = Pick<StationArrival, "label" | "minutes" | "status"> & Partial<Pick<StationArrival, "predictedAt">>;
type ArrivalTileLabelFields = Pick<StationArrival, "label" | "minutes"> & Partial<Pick<StationArrival, "predictedAt" | "status">>;
type ArrivalSourceFields = Pick<StationArrival, "status"> & Partial<Pick<StationArrival, "source">>;
type ArrivalSourceBadgeOptions = {
  emptyLiveDirection?: boolean;
};
type ArrivalTileLabelOptions = {
  detailedCountdown?: boolean;
  now?: Date | number | string;
};

type GroupStationArrivalsOptions = {
  stationId?: string;
  maxArrivalsPerDirection?: number;
  includeEmptyDirections?: boolean;
};

export type StationArrivalGroup = {
  key: string;
  line: StationLine | null;
  lineId: string;
  lineNumber: string;
  directionLabel: string;
  isTerminating?: boolean;
  arrivals: StationArrival[];
};

const DIRECTION_BY_DESTINATION: Record<string, Record<string, string>> = {
  "line-2": {
    kennedy: "Eastbound",
    kipling: "Westbound",
  },
  "line-4": {
    "don mills": "Eastbound",
    "sheppard-yonge": "Westbound",
    "sheppard yonge": "Westbound",
  },
  "line-5": {
    kennedy: "Eastbound",
    "mount dennis": "Westbound",
  },
  "line-6": {
    "finch west": "Eastbound",
    "humber college": "Westbound",
  },
};

const DIRECTION_RANK: Record<string, number> = {
  Northbound: 10,
  Eastbound: 10,
  Southbound: 20,
  Westbound: 20,
};

const LINE_1_STATION_ORDER = [
  "vaughan-metropolitan-centre", "highway-407", "pioneer-village",
  "york-university", "finch-west", "downsview-park", "sheppard-west",
  "wilson", "yorkdale", "lawrence-west", "glencairn", "cedarvale",
  "st-clair-west", "dupont", "spadina", "st-george", "museum",
  "queens-park", "st-patrick", "osgoode", "st-andrew", "union", "king",
  "queen", "tmu", "college", "wellesley", "bloor-yonge", "rosedale",
  "summerhill", "st-clair", "davisville", "eglinton", "lawrence",
  "york-mills", "sheppard-yonge", "north-york-centre", "finch",
];

const LINE_1_UNION_INDEX = LINE_1_STATION_ORDER.indexOf("union");
const LINE_1_UNION_TERMINAL_BY_CARDINAL: Record<string, string> = {
  Northbound: "Finch",
  Southbound: "Vaughan Metropolitan Centre",
};

const TERMINAL_BY_CARDINAL: Record<string, Record<string, string>> = {
  "line-2": {
    Eastbound: "Kennedy",
    Westbound: "Kipling",
  },
  "line-4": {
    Eastbound: "Don Mills",
    Westbound: "Sheppard-Yonge",
  },
  "line-5": {
    Eastbound: "Kennedy",
    Westbound: "Mount Dennis",
  },
  "line-6": {
    Eastbound: "Finch West",
    Westbound: "Humber College",
  },
};

function getTerminalDestination(lineId: string, cardinal: string, stationId?: string): string {
  if (lineId === "line-1") {
    if (!stationId) {
      return "";
    }
    const stationIndex = LINE_1_STATION_ORDER.indexOf(stationId);
    if (stationIndex === -1) {
      return "";
    }
    if (stationId === "union") {
      return LINE_1_UNION_TERMINAL_BY_CARDINAL[cardinal] ?? "";
    }
    if (stationIndex < LINE_1_UNION_INDEX) {
      return cardinal === "Northbound" ? "Vaughan Metropolitan Centre" : "Finch";
    }
    if (stationIndex > LINE_1_UNION_INDEX) {
      return cardinal === "Northbound" ? "Finch" : "Vaughan Metropolitan Centre";
    }
  }

  return TERMINAL_BY_CARDINAL[lineId]?.[cardinal] ?? "";
}

const SCHEDULED_ARRIVALS_DISCLAIMER =
  "Scheduled arrivals use TTC timetable data and are not live train predictions.";
const UNAVAILABLE_ARRIVALS_DISCLAIMER =
  "Scheduled arrival data is currently unavailable. Arrival predictions are not live TTC predictions.";
const LIVE_ARRIVALS_DISCLAIMER =
  "Arrival predictions are source-labeled and may be affected by active TTC service alerts. Live arrival times and ranges may fluctuate as new GTFS-RT feed samples are received.";
const MIXED_ARRIVALS_DISCLAIMER =
  "Live GTFS-RT rows are shown where available; scheduled rows fill missing directions. Live arrival times and ranges may fluctuate as new GTFS-RT feed samples are received.";
const DETAILED_COUNTDOWN_THRESHOLD_SECONDS = 120;
export const ARRIVAL_COUNTDOWN_TICK_MS = 3_000;

export function groupStationArrivals(
  arrivals: StationArrival[],
  lines: StationLine[],
  options: GroupStationArrivalsOptions | number = {},
): StationArrivalGroup[] {
  const stationId = typeof options === "number" ? undefined : options.stationId;
  const maxArrivalsPerDirection = typeof options === "number"
    ? options
    : options.maxArrivalsPerDirection ?? 3;
  const includeEmptyDirections = typeof options !== "number" && options.includeEmptyDirections === true;
  const linesById = new Map(lines.map((line, index) => [line.id, { line, index }]));
  const groups = new Map<string, StationArrivalGroup>();

  for (const arrival of arrivals) {
    const lineEntry = linesById.get(arrival.lineId);
    const directionLabel = formatArrivalDirection(arrival, lineEntry?.line ?? null, stationId);
    const key = `${arrival.lineId}:${directionLabel}`;
    // Determine if this direction group is terminating at the current station.
    // Extract the cardinal from the direction label (first word) and compare the
    // canonical terminal station for that direction to the current station.
    const cardinal = directionLabel.split(" ")[0];
    const terminalDestination = stationId
      ? getTerminalDestination(arrival.lineId, cardinal, stationId)
      : "";
    const isTerminatingHere = !!stationId && !!terminalDestination
      && stationId === (arrival.lineId === "line-1"
        ? LINE_1_STATION_ORDER.find(
            (id) => id.replace(/-/g, " ") === terminalDestination.toLowerCase().replace(/-/g, " ")
              || terminalDestination.toLowerCase().replace(/\s+/g, "-") === id,
          )
        : terminalDestination.toLowerCase().replace(/\s+/g, "-"));
    const group = groups.get(key) ?? {
      key,
      line: lineEntry?.line ?? null,
      lineId: arrival.lineId,
      lineNumber: lineEntry?.line.number ?? arrival.lineId.replace("line-", ""),
      directionLabel,
      isTerminating: isTerminatingHere,
      arrivals: [],
    };

    group.arrivals.push(arrival);
    groups.set(key, group);
  }

  if (includeEmptyDirections) {
    for (const [lineIndex, line] of lines.entries()) {
      for (const direction of platformDirections(line.platformLabel)) {
        const directionLabel = formatArrivalDirection({ lineId: line.id, direction }, line, stationId);
        const key = `${line.id}:${directionLabel}`;
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            line,
            lineId: line.id,
            lineNumber: line.number,
            directionLabel,
            arrivals: [],
          });
        }
      }
      linesById.set(line.id, { line, index: lineIndex });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      arrivals: group.arrivals
        .toSorted(compareArrivals)
        .filter(uniqueArrival)
        .slice(0, maxArrivalsPerDirection),
    }))
    .toSorted((a, b) => {
      const lineA = linesById.get(a.lineId)?.index ?? Number.MAX_SAFE_INTEGER;
      const lineB = linesById.get(b.lineId)?.index ?? Number.MAX_SAFE_INTEGER;
      if (lineA !== lineB) return lineA - lineB;

      // Terminating arrivals always appear below departing groups.
      const terminatingA = a.isTerminating ? 1 : 0;
      const terminatingB = b.isTerminating ? 1 : 0;
      if (terminatingA !== terminatingB) return terminatingA - terminatingB;

      const directionA = directionRank(a.directionLabel);
      const directionB = directionRank(b.directionLabel);
      if (directionA !== directionB) return directionA - directionB;

      return compareOptionalArrivals(a.arrivals[0], b.arrivals[0]);
    });
}

export function formatArrivalDirection(
  arrival: Pick<StationArrival, "lineId" | "direction">,
  line: StationLine | null,
  stationId?: string,
): string {
  const cardinalMatch = arrival.direction.match(/^(Northbound|Southbound|Eastbound|Westbound)(?:\s+to\s+(.+))?$/i);
  if (cardinalMatch) {
    const cardinal = titleCase(cardinalMatch[1]);
    let destination = cleanDestination(cardinalMatch[2] ?? "");
    if (!destination) {
      destination = getTerminalDestination(arrival.lineId, cardinal, stationId);
    }
    const unionDirection = line1UnionDirection(stationId, arrival.lineId, cardinal, destination);
    if (unionDirection) {
      return unionDirection;
    }
    return destination ? `${cardinal} to ${destination}` : cardinal;
  }

  const destination = extractDestination(arrival.direction);
  if (!destination) {
    return arrival.direction;
  }

  const normalizedDestination = normalizeDestination(destination);
  const unionDirection = line1UnionDirection(stationId, arrival.lineId, "", destination);
  if (unionDirection) {
    return unionDirection;
  }

  const line1Direction = line1CardinalDirection(stationId, normalizedDestination);
  if (arrival.lineId === "line-1" && line1Direction) {
    return `${line1Direction} to ${destination}`;
  }

  const cardinal = DIRECTION_BY_DESTINATION[arrival.lineId]?.[normalizedDestination];
  if (cardinal) {
    return `${cardinal} to ${destination}`;
  }

  const platformDirection = singlePlatformDirection(line?.platformLabel ?? "");
  return platformDirection ? `${platformDirection} to ${destination}` : `To ${destination}`;
}

export function formatArrivalDisclaimer(arrivals: StationArrival[], disclaimer: string | null | undefined): string {
  if (hasArrivalStatus(arrivals, "live") && hasArrivalStatus(arrivals, "scheduled")) {
    return MIXED_ARRIVALS_DISCLAIMER;
  }
  if (arrivals.some((arrival) => arrival.status === "live")) {
    return LIVE_ARRIVALS_DISCLAIMER;
  }
  if (arrivals.some((arrival) => arrival.status === "scheduled")) {
    return SCHEDULED_ARRIVALS_DISCLAIMER;
  }
  if (arrivals.some((arrival) => arrival.status === "unavailable")) {
    return UNAVAILABLE_ARRIVALS_DISCLAIMER;
  }
  return disclaimer || SCHEDULED_ARRIVALS_DISCLAIMER;
}

export function formatArrivalSourceSummary(arrivals: ArrivalSourceFields[], source: string): string {
  if (hasArrivalStatus(arrivals, "live") && hasArrivalStatus(arrivals, "scheduled")) {
    return "Mixed Live + Scheduled Fallback";
  }
  return formatArrivalSourceText(source);
}

export function formatArrivalSourceBadgeLabel(
  arrivals: ArrivalSourceFields[],
  options: ArrivalSourceBadgeOptions = {},
): string {
  if (arrivals.length === 0 && options.emptyLiveDirection) {
    return "No live ETA";
  }
  if (hasArrivalStatus(arrivals, "live") && hasArrivalStatus(arrivals, "scheduled")) {
    return "Mixed";
  }
  if (hasArrivalStatus(arrivals, "live")) {
    return "Live";
  }
  if (hasArrivalStatus(arrivals, "scheduled")) {
    return "Scheduled";
  }
  if (hasArrivalStatus(arrivals, "demo")) {
    return "Demo";
  }
  return "Unavailable";
}

export function formatArrivalSourceText(source: string): string {
  if (!source) return "";
  const lower = source.toLowerCase();
  if (lower === "ttc scheduled service") {
    return `${source} - Not Live`;
  }
  return source.replace(/ttc gtfs-rt subway trip updates/gi, "TTC GTFS-RT LIVE SUBWAY TRIP UPDATES");
}

export function isArrivalDue(arrival: ArrivalTimeFields, now?: Date | number | string): boolean {
  if (arrival.status === "unavailable") {
    return false;
  }
  if (arrival.status === "live" && arrival.predictedAt) {
    const predictedAt = Date.parse(arrival.predictedAt);
    if (!Number.isNaN(predictedAt)) {
      return predictedAt <= toMillis(now);
    }
  }
  return arrival.label.toLowerCase() === "due" || (arrival.minutes !== null && arrival.minutes <= 0);
}

export function formatArrivalClockTime(
  predictedAt: string | null,
  now: Date | number = Date.now(),
): string | null {
  if (!predictedAt) {
    return null;
  }
  const date = new Date(predictedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  const dateKey = (value: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  const current = new Date(now);
  if (dateKey(date) === dateKey(current)) return time;
  if (dateKey(date) === dateKey(new Date(current.getTime() + 86_400_000))) {
    return `Tomorrow, ${time}`;
  }
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    weekday: "short",
  }).format(date);
  return `${day}, ${time}`;
}

export function formatArrivalMinutesDuration(minutes: number): string {
  if (minutes <= 0) return "Due";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

export function formatArrivalTileLabel(arrival: ArrivalTileLabelFields, options: ArrivalTileLabelOptions = {}): string {
  if (options.detailedCountdown && shouldUseDetailedArrivalCountdown(arrival, options.now)) {
    const predictedAt = Date.parse(arrival.predictedAt ?? "");
    const secondsUntilArrival = Math.ceil((predictedAt - toMillis(options.now)) / 1000);
    return `${formatCountdownDuration(secondsUntilArrival)} - ${formatCountdownDuration(secondsUntilArrival + 60)}`;
  }
  if (options.now !== undefined && arrival.status === "live" && arrival.predictedAt) {
    const predictedAt = Date.parse(arrival.predictedAt);
    if (!Number.isNaN(predictedAt)) {
      const millisUntilArrival = predictedAt - toMillis(options.now);
      if (millisUntilArrival <= 0) {
        return "Due";
      }
      return formatArrivalMinutesDuration(Math.ceil(millisUntilArrival / 60_000));
    }
  }
  if (arrival.label.toLowerCase() === "due") {
    return "Due";
  }
  if (arrival.minutes === null) {
    return arrival.label;
  }
  if (arrival.minutes <= 0) {
    return "Due";
  }
  return formatArrivalMinutesDuration(arrival.minutes);
}

export function shouldUseDetailedArrivalCountdown(arrival: ArrivalTileLabelFields, now?: Date | number | string): boolean {
  if (arrival.status === "unavailable" || !arrival.predictedAt) {
    return false;
  }
  const predictedAt = Date.parse(arrival.predictedAt);
  if (Number.isNaN(predictedAt)) {
    return false;
  }
  const secondsUntilArrival = Math.ceil((predictedAt - toMillis(now)) / 1000);
  return secondsUntilArrival > 0 && secondsUntilArrival < DETAILED_COUNTDOWN_THRESHOLD_SECONDS;
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

function formatCountdownDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function compareArrivals(a: StationArrival, b: StationArrival): number {
  const timeA = arrivalSortTime(a);
  const timeB = arrivalSortTime(b);
  if (timeA !== timeB) return timeA - timeB;
  return a.direction.localeCompare(b.direction);
}

function compareOptionalArrivals(a: StationArrival | undefined, b: StationArrival | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return compareArrivals(a, b);
}

function uniqueArrival(arrival: StationArrival, index: number, arrivals: StationArrival[]): boolean {
  return arrivals.findIndex((candidate) => arrivalIdentity(candidate) === arrivalIdentity(arrival)) === index;
}

function arrivalIdentity(arrival: StationArrival): string {
  return [
    arrival.lineId,
    arrival.direction,
    arrival.predictedAt ?? "",
    arrival.minutes ?? "",
    arrival.label,
    arrival.source,
    arrival.status,
  ].join("|");
}

function hasArrivalStatus(arrivals: ArrivalSourceFields[], status: StationArrival["status"]): boolean {
  return arrivals.some((arrival) => arrival.status === status);
}

function arrivalSortTime(arrival: StationArrival): number {
  if (arrival.predictedAt) {
    const parsed = new Date(arrival.predictedAt).getTime();
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return arrival.minutes ?? Number.MAX_SAFE_INTEGER;
}

function extractDestination(direction: string): string {
  const towardMatch = direction.match(/\btowards?\s+(.+)$/i);
  if (towardMatch) {
    return cleanDestination(towardMatch[1]);
  }

  const toMatch = direction.match(/\bto\s+(.+)$/i);
  return toMatch ? cleanDestination(toMatch[1]) : "";
}

function cleanDestination(value: string): string {
  return value
    .replace(/\s+Station$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDestination(value: string): string {
  return value
    .toLowerCase()
    .replace(".", "")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singlePlatformDirection(platformLabel: string): string {
  const matches = platformLabel.match(/\b(Northbound|Southbound|Eastbound|Westbound)\b/gi) ?? [];
  const uniqueDirections = new Set(matches.map(titleCase));
  return uniqueDirections.size === 1 ? [...uniqueDirections][0] : "";
}

function platformDirections(platformLabel: string): string[] {
  const matches = platformLabel.match(/\b(Northbound|Southbound|Eastbound|Westbound)\b/gi) ?? [];
  return [...new Set(matches.map(titleCase))];
}

function line1CardinalDirection(stationId: string | undefined, normalizedDestination: string): string {
  if (!stationId || (normalizedDestination !== "finch" && normalizedDestination !== "vaughan metropolitan centre")) {
    return "";
  }

  const stationIndex = LINE_1_STATION_ORDER.indexOf(stationId);
  if (stationIndex === -1) {
    return "";
  }

  if (stationIndex < LINE_1_UNION_INDEX) {
    return normalizedDestination === "vaughan metropolitan centre" ? "Northbound" : "Southbound";
  }
  if (stationIndex > LINE_1_UNION_INDEX) {
    return normalizedDestination === "finch" ? "Northbound" : "Southbound";
  }
  return "Northbound";
}

function line1UnionDirection(
  stationId: string | undefined,
  lineId: string,
  cardinal: string,
  destination: string,
): string {
  if (stationId !== "union" || lineId !== "line-1") {
    return "";
  }

  const normalizedDestination = normalizeDestination(destination);
  if (normalizedDestination === "finch") {
    return "Northbound to Finch";
  }
  if (normalizedDestination === "vaughan metropolitan centre") {
    return "Northbound to Vaughan Metropolitan Centre";
  }

  const terminal = LINE_1_UNION_TERMINAL_BY_CARDINAL[cardinal];
  return terminal ? `Northbound to ${terminal}` : "";
}

function directionRank(directionLabel: string): number {
  const direction = directionLabel.split(" ")[0];
  return DIRECTION_RANK[direction] ?? 50;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
