import { z } from "zod";

export const networkIdSchema = z.enum(["ttc", "regional"]);
export type NetworkId = z.infer<typeof networkIdSchema>;

const nullableString = z.string().nullable().optional();

const generatedAtSchema = z.object({
  time: z.string(),
  date: z.string(),
  live: z.boolean(),
  lastPoll: z.string(),
});

export const lineStatusSchema = z.object({
  id: z.string(),
  number: z.string(),
  name: z.string(),
  route: z.string(),
  color: z.string(),
  status: z.enum(["normal", "delay", "suspension", "planned", "ready"]),
  statusLabel: z.string(),
  summary: z.string(),
  updatedAgo: z.string(),
});

export const mapImpactSchema = z.object({
  kind: z.enum(["suspension", "delay", "reduced-speed-zone", "planned-closure"]),
  cardId: z.string(),
  travelDirection: z.enum(["forward", "reverse", "bidirectional"]),
  sourceAlertIds: z.array(z.string()),
});

export const networkSegmentSchema = z.object({
  id: z.string(),
  lineId: z.string(),
  label: z.string(),
  stationAId: nullableString,
  stationBId: nullableString,
  stationAAnchorId: nullableString,
  stationBAnchorId: nullableString,
  guidePathId: nullableString,
  guidePathReversed: z.boolean().optional().default(false),
  pathD: z.string(),
  impacts: z.array(mapImpactSchema).optional().default([]),
  overlay: z.enum(["clear", "delay", "suspension"]),
  travelDirection: z.enum(["forward", "reverse", "bidirectional"]).nullable().optional(),
  sourceAlertIds: z.array(z.string()).optional().default([]),
  reducedSpeedZoneIds: z.array(z.string()).optional().default([]),
  alertId: nullableString,
});

export const stationSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  interchange: z.boolean(),
});

export const stationNodeImpactSchema = z.object({
  stationId: z.string(),
  kind: z.enum(["suspension", "delay", "reduced-speed-zone", "planned-closure"]),
  cardId: z.string(),
  title: z.string(),
});

const alertBaseSchema = z.object({
  id: z.string(),
  lineId: z.string(),
  lineNumber: z.string(),
  title: z.string(),
  location: z.string(),
  displayDirection: nullableString,
  description: z.string(),
  startedAt: nullableString,
  updatedAt: nullableString,
  source: z.string(),
  cause: nullableString,
});

export const activeAlertSchema = alertBaseSchema.extend({
  severity: z.enum(["delay", "suspension", "planned"]),
  affectedSegmentIds: z.array(z.string()),
  shuttle: z.boolean(),
  resolution: nullableString,
  relatedPlannedClosureId: nullableString,
});

export const delayAlertSchema = alertBaseSchema.extend({
  affectedSegmentIds: z.array(z.string()),
});

export const reducedSpeedZoneSchema = alertBaseSchema.extend({
  affectedSegmentIds: z.array(z.string()),
  sourceAlertIds: z.array(z.string()),
  directionalDetails: z.array(z.unknown()),
  resolution: nullableString,
  rszLength: nullableString,
  stationDistance: nullableString,
  trackPercent: nullableString,
  reducedSpeed: nullableString,
  averageSpeed: nullableString,
});

export const plannedClosureSchema = alertBaseSchema.extend({
  window: z.string(),
  previewSegmentIds: z.array(z.string()),
  shuttle: z.boolean(),
  resolution: nullableString,
  activeNow: z.boolean(),
  timingStatus: z.enum(["active-now", "upcoming", "unknown"]),
  nightly: z.boolean(),
  activeWindowStart: nullableString,
  activeWindowEnd: nullableString,
  activeWindowLabel: nullableString,
  nextWindowStart: nullableString,
  nextWindowEnd: nullableString,
  nextWindowLabel: nullableString,
  windowHours: nullableString,
  windowDates: nullableString,
  travelDirection: z.enum(["forward", "reverse", "bidirectional"]),
});

export const dashboardSchema = z.object({
  networkId: networkIdSchema,
  availability: z.string(),
  sourceSystems: z.array(z.string()),
  message: z.string(),
  map: z.object({
    stations: z.array(stationSchema),
    segments: z.array(networkSegmentSchema),
    stationNodeImpacts: z.array(stationNodeImpactSchema),
  }),
  status: z.object({
    generatedAt: generatedAtSchema,
    lines: z.array(lineStatusSchema),
  }),
  activeAlerts: z.array(activeAlertSchema),
  delays: z.array(delayAlertSchema),
  reducedSpeedZones: z.array(reducedSpeedZoneSchema),
  plannedClosures: z.array(plannedClosureSchema),
  performance: z.unknown(),
});

export type Dashboard = z.infer<typeof dashboardSchema>;
export type LineStatus = z.infer<typeof lineStatusSchema>;
export type NetworkSegment = z.infer<typeof networkSegmentSchema>;
export type Station = z.infer<typeof stationSchema>;
export type MapImpact = z.infer<typeof mapImpactSchema>;
export type StationNodeImpact = z.infer<typeof stationNodeImpactSchema>;
export type ActiveAlert = z.infer<typeof activeAlertSchema>;
export type DelayAlert = z.infer<typeof delayAlertSchema>;
export type ReducedSpeedZone = z.infer<typeof reducedSpeedZoneSchema>;
export type PlannedClosure = z.infer<typeof plannedClosureSchema>;
