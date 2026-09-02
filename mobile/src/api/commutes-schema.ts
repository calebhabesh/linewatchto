import { z } from "zod";

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

export const pathSegmentHopSchema = z.object({
  segmentId: z.string(),
  lineId: z.string(),
  fromStationId: z.string(),
  toStationId: z.string(),
  travelDirection: nullableString,
});

export const commutePathSchema = z.object({
  status: z.string(),
  stationIds: z.array(z.string()).optional().default([]),
  segmentIds: z.array(z.string()).optional().default([]),
  segmentHops: z.array(pathSegmentHopSchema).optional().default([]),
  lineIds: z.array(z.string()).optional().default([]),
  transferStationIds: z.array(z.string()).optional().default([]),
  estimatedTravelSeconds: z.number().optional().default(0),
  weightSource: nullableString,
  summary: nullableString,
});

export const travelTimeEstimateSchema = z.object({
  status: z.string(),
  baselineSeconds: z.number().optional().default(0),
  estimatedLowSeconds: nullableNumber,
  estimatedHighSeconds: nullableNumber,
  extraLowSeconds: nullableNumber,
  extraHighSeconds: nullableNumber,
  confidence: nullableString,
  summary: nullableString,
});

export const matchedImpactSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.string(),
  severity: z.string(),
  title: z.string(),
  lineId: z.string().optional().default(""),
  lineNumber: z.string().optional().default(""),
  location: z.string().optional().default(""),
  displayDirection: nullableString,
  description: z.string().optional().default(""),
  source: z.string().optional().default(""),
  matchedSegmentIds: z.array(z.string()).optional().default([]),
  matchedStationIds: z.array(z.string()).optional().default([]),
  startedAt: nullableString,
  updatedAt: nullableString,
  window: nullableString,
  timingStatus: nullableString,
  eventStartAt: nullableString,
  closureHours: nullableString,
  closureDates: nullableString,
  ignoredByRule: z.boolean().optional().default(false),
});

export const commuteImpactSchema = z.object({
  status: z.string(),
  severity: z.string(),
  statusLabel: z.string(),
  detail: nullableString,
  matchedImpacts: z.array(matchedImpactSchema).optional().default([]),
  travelTimeEstimate: travelTimeEstimateSchema.nullable().optional(),
});

export const commuteLegSchema = z.object({
  id: z.string(),
  routeLabel: z.string(),
  fromStationId: z.string(),
  fromStationName: z.string(),
  toStationId: z.string(),
  toStationName: z.string(),
  path: commutePathSchema,
  impact: commuteImpactSchema,
});

export const notificationScheduleSchema = z.object({
  dayMask: z.number().optional().default(62), // default weekdays
  startMinute: nullableNumber,
  endMinute: nullableNumber,
});

export const notificationEventTypesSchema = z.object({
  suspensions: z.boolean().optional().default(true),
  delays: z.boolean().optional().default(true),
  tripCancellations: z.boolean().optional().default(true),
  reducedSpeedZones: z.boolean().optional().default(true),
  plannedClosures: z.boolean().optional().default(true),
  serviceRestored: z.boolean().optional().default(false),
});

export const notificationRuleSchema = z.object({
  enabled: z.boolean().optional().default(true),
  dayMask: z.number().optional().default(62),
  startMinute: nullableNumber,
  endMinute: nullableNumber,
  outboundEnabled: z.boolean().optional().default(true),
  returnEnabled: z.boolean().optional().default(true),
  eventTypes: notificationEventTypesSchema.optional().default({
    suspensions: true,
    delays: true,
    tripCancellations: true,
    reducedSpeedZones: true,
    plannedClosures: true,
    serviceRestored: false,
  }),
  outboundSchedule: notificationScheduleSchema.nullable().optional(),
  returnSchedule: notificationScheduleSchema.nullable().optional(),
});

export const savedCommuteSchema = z.object({
  id: z.string(),
  label: z.string(),
  networkId: z.string().optional().default("ttc"),
  originStationId: z.string(),
  originStationName: z.string(),
  destinationStationId: z.string(),
  destinationStationName: z.string(),
  routeLabel: z.string(),
  watchReturnTrip: z.boolean().optional().default(false),
  outboundLeg: commuteLegSchema.nullable().optional(),
  returnLeg: commuteLegSchema.nullable().optional(),
  path: commutePathSchema.nullable().optional(),
  impact: commuteImpactSchema.nullable().optional(),
  notificationRule: notificationRuleSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const savedCommuteListSchema = z.object({
  commutes: z.array(savedCommuteSchema),
});

export const createSavedCommuteInputSchema = z.object({
  networkId: z.enum(["ttc", "regional"]).optional().default("ttc"),
  fromStationId: z.string(),
  toStationId: z.string(),
  customLabel: z.string().optional(),
  includeReturnTrip: z.boolean().optional().default(false),
});

export const updateSavedCommuteInputSchema = z.object({
  fromStationId: z.string(),
  toStationId: z.string(),
  customLabel: z.string().optional(),
  includeReturnTrip: z.boolean().optional(),
});

export type SavedCommute = z.infer<typeof savedCommuteSchema>;
export type SavedCommuteList = z.infer<typeof savedCommuteListSchema>;
export type CommuteLeg = z.infer<typeof commuteLegSchema>;
export type CommutePath = z.infer<typeof commutePathSchema>;
export type CommuteImpact = z.infer<typeof commuteImpactSchema>;
export type MatchedImpact = z.infer<typeof matchedImpactSchema>;
export type TravelTimeEstimate = z.infer<typeof travelTimeEstimateSchema>;
export type NotificationRule = z.infer<typeof notificationRuleSchema>;
export type CreateSavedCommuteInput = z.infer<typeof createSavedCommuteInputSchema>;
export type UpdateSavedCommuteInput = z.infer<typeof updateSavedCommuteInputSchema>;
