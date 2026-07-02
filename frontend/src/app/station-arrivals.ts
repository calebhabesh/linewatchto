import type { StationArrival, StationLine } from "./station-data";

type ArrivalTimeFields = Pick<StationArrival, "label" | "minutes" | "status"> & Partial<Pick<StationArrival, "predictedAt">>;
type ArrivalTileLabelFields = Pick<StationArrival, "label" | "minutes"> & Partial<Pick<StationArrival, "predictedAt" | "status">>;
type ArrivalTileLabelOptions = {
  detailedLive?: boolean;
  now?: Date | number | string;
};

type GroupStationArrivalsOptions = {
  stationId?: string;
  maxArrivalsPerDirection?: number;
};

export type StationArrivalGroup = {
  key: string;
  line: StationLine | null;
  lineId: string;
  lineNumber: string;
  directionLabel: string;
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

const SCHEDULED_ARRIVALS_DISCLAIMER =
  "Scheduled arrivals use TTC timetable data and are not live train predictions.";
const UNAVAILABLE_ARRIVALS_DISCLAIMER =
  "Scheduled arrival data is currently unavailable. Arrival predictions are not live TTC predictions.";
const LIVE_ARRIVALS_DISCLAIMER =
  "Arrival predictions are source-labeled and may be affected by active TTC service alerts.";
const DETAILED_LIVE_COUNTDOWN_THRESHOLD_SECONDS = 120;

export function groupStationArrivals(
  arrivals: StationArrival[],
  lines: StationLine[],
  options: GroupStationArrivalsOptions | number = {},
): StationArrivalGroup[] {
  const stationId = typeof options === "number" ? undefined : options.stationId;
  const maxArrivalsPerDirection = typeof options === "number"
    ? options
    : options.maxArrivalsPerDirection ?? 3;
  const linesById = new Map(lines.map((line, index) => [line.id, { line, index }]));
  const groups = new Map<string, StationArrivalGroup>();

  for (const arrival of arrivals) {
    const lineEntry = linesById.get(arrival.lineId);
    const directionLabel = formatArrivalDirection(arrival, lineEntry?.line ?? null, stationId);
    const key = `${arrival.lineId}:${directionLabel}`;
    const group = groups.get(key) ?? {
      key,
      line: lineEntry?.line ?? null,
      lineId: arrival.lineId,
      lineNumber: lineEntry?.line.number ?? arrival.lineId.replace("line-", ""),
      directionLabel,
      arrivals: [],
    };

    group.arrivals.push(arrival);
    groups.set(key, group);
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

      const directionA = directionRank(a.directionLabel);
      const directionB = directionRank(b.directionLabel);
      if (directionA !== directionB) return directionA - directionB;

      return compareArrivals(a.arrivals[0], b.arrivals[0]);
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
    const destination = cleanDestination(cardinalMatch[2] ?? "");
    return destination ? `${cardinal} to ${destination}` : cardinal;
  }

  const destination = extractDestination(arrival.direction);
  if (!destination) {
    return arrival.direction;
  }

  const normalizedDestination = normalizeDestination(destination);
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

export function formatArrivalClockTime(predictedAt: string | null): string | null {
  if (!predictedAt) {
    return null;
  }
  const date = new Date(predictedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatArrivalTileLabel(arrival: ArrivalTileLabelFields, options: ArrivalTileLabelOptions = {}): string {
  if (options.detailedLive && shouldUseDetailedLiveCountdown(arrival, options.now)) {
    const predictedAt = Date.parse(arrival.predictedAt ?? "");
    const secondsUntilArrival = Math.ceil((predictedAt - toMillis(options.now)) / 1000);
    return `${formatCountdownDuration(secondsUntilArrival)} - ${formatCountdownDuration(secondsUntilArrival + 60)}`;
  }
  if (options.now !== undefined && arrival.status === "live" && arrival.predictedAt) {
    const predictedAt = Date.parse(arrival.predictedAt);
    if (!Number.isNaN(predictedAt) && predictedAt <= toMillis(options.now)) {
      return "Due";
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
  return `${arrival.minutes}m`;
}

export function shouldUseDetailedLiveCountdown(arrival: ArrivalTileLabelFields, now?: Date | number | string): boolean {
  if (arrival.status !== "live" || !arrival.predictedAt) {
    return false;
  }
  const predictedAt = Date.parse(arrival.predictedAt);
  if (Number.isNaN(predictedAt)) {
    return false;
  }
  const secondsUntilArrival = Math.ceil((predictedAt - toMillis(now)) / 1000);
  return secondsUntilArrival > 0 && secondsUntilArrival < DETAILED_LIVE_COUNTDOWN_THRESHOLD_SECONDS;
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

function directionRank(directionLabel: string): number {
  const direction = directionLabel.split(" ")[0];
  return DIRECTION_RANK[direction] ?? 50;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
