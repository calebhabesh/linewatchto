import { z } from "zod";

const nullableString = z.string().nullable().optional();

// ---------------------------------------------------------------------------
// TTC Station Detail Schemas (GET /api/stations/{id})
// ---------------------------------------------------------------------------

export const stationLineSchema = z.object({
  id: z.string(),
  number: z.string(),
  name: z.string(),
  color: z.string(),
  platformLabel: z.string().optional().default(""),
  wheelchairAccessible: z.boolean().optional().default(true),
  hasElevator: z.boolean().optional().default(true),
});

export const stationFacilityOutageSchema = z.object({
  id: z.string(),
  assetType: z.string(), // "elevator" | "escalator" | string
  title: z.string(),
  description: z.string(),
  cause: nullableString,
  updatedAt: z.string(),
  source: z.string().optional().default("TTC"),
});

export const stationAccessSchema = z.object({
  status: z.string(), // "normal" | "advisory" | "outage" | string
  summary: z.string(),
  updatedAgo: z.string().optional().default(""),
  outages: z.array(stationFacilityOutageSchema).optional().default([]),
});

export const stationImpactItemSchema = z.object({
  id: z.string(),
  type: z.string(), // "active-alert" | "planned-closure" | string
  severity: z.string(), // "delay" | "suspension" | "planned" | string
  title: z.string(),
  summary: z.string(),
  updatedAgo: nullableString,
  updatedAt: nullableString,
  source: z.string().optional().default("TTC"),
});

export const stationNoticeItemSchema = z.object({
  id: z.string(),
  category: z.string(), // "construction" | "service-change" | "facility" | "other" | string
  title: z.string(),
  summary: z.string(),
  sourceUrl: z.string().optional().default(""),
  effectiveStart: nullableString,
  effectiveEnd: nullableString,
  sourceUpdatedAt: nullableString,
  lastVerifiedAt: z.string().optional().default(""),
  source: z.string().optional().default("TTC"),
});

export const stationArrivalItemSchema = z.object({
  lineId: z.string(),
  direction: z.string(),
  minutes: z.number().nullable().optional(),
  predictedAt: nullableString,
  label: z.string().optional().default(""),
  source: z.string().optional().default("TTC GTFS-RT"),
  status: z.string().optional().default("scheduled"), // "scheduled" | "live" | "unavailable" | "demo"
});

export const stationArrivalContextSchema = z.object({
  scheduleMayBeDisrupted: z.boolean().optional().default(false),
  message: z.string().optional().default(""),
  reason: z.string().optional().default(""),
  severity: z.string().optional().default("normal"),
  source: z.string().optional().default(""),
});

export const ttcStationDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  mapX: z.number(),
  mapY: z.number(),
  interchange: z.boolean(),
  lines: z.array(stationLineSchema).optional().default([]),
  access: stationAccessSchema,
  impacts: z.array(stationImpactItemSchema).optional().default([]),
  notices: z.array(stationNoticeItemSchema).optional().default([]),
  arrivals: z.array(stationArrivalItemSchema).optional().default([]),
  arrivalsSource: z.string().optional().default(""),
  arrivalContext: stationArrivalContextSchema.optional().default({
    scheduleMayBeDisrupted: false,
    message: "",
    reason: "",
    severity: "normal",
    source: "",
  }),
  dataMode: z.string().optional().default("seeded-demo"),
  disclaimer: z.string().optional().default(""),
  hasWashroom: z.boolean().optional().default(false),
  hasParking: z.boolean().optional().default(false),
  hasBicycleLockup: z.boolean().optional().default(false),
  hasBicycleRepair: z.boolean().optional().default(false),
  hasBikeShare: z.boolean().optional().default(false),
  hasPpudo: z.boolean().optional().default(false),
});

export type TtcStationDetail = z.infer<typeof ttcStationDetailSchema>;
export type StationLine = z.infer<typeof stationLineSchema>;
export type StationFacilityOutage = z.infer<typeof stationFacilityOutageSchema>;
export type StationAccess = z.infer<typeof stationAccessSchema>;
export type StationImpactItem = z.infer<typeof stationImpactItemSchema>;
export type StationNoticeItem = z.infer<typeof stationNoticeItemSchema>;
export type StationArrivalItem = z.infer<typeof stationArrivalItemSchema>;
export type StationArrivalContext = z.infer<typeof stationArrivalContextSchema>;

// ---------------------------------------------------------------------------
// Regional Train Arrivals Schemas (GET /api/regional/stations/{id}/arrivals)
// ---------------------------------------------------------------------------

export const regionalArrivalItemSchema = z.object({
  lineId: z.string(),
  lineNumber: z.string(),
  lineName: z.string(),
  direction: z.string(),
  minutes: z.number(),
  predictedAt: nullableString,
  scheduledAt: nullableString,
  delayMinutes: z.number().optional().default(0),
  platform: z.string().optional().default(""),
  tripNumber: z.string().optional().default(""),
  coachCount: z.number().nullable().optional(),
  source: z.string().optional().default("Metrolinx"),
  status: z.string().optional().default("scheduled"), // "live" | "scheduled"
});

export const regionalArrivalSnapshotSchema = z.object({
  stationId: z.string(),
  stationName: z.string().optional().default(""),
  availability: z.string(), // "available" | "no-service" | "disabled" | "unavailable"
  generatedAt: nullableString,
  sourceUpdatedAt: nullableString,
  source: z.string().optional().default("Metrolinx"),
  message: z.string().optional().default(""),
  arrivals: z.array(regionalArrivalItemSchema).optional().default([]),
});

export type RegionalArrivalItem = z.infer<typeof regionalArrivalItemSchema>;
export type RegionalArrivalSnapshot = z.infer<typeof regionalArrivalSnapshotSchema>;

// ---------------------------------------------------------------------------
// Surface Connection Schemas (GET /api/[regional/]stations/{id}/surface-connections)
// ---------------------------------------------------------------------------

export const surfaceArrivalItemSchema = z.object({
  agency: z.string().optional().default(""),
  mode: z.string().optional().default("bus"), // "bus" | "streetcar"
  route: z.string(),
  routeName: z.string().optional().default(""),
  destination: z.string().optional().default(""),
  minutes: z.number().nullable().optional(),
  predictedAt: nullableString,
  scheduledAt: nullableString,
  bayPlatform: z.string().optional().default(""),
  stopName: z.string().optional().default(""),
  tripId: z.string().optional().default(""),
  source: z.string().optional().default(""),
  status: z.string().optional().default("scheduled"),
});

export const surfaceArrivalSnapshotSchema = z.object({
  networkId: z.string().optional().default(""),
  stationId: z.string(),
  stationName: z.string().optional().default(""),
  availability: z.string(), // "available" | "no-service" | "disabled" | "unavailable"
  generatedAt: nullableString,
  sourceUpdatedAt: nullableString,
  source: z.string().optional().default(""),
  message: z.string().optional().default(""),
  arrivals: z.array(surfaceArrivalItemSchema).optional().default([]),
});

export type SurfaceArrivalItem = z.infer<typeof surfaceArrivalItemSchema>;
export type SurfaceArrivalSnapshot = z.infer<typeof surfaceArrivalSnapshotSchema>;
