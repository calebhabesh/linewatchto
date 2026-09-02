import { z } from "zod";

export const savedStationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  mapX: z.number(),
  mapY: z.number(),
  interchange: z.boolean(),
  lineIds: z.array(z.string()).optional().default([]),
  hasActiveImpact: z.boolean().optional().default(false),
  accessStatus: z.string().optional().default("accessible"),
  accessOutageCounts: z
    .object({
      elevator: z.number(),
      escalator: z.number(),
    })
    .optional()
    .default({ elevator: 0, escalator: 0 }),
  wheelchairAccessible: z.boolean().optional().default(false),
  hasElevator: z.boolean().optional().default(false),
  hasWashroom: z.boolean().optional().default(false),
  hasParking: z.boolean().optional().default(false),
  hasBicycleLockup: z.boolean().optional().default(false),
  hasBicycleRepair: z.boolean().optional().default(false),
  hasBikeShare: z.boolean().optional().default(false),
  hasPpudo: z.boolean().optional().default(false),
});

export const savedStationSchema = z.object({
  networkId: z.enum(["ttc", "regional"]).or(z.string()),
  station: savedStationSummarySchema,
  savedAt: z.string(),
});

export type SavedStation = z.infer<typeof savedStationSchema>;

export const savedStationListSchema = z.object({
  stations: z.array(savedStationSchema),
});

export type SavedStationList = z.infer<typeof savedStationListSchema>;
