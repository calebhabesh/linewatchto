export type LineStatusState = "normal" | "delay" | "suspension" | "planned" | "ready";
export type AlertSeverity = "delay" | "suspension" | "planned";
export type SegmentOverlay = "clear" | "delay" | "suspension";
export type CommuteImpact = "clear" | "minor" | "major" | "suspended" | "planned";

export type TravelDirection = "forward" | "reverse" | "bidirectional";

export type ImpactKind =
  | "suspension"
  | "delay"
  | "reduced-speed-zone"
  | "planned-closure";

export type MapImpactKind = Exclude<ImpactKind, "planned-closure">;

export type ImpactSelection = {
  kind: ImpactKind;
  id: string;
} | null;

export type MapImpact = {
  kind: MapImpactKind;
  cardId: string;
  travelDirection: TravelDirection;
  sourceAlertIds: string[];
};

export type StationNodeImpact = {
  stationId: string;
  kind: MapImpactKind;
  cardId: string;
  title: string;
};

export type DirectionalDetail = {
  sourceAlertId: string;
  displayDirection: string;
  location: string;
  description: string;
};

export type ReducedSpeedZone = {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  displayDirection: string;
  description: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  cause?: string | null;
  resolution?: string | null;
  rszLength?: string | null;
  stationDistance?: string | null;
  trackPercent?: string | null;
  reducedSpeed?: string | null;
  averageSpeed?: string | null;
  // Transitional compatibility with older seeded/stub payloads.
  reason?: string | null;
  targetRemoval?: string | null;
  updatedAgo?: string | null;
  affectedSegmentIds: string[];
  sourceAlertIds: string[];
  directionalDetails: DirectionalDetail[];
  source: string;
};

export type LineStatus = {
  id: string;
  number: string;
  name: string;
  route: string;
  color: string;
  status: LineStatusState;
  statusLabel: string;
  summary: string;
  updatedAgo: string;
};

export type NetworkSegment = {
  id: string;
  lineId: string;
  label: string;
  stationAId?: string;
  stationBId?: string;
  stationAAnchorId?: string;
  stationBAnchorId?: string;
  guidePathId?: string;
  guidePathReversed?: boolean;
  pathD: string;
  impacts?: MapImpact[];
  overlay: SegmentOverlay;
  travelDirection?: TravelDirection;
  sourceAlertIds?: string[];
  reducedSpeedZoneIds?: string[];
  alertId?: string;
  patternOriginX?: number;
  patternOriginY?: number;
  patternAngle?: number;
};

export type Station = {
  id: string;
  name: string;
  x: number;
  y: number;
  interchange?: boolean;
};

export type ActiveAlert = {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  severity: AlertSeverity;
  location: string;
  description: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  cause?: string | null;
  resolution?: string | null;
  // Transitional compatibility with older seeded/stub payloads.
  reason?: string | null;
  targetRemoval?: string | null;
  updatedAgo?: string | null;
  affectedSegmentIds: string[];
  shuttle: boolean;
  source: string;
};

export type DelayAlert = {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  description: string;
  affectedSegmentIds: string[];
  startedAt?: string | null;
  updatedAt?: string | null;
  source: string;
  cause?: string | null;
};

export type PlannedClosure = {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  window: string;
  location: string;
  description: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  cause?: string | null;
  resolution?: string | null;
  // Transitional compatibility with older seeded/stub payloads.
  reason?: string | null;
  targetRemoval?: string | null;
  updatedAgo?: string | null;
  previewSegmentIds: string[];
  shuttle: boolean;
  source: string;
};

export type CommuteSummary = {
  id: string;
  name: string;
  route: string;
  impact: CommuteImpact;
  statusLabel: string;
  detail: string;
  affectedBy?: string;
};

export type ReliabilitySummary = {
  lineId: string;
  lineNumber: string;
  label: string;
  score: number;
  incidents7d: number;
  medianDuration: string;
};

export type IngestionHealthItem = {
  label: string;
  value: string;
  state: "ok";
};

export const generatedAt = {
  time: "Fixture mode",
  date: "Local demo",
  live: false,
  lastPoll: "fixture mode",
};

export const mapAsset: {
  src: string;
  viewBox: readonly [number, number, number, number];
  legendIcons: Record<string, string>;
} = {
  src: "/assets/linewatch/ttc-subway-map-edited.svg",
  viewBox: [0, 0, 8250, 4000] as const,
  legendIcons: {
    "line-1": "/assets/linewatch/line-1-legend.svg",
    "line-2": "/assets/linewatch/line-2-legend.svg",
    "line-4": "/assets/linewatch/line-4-legend.svg",
    "line-5": "/assets/linewatch/line-5-legend.svg",
    "line-6": "/assets/linewatch/line-6-legend.svg",
  },
};

export const lineStatuses: LineStatus[] = [
  {
    id: "line-1",
    number: "1",
    name: "Yonge-University",
    route: "Finch - Vaughan Metropolitan Centre",
    color: "#f4c430",
    status: "normal",
    statusLabel: "Normal",
    summary: "No active service impacts reported in fixture mode.",
    updatedAgo: "Fixture mode",
  },
  {
    id: "line-2",
    number: "2",
    name: "Bloor-Danforth",
    route: "Kipling - Kennedy",
    color: "#14a44d",
    status: "normal",
    statusLabel: "Normal",
    summary: "No active service impacts reported in fixture mode.",
    updatedAgo: "Fixture mode",
  },
  {
    id: "line-4",
    number: "4",
    name: "Sheppard",
    route: "Sheppard-Yonge - Don Mills",
    color: "#b84ed8",
    status: "normal",
    statusLabel: "Normal",
    summary: "No active service impacts reported in fixture mode.",
    updatedAgo: "Fixture mode",
  },
  {
    id: "line-5",
    number: "5",
    name: "Eglinton Crosstown",
    route: "Mount Dennis - Kennedy",
    color: "#f57c00",
    status: "ready",
    statusLabel: "Ready",
    summary: "Layout is integrated for launch and planned service notices.",
    updatedAgo: "Reference layout",
  },
  {
    id: "line-6",
    number: "6",
    name: "Finch West",
    route: "Humber College - Finch West",
    color: "#969594",
    status: "ready",
    statusLabel: "Ready",
    summary: "Finch West LRT geometry is included for future service notices.",
    updatedAgo: "Reference layout",
  },
];

export const networkSegments: NetworkSegment[] = [
  {
    id: "line-1-finch-eglinton",
    lineId: "line-1",
    label: "Finch to Eglinton",
    pathD: "M 4547 1808 L 4548 1516 L 4547 1246 L 4546 1086 L 4547 926 L 4546 760",
    overlay: "clear",
  },
  {
    id: "line-2-kipling-jane",
    lineId: "line-2",
    label: "Kipling to Jane",
    pathD: "M 1076 2601 L 1248 2603 L 1430 2603 L 1611 2603 L 1792 2603",
    overlay: "clear",
  },
  {
    id: "line-2-jane-ossington",
    lineId: "line-2",
    label: "Jane to Ossington",
    pathD: "M 1792 2603 L 3062 2603",
    overlay: "clear",
  },
  {
    id: "line-2-sherbourne-castle-frank",
    lineId: "line-2",
    label: "Sherbourne to Castle Frank",
    pathD: "M 4862 2603 L 5115 2603",
    overlay: "clear",
  },
  {
    id: "line-4-sheppard-yonge-don-mills",
    lineId: "line-4",
    label: "Sheppard-Yonge to Don Mills",
    pathD: "M 4546 1086 L 5928 1084",
    overlay: "clear",
  },
  {
    id: "line-5-mount-dennis-eglinton",
    lineId: "line-5",
    label: "Mount Dennis to Eglinton",
    pathD: "M 1977 1804 L 4547 1808",
    overlay: "clear",
  },
  {
    id: "line-6-humber-college-finch-west",
    lineId: "line-6",
    label: "Humber College to Finch West",
    pathD: "M 287 1157 L 2509 840",
    overlay: "clear",
  },
];

export const stations: Station[] = [
  { id: "vaughan", name: "Vaughan Metropolitan Centre", x: 23, y: 22 },
  { id: "spadina", name: "Spadina", x: 38, y: 42, interchange: true },
  { id: "st-george", name: "St George", x: 41, y: 54, interchange: true },
  { id: "union", name: "Union", x: 48, y: 75, interchange: true },
  { id: "bloor-yonge", name: "Bloor-Yonge", x: 58, y: 54, interchange: true },
  { id: "eglinton", name: "Eglinton", x: 58, y: 35, interchange: true },
  { id: "york-mills", name: "York Mills", x: 58, y: 24 },
  { id: "finch", name: "Finch", x: 58, y: 12 },
  { id: "kipling", name: "Kipling", x: 16, y: 54 },
  { id: "sherbourne", name: "Sherbourne", x: 65, y: 54 },
  { id: "castle-frank", name: "Castle Frank", x: 70, y: 54 },
  { id: "kennedy", name: "Kennedy", x: 89, y: 54, interchange: true },
  { id: "sheppard-yonge", name: "Sheppard-Yonge", x: 58, y: 26, interchange: true },
  { id: "don-mills", name: "Don Mills", x: 78, y: 26 },
  { id: "mount-dennis", name: "Mount Dennis", x: 15, y: 35 },
  { id: "science-centre", name: "Science Centre", x: 76, y: 35 },
];

export const activeAlerts: ActiveAlert[] = [];

export const delays: DelayAlert[] = [];

export const reducedSpeedZones: ReducedSpeedZone[] = [];

export const plannedClosures: PlannedClosure[] = [];

export const stationNodeImpacts: StationNodeImpact[] = [];

export const commuteImpacts: CommuteSummary[] = [
  {
    id: "commute-finch-union",
    name: "Morning commute",
    route: "Finch -> Union",
    impact: "clear",
    statusLabel: "Clear",
    detail: "No active route disruptions are loaded in fixture mode.",
  },
  {
    id: "commute-kipling-kennedy",
    name: "Crosstown backup",
    route: "Kipling -> Kennedy",
    impact: "clear",
    statusLabel: "Clear",
    detail: "No active route disruptions are loaded in fixture mode.",
  },
  {
    id: "commute-sheppard",
    name: "North York hop",
    route: "Sheppard-Yonge -> Don Mills",
    impact: "clear",
    statusLabel: "Clear",
    detail: "No active or planned impacts on this saved segment.",
  },
];

export const reliabilitySummaries: ReliabilitySummary[] = [
  { lineId: "line-1", lineNumber: "1", label: "Yonge-University", score: 78, incidents7d: 9, medianDuration: "24 min" },
  { lineId: "line-2", lineNumber: "2", label: "Bloor-Danforth", score: 84, incidents7d: 6, medianDuration: "18 min" },
  { lineId: "line-4", lineNumber: "4", label: "Sheppard", score: 96, incidents7d: 1, medianDuration: "8 min" },
  { lineId: "line-5", lineNumber: "5", label: "Eglinton", score: 91, incidents7d: 2, medianDuration: "12 min" },
  { lineId: "line-6", lineNumber: "6", label: "Finch West", score: 93, incidents7d: 1, medianDuration: "10 min" },
];

export const ingestionHealth: IngestionHealthItem[] = [
  { label: "GTFS snapshot", value: "4 lines / 16 display stops", state: "ok" },
  { label: "Service alerts", value: "0 active in fixture mode", state: "ok" },
  { label: "Planned closures", value: "0 upcoming in fixture mode", state: "ok" },
  { label: "Snapshot history", value: "1,284 alert samples", state: "ok" },
];

export function findAlertBySegmentId(segmentId: string): ActiveAlert | undefined {
  return activeAlerts.find((alert) => alert.affectedSegmentIds.includes(segmentId));
}

export function findLineById(lineId: string): LineStatus {
  const line = lineStatuses.find((candidate) => candidate.id === lineId);

  if (!line) {
    throw new Error(`Unknown transit line: ${lineId}`);
  }

  return line;
}
