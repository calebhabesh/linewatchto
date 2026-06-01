export type LineStatusState = "normal" | "delay" | "suspension" | "planned" | "ready";
export type AlertSeverity = "delay" | "suspension" | "planned";
export type SegmentOverlay = "clear" | "delay" | "suspension";
export type CommuteImpact = "clear" | "minor" | "major" | "suspended" | "planned";

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
  pathD: string;
  overlay: SegmentOverlay;
  alertId?: string;
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
  updatedAgo: string;
  affectedSegmentIds: string[];
  shuttle: boolean;
  source: string;
};

export type PlannedClosure = {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  window: string;
  location: string;
  description: string;
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
  time: "9:24 PM",
  date: "Mon, Feb 16",
  live: false,
  lastPoll: "52 sec ago",
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
    status: "suspension",
    statusLabel: "Suspended",
    summary: "No subway service between Finch and Eglinton.",
    updatedAgo: "Updated 4 min ago",
  },
  {
    id: "line-2",
    number: "2",
    name: "Bloor-Danforth",
    route: "Kipling - Kennedy",
    color: "#14a44d",
    status: "suspension",
    statusLabel: "Suspended",
    summary: "No service between Jane and Ossington. Slower trains near Sherbourne.",
    updatedAgo: "Updated 1 min ago",
  },
  {
    id: "line-4",
    number: "4",
    name: "Sheppard",
    route: "Sheppard-Yonge - Don Mills",
    color: "#b84ed8",
    status: "normal",
    statusLabel: "Normal",
    summary: "No active service impacts reported.",
    updatedAgo: "Updated 52 sec ago",
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
    overlay: "suspension",
    alertId: "alert-line-1-north",
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
    overlay: "suspension",
    alertId: "alert-line-2-jane-ossington",
  },
  {
    id: "line-2-sherbourne-castle-frank",
    lineId: "line-2",
    label: "Sherbourne to Castle Frank",
    pathD: "M 4862 2603 L 5115 2603",
    overlay: "delay",
    alertId: "alert-line-2-east",
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
  { id: "eglington", name: "Eglinton", x: 58, y: 35, interchange: true },
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

export const activeAlerts: ActiveAlert[] = [
  {
    id: "alert-line-2-jane-ossington",
    lineId: "line-2",
    lineNumber: "2",
    title: "Planned track work",
    severity: "suspension",
    location: "Jane to Ossington",
    description:
      "No subway service between Jane and Ossington due to planned track work. Shuttle buses are operating.",
    updatedAgo: "Updated 10 min ago",
    affectedSegmentIds: ["line-2-jane-ossington"],
    shuttle: true,
    source: "TTC service alert",
  },
  {
    id: "alert-line-1-north",
    lineId: "line-1",
    lineNumber: "1",
    title: "Signal problem",
    severity: "suspension",
    location: "Finch to Eglinton",
    description:
      "No subway service between Finch and Eglinton while crews respond to a signal problem. Shuttle buses are operating.",
    updatedAgo: "Updated 4 min ago",
    affectedSegmentIds: ["line-1-finch-eglinton"],
    shuttle: true,
    source: "TTC service alert",
  },
  {
    id: "alert-line-2-east",
    lineId: "line-2",
    lineNumber: "2",
    title: "Track issues",
    severity: "delay",
    location: "Sherbourne to Castle Frank",
    description:
      "Eastbound trains are moving slower than usual between Sherbourne and Castle Frank due to track issues.",
    updatedAgo: "Updated 8 min ago",
    affectedSegmentIds: ["line-2-sherbourne-castle-frank"],
    shuttle: false,
    source: "TTC service alert",
  },
];

export const plannedClosures: PlannedClosure[] = [
  {
    id: "planned-line-1-weekend",
    lineId: "line-1",
    lineNumber: "1",
    title: "Signal upgrades",
    window: "Sat 11:00 PM - Sun 8:00 AM",
    location: "Finch to Eglinton",
    description:
      "Weekend signal upgrade work will close the north Yonge segment. Shuttle buses will operate through the affected corridor.",
    previewSegmentIds: ["line-1-finch-eglinton"],
    shuttle: true,
    source: "Planned TTC closure",
  },
  {
    id: "planned-line-2-track",
    lineId: "line-2",
    lineNumber: "2",
    title: "Planned track work",
    window: "Fri 9:00 PM - Mon 5:00 AM",
    location: "Kipling to Jane",
    description:
      "Late-week track work will replace eastbound service with shuttle buses on the west end of Line 2.",
    previewSegmentIds: ["line-2-kipling-jane"],
    shuttle: true,
    source: "Planned TTC closure",
  },
];

export const commuteImpacts: CommuteSummary[] = [
  {
    id: "commute-finch-union",
    name: "Morning commute",
    route: "Finch -> Union",
    impact: "suspended",
    statusLabel: "Suspended segment",
    detail: "Line 1 service is unavailable between Finch and Eglinton.",
    affectedBy: "Signal problem",
  },
  {
    id: "commute-kipling-kennedy",
    name: "Crosstown backup",
    route: "Kipling -> Kennedy",
    impact: "major",
    statusLabel: "Major delay",
    detail: "Line 2 remains open, but eastbound travel is slower east of Bloor-Yonge.",
    affectedBy: "Track issues",
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
  { label: "Service alerts", value: "2 active / 52 sec old", state: "ok" },
  { label: "Planned closures", value: "2 upcoming windows", state: "ok" },
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
