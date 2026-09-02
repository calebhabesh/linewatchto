import { z } from "zod";

// Surface / Service Notices
export const surfaceNoticeStopDetailSchema = z.object({
  stopId: z.string(),
  stopName: z.string(),
});

export const surfaceNoticeDetailSchema = z.object({
  id: z.string(),
  category: z.string(),
  routeType: z.string(),
  routeIds: z.array(z.string()),
  title: z.string(),
  description: z.string(),
  location: z.string().nullable().optional(),
  stopIds: z.array(z.string()),
  direction: z.string().nullable().optional(),
  cause: z.string().nullable().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  updatedAt: z.string(),
  url: z.string().nullable().optional(),
  source: z.string(),
  stops: z.array(surfaceNoticeStopDetailSchema).optional(),
});

export const surfaceNoticeCategorySummarySchema = z.object({
  category: z.string(),
  label: z.string(),
  count: z.number(),
});

export const surfaceNoticeResponseSchema = z.object({
  generatedAt: z.string(),
  fresh: z.boolean(),
  source: z.string(),
  categories: z.array(surfaceNoticeCategorySummarySchema),
  notices: z.array(surfaceNoticeDetailSchema),
});

// Regional Trip Changes
export const regionalTripChangeStopSchema = z.object({
  stationId: z.string(),
  stationName: z.string(),
  kind: z.string(),
  scheduledAt: z.string().nullable().optional(),
  platform: z.string().optional(),
});

export const regionalTripChangeSchema = z.object({
  id: z.string(),
  kind: z.enum(["cancellation", "skipped-stop", "added-stop"]),
  tripId: z.string(),
  tripNumber: z.string(),
  lineId: z.string(),
  lineNumber: z.string(),
  lineName: z.string(),
  destination: z.string(),
  serviceDate: z.string(),
  scheduledStartAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  scheduleMatched: z.boolean(),
  title: z.string(),
  description: z.string(),
  cause: z.string(),
  sourceSystems: z.array(z.string()),
  affectedStops: z.array(regionalTripChangeStopSchema),
});

export const regionalTripChangeResponseSchema = z.object({
  generatedAt: z.string().nullable(),
  fresh: z.boolean(),
  source: z.string(),
  sourceUpdatedAt: z.string().nullable().optional(),
  totalCount: z.number(),
  changes: z.array(regionalTripChangeSchema),
});

export type SurfaceNoticeDetail = z.infer<typeof surfaceNoticeDetailSchema>;
export type SurfaceNoticeResponse = z.infer<typeof surfaceNoticeResponseSchema>;
export type RegionalTripChange = z.infer<typeof regionalTripChangeSchema>;
export type RegionalTripChangeResponse = z.infer<typeof regionalTripChangeResponseSchema>;
