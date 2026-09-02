import { z } from "zod";

export const accessibilityOutageDetailSchema = z.object({
  id: z.string(),
  assetType: z.string(),
  title: z.string(),
  description: z.string(),
  cause: z.string().nullable().optional(),
  updatedAt: z.string(),
  source: z.string(),
});

export const accessibilityOutageStationGroupSchema = z.object({
  stationId: z.string(),
  stationName: z.string(),
  count: z.number(),
  outages: z.array(accessibilityOutageDetailSchema),
});

export const accessibilityOutageLineSummarySchema = z.object({
  lineId: z.string(),
  lineNumber: z.string(),
  lineName: z.string(),
  color: z.string(),
  count: z.number(),
});

export const accessibilityOutageAssetSummarySchema = z.object({
  assetType: z.string(),
  label: z.string(),
  count: z.number(),
  lines: z.array(accessibilityOutageLineSummarySchema),
});

export const accessibilityOutageLineGroupSchema = z.object({
  lineId: z.string(),
  lineNumber: z.string(),
  lineName: z.string(),
  color: z.string(),
  stations: z.array(accessibilityOutageStationGroupSchema),
});

export const accessibilityOutagesResponseSchema = z.object({
  generatedAt: z.string(),
  fresh: z.boolean(),
  source: z.string(),
  assetTypes: z.array(accessibilityOutageAssetSummarySchema),
  groups: z.array(accessibilityOutageLineGroupSchema),
});

export type AccessibilityOutageDetail = z.infer<typeof accessibilityOutageDetailSchema>;
export type AccessibilityOutageStationGroup = z.infer<typeof accessibilityOutageStationGroupSchema>;
export type AccessibilityOutageLineGroup = z.infer<typeof accessibilityOutageLineGroupSchema>;
export type AccessibilityOutageAssetSummary = z.infer<typeof accessibilityOutageAssetSummarySchema>;
export type AccessibilityOutagesResponse = z.infer<typeof accessibilityOutagesResponseSchema>;
