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

export type MapImpactKind = ImpactKind;

export type ImpactSelection = {
  kind: ImpactKind;
  id: string;
} | null;

export type MapImpact = {
  kind: MapImpactKind;
  cardId: string;
  travelDirection: TravelDirection;
  directionCertainty?: "explicit" | "unspecified";
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
  /** Direction-aware rider span (→ one way, ⇄ both ways, "to" unspecified); `location` keeps source text. */
  displayLocation?: string | null;
  description: string;
  resolution?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
};

export type ReducedSpeedZone = {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  /** Direction-aware rider span (→ one way, ⇄ both ways, "to" unspecified); `location` keeps source text. */
  displayLocation?: string | null;
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

export type IncidentRiderDetails = {
  serviceEffect?: "suspension" | "delay" | "limited-service" | null;
  /** Provider publication time, independent of feed refresh / updatedAt. */
  publishedAt?: string | null;
  replacementService?: "go-bus" | "bus" | null;
  maximumDelayMinutes?: number | null;
  /** The impact covers every segment of its line (GO/UP: from the backend; TTC: derived by the adapter). */
  wholeLine?: boolean | null;
  /** GO/UP: station names, in route order, that the replacement service does not serve. */
  replacementSkippedStations?: string[] | null;
};

export type ActiveAlert = IncidentRiderDetails & {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  severity: AlertSeverity;
  location: string;
  /** Direction-aware rider span (→ one way, ⇄ both ways, "to" unspecified); `location` keeps source text. */
  displayLocation?: string | null;
  displayDirection?: string | null;
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
  relatedPlannedClosureId?: string | null;
};

export type DelayAlert = IncidentRiderDetails & {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  /** Direction-aware rider span (→ one way, ⇄ both ways, "to" unspecified); `location` keeps source text. */
  displayLocation?: string | null;
  displayDirection?: string | null;
  description: string;
  affectedSegmentIds: string[];
  startedAt?: string | null;
  updatedAt?: string | null;
  source: string;
  cause?: string | null;
  relatedPlannedClosureId?: string | null;
  activeWindowEnd?: string | null;
  shuttle?: boolean;
};

export type PlannedClosure = IncidentRiderDetails & {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  window: string;
  location: string;
  /** Direction-aware rider span (→ one way, ⇄ both ways, "to" unspecified); `location` keeps source text. */
  displayLocation?: string | null;
  displayDirection?: string | null;
  travelDirection?: TravelDirection | null;
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
  previewStationIds?: string[];
  shuttle: boolean;
  source: string;
  activeNow?: boolean;
  timingStatus?: "active-now" | "upcoming" | "unknown";
  nightly?: boolean;
  activeWindowStart?: string | null;
  activeWindowEnd?: string | null;
  activeWindowLabel?: string | null;
  nextWindowStart?: string | null;
  nextWindowEnd?: string | null;
  nextWindowLabel?: string | null;
  windowHours?: string | null;
  windowDates?: string | null;
  /** Reliable windows the source still lists; absent when the source has no window list. */
  windowCount?: number | null;
  /** End of the last listed window, sent only when it is the last date the card names. */
  lastWindowEnd?: string | null;
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

export type TtcPerformanceMetric = {
  id: string;
  label: string;
  category: "subway" | "surface" | "accessibility" | "other";
  percentage: number | null;
  target?: number | null;
  valueLabel: string;
  note?: string | null;
};

export type TtcPerformanceSnapshot = {
  status: "available" | "unavailable" | "disabled";
  source: string;
  sourceUrl: string;
  title: string;
  updatedLabel: string;
  fetchedAt?: string | null;
  stale: boolean;
  message: string;
  metrics: TtcPerformanceMetric[];
};

export const ttcPerformanceSnapshot: TtcPerformanceSnapshot = {
  status: "available",
  source: "TTC.ca",
  sourceUrl: "https://www.ttc.ca/",
  title: "On-time performance and elevator/escalator status",
  updatedLabel: "Local Demo",
  fetchedAt: "2026-06-07T12:00:00Z",
  stale: false,
  message: "Official TTC performance metrics loaded in fixture mode.",
  metrics: [
    { id: "line-1", label: "Line 1", category: "subway", percentage: 94, target: 90, valueLabel: "94%", note: null },
    { id: "line-2", label: "Line 2", category: "subway", percentage: 91, target: 90, valueLabel: "91%", note: null },
    { id: "line-4", label: "Line 4", category: "subway", percentage: 99, target: 98, valueLabel: "99%", note: null },
    { id: "bus", label: "Bus", category: "surface", percentage: 92, target: 90, valueLabel: "92%", note: null },
    { id: "streetcar", label: "Streetcar", category: "surface", percentage: 89, target: 90, valueLabel: "89%", note: null },
    { id: "wheel-trans", label: "Wheel-Trans", category: "surface", percentage: 91, target: 90, valueLabel: "91%", note: null },
    { id: "elevators", label: "Elevators", category: "accessibility", percentage: 99, target: 98, valueLabel: "99%", note: null },
    { id: "escalators", label: "Escalators", category: "accessibility", percentage: 98, target: 97, valueLabel: "98%", note: null }
  ],
};

export type ReliabilitySummary = {
  lineId: string;
  lineNumber: string;
  label: string;
  score: number;
  incidents7d: number;
  medianDuration: string;
};

export type AlertTypeBreakdownItem = {
  impactKind: string;
  label: string;
  incidents: number;
  incidentDisruptionMinutes: number;
  percentage: number;
};

export type DisruptionClassMetricItem = {
  disruptionClass: string;
  label: string;
  incidents: number;
  activeIncidents: number;
  uniqueMinutes: number;
  weightedMinutes: number;
  weightedSharePercentage: number;
  incidentDisruptionMinutes: number;
};

export type ReliabilitySnapshot = {
  networkId: "ttc" | "regional";
  period: "30d";
  since: string;
  until: string;
  source: string;
  observedDays: number;
  observationMinutes: number;
  coveragePercentage: number;
  confidence: "low" | "medium" | "high";
  coverageLabel: string;
  serviceWindowBasis: string;
  scheduleBacked: boolean;
  scheduleCoveragePercentage: number;
  message: string;
  methodologyVersion?: number;
  metrics: {
    id: string;
    number: string;
    label: string;
    incidents: number;
    activeIncidents: number;
    medianDurationMinutes: number | null;
    serviceImpactMinutes: number;
    observedServiceMinutes: number;
    incidentDisruptionMinutes: number;
    serviceImpactPercentage: number;
    confidence: "low" | "medium" | "high";
    weightedImpactMinutes?: number;
    weightedImpactPercentage?: number;
    classes?: DisruptionClassMetricItem[];
  }[];
  breakdown?: AlertTypeBreakdownItem[];
  trainCancellations?: {
    cancellations: number;
    scheduleMatchedCancellations: number;
    sourceLabeledCancellations: number;
    observationMinutes: number;
    coveragePercentage: number;
    confidence: "low" | "medium" | "high";
    message: string;
    corridors: {
      id: string;
      number: string;
      label: string;
      cancellations: number;
      scheduleMatchedCancellations: number;
    }[];
  } | null;
};

export type IngestionHealthItem = {
  label: string;
  value: string;
  state: "ok" | "warning" | "error" | "info";
};

export const generatedAt = {
  time: "Fixture Mode",
  date: "Local Demo",
  live: false,
  lastPoll: "fixture mode",
};

export const mapAsset: {
  src: string;
  viewBox: readonly [number, number, number, number];
  legendIcons: Record<string, string>;
} = {
  src: "/assets/linewatch/ttc-subway-map-custom.svg",
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
    color: "#F8C300",
    status: "normal",
    statusLabel: "Normal",
    summary: "No active service impacts reported in fixture mode.",
    updatedAgo: "Fixture Mode",
  },
  {
    id: "line-2",
    number: "2",
    name: "Bloor-Danforth",
    route: "Kipling - Kennedy",
    color: "#00923F",
    status: "normal",
    statusLabel: "Normal",
    summary: "No active service impacts reported in fixture mode.",
    updatedAgo: "Fixture Mode",
  },
  {
    id: "line-4",
    number: "4",
    name: "Sheppard",
    route: "Sheppard-Yonge - Don Mills",
    color: "#A21A68",
    status: "normal",
    statusLabel: "Normal",
    summary: "No active service impacts reported in fixture mode.",
    updatedAgo: "Fixture Mode",
  },
  {
    id: "line-5",
    number: "5",
    name: "Eglinton Crosstown",
    route: "Mount Dennis - Kennedy",
    color: "#EB8738",
    status: "normal",
    statusLabel: "Normal",
    summary: "No active service impacts reported in fixture mode.",
    updatedAgo: "Fixture Mode",
  },
  {
    id: "line-6",
    number: "6",
    name: "Finch West",
    route: "Humber College - Finch West",
    color: "#969594",
    status: "normal",
    statusLabel: "Normal",
    summary: "No active service impacts reported in fixture mode.",
    updatedAgo: "Fixture Mode",
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
    route: "Finch → Union",
    impact: "clear",
    statusLabel: "Clear",
    detail: "No active route disruptions are loaded in fixture mode.",
  },
  {
    id: "commute-kipling-kennedy",
    name: "Crosstown backup",
    route: "Kipling → Kennedy",
    impact: "clear",
    statusLabel: "Clear",
    detail: "No active route disruptions are loaded in fixture mode.",
  },
  {
    id: "commute-sheppard",
    name: "North York hop",
    route: "Sheppard-Yonge → Don Mills",
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

export const reliabilitySnapshot: ReliabilitySnapshot = {
  networkId: "ttc",
  period: "30d",
  since: "2026-06-28T12:00:00Z",
  until: "2026-07-28T12:00:00Z",
  source: "LineWatch fixture Alert History",
  observedDays: 30,
  observationMinutes: 43200,
  coveragePercentage: 100,
  confidence: "high",
  coverageLabel: "100.0% polling · 100.0% schedule-date coverage",
  serviceWindowBasis: "fixture scheduled-service windows",
  scheduleBacked: false,
  scheduleCoveragePercentage: 100,
  methodologyVersion: 2,
  message: "Observed TTC alerts during scheduled subway and LRT service and successful polling. Class shares weight each disruption by the share of scheduled stations affected on the line; alerts without listed stations count as whole-line. Time With Any Alert counts any alert anywhere on the line, and incident-hours add overlapping alerts.",
  metrics: reliabilitySummaries.map((item) => {
    const minutes = item.incidents7d * Number.parseInt(item.medianDuration, 10);
    const stoppedMinutes = Math.round(minutes * 0.25);
    const delayMinutes = Math.round(minutes * 0.5);
    const slowZoneMinutes = Math.max(0, minutes - stoppedMinutes - delayMinutes);
    return {
      id: item.lineId,
      number: item.lineNumber,
      label: item.label,
      incidents: item.incidents7d,
      activeIncidents: 0,
      medianDurationMinutes: Number.parseInt(item.medianDuration, 10),
      serviceImpactMinutes: minutes,
      observedServiceMinutes: 36000,
      incidentDisruptionMinutes: minutes,
      serviceImpactPercentage: 0.5,
      confidence: "high" as const,
      weightedImpactMinutes: Math.round(minutes * 2.5) / 10,
      weightedImpactPercentage: 0.2,
      classes: [
        {
          disruptionClass: "service-stopped",
          label: "Service Stopped",
          incidents: Math.max(1, Math.round(item.incidents7d * 0.2)),
          activeIncidents: 0,
          uniqueMinutes: stoppedMinutes,
          weightedMinutes: Math.round(stoppedMinutes * 3) / 10,
          weightedSharePercentage: 0.1,
          incidentDisruptionMinutes: stoppedMinutes,
        },
        {
          disruptionClass: "delay",
          label: "Delays",
          incidents: Math.max(1, Math.round(item.incidents7d * 0.6)),
          activeIncidents: 0,
          uniqueMinutes: delayMinutes,
          weightedMinutes: Math.round(delayMinutes * 2) / 10,
          weightedSharePercentage: 0.1,
          incidentDisruptionMinutes: delayMinutes,
        },
        {
          disruptionClass: "slow-zone",
          label: "Slow Zones",
          incidents: Math.max(0, item.incidents7d - Math.max(1, Math.round(item.incidents7d * 0.2)) - Math.max(1, Math.round(item.incidents7d * 0.6))),
          activeIncidents: 0,
          uniqueMinutes: slowZoneMinutes,
          weightedMinutes: Math.round(slowZoneMinutes * 1.5) / 10,
          weightedSharePercentage: 0.0,
          incidentDisruptionMinutes: slowZoneMinutes,
        },
      ],
    };
  }),
  breakdown: [
    { impactKind: "delay", label: "Delays", incidents: 28, incidentDisruptionMinutes: 340, percentage: 56.7 },
    { impactKind: "reduced-speed-zone", label: "Reduced Speed Zones", incidents: 12, incidentDisruptionMinutes: 180, percentage: 30.0 },
    { impactKind: "planned-closure", label: "Planned Advisories", incidents: 3, incidentDisruptionMinutes: 80, percentage: 13.3 },
  ],
};

export const ingestionHealth: IngestionHealthItem[] = [
  { label: "GTFS Snapshot", value: "4 lines / 16 display stops", state: "ok" },
  { label: "Service Alerts", value: "0 active in fixture mode", state: "ok" },
  { label: "Planned Advisories", value: "0 upcoming in fixture mode", state: "ok" },
  { label: "Snapshot History", value: "1,284 alert samples", state: "ok" },
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
