import { z } from "zod";

export const reliabilityMetricSchema = z.object({
  id: z.string(),
  number: z.string(),
  label: z.string(),
  incidents: z.number(),
  activeIncidents: z.number(),
  medianDurationMinutes: z.number().nullable().optional(),
  serviceImpactMinutes: z.number(),
  observedServiceMinutes: z.number(),
  incidentDisruptionMinutes: z.number(),
  serviceImpactPercentage: z.number(),
  confidence: z.string(),
});

export const alertTypeBreakdownSchema = z.object({
  impactKind: z.string(),
  label: z.string(),
  incidents: z.number(),
  incidentDisruptionMinutes: z.number(),
  percentage: z.number(),
});

export const trainCancellationMetricSchema = z.object({
  id: z.string(),
  number: z.string(),
  label: z.string(),
  cancellations: z.number(),
  scheduleMatchedCancellations: z.number(),
});

export const trainCancellationSummarySchema = z.object({
  cancellations: z.number(),
  scheduleMatchedCancellations: z.number(),
  sourceLabeledCancellations: z.number(),
  observationMinutes: z.number(),
  coveragePercentage: z.number(),
  confidence: z.string(),
  message: z.string(),
  corridors: z.array(trainCancellationMetricSchema),
});

export const reliabilityResponseSchema = z.object({
  networkId: z.string(),
  period: z.string(),
  since: z.string(),
  until: z.string(),
  source: z.string(),
  observedDays: z.number(),
  observationMinutes: z.number(),
  coveragePercentage: z.number(),
  confidence: z.string(),
  coverageLabel: z.string(),
  serviceWindowBasis: z.string(),
  scheduleBacked: z.boolean(),
  scheduleCoveragePercentage: z.number(),
  message: z.string(),
  metrics: z.array(reliabilityMetricSchema),
  breakdown: z.array(alertTypeBreakdownSchema),
  trainCancellations: trainCancellationSummarySchema.nullable().optional(),
});

export type ReliabilityMetric = z.infer<typeof reliabilityMetricSchema>;
export type AlertTypeBreakdown = z.infer<typeof alertTypeBreakdownSchema>;
export type TrainCancellationMetric = z.infer<typeof trainCancellationMetricSchema>;
export type TrainCancellationSummary = z.infer<typeof trainCancellationSummarySchema>;
export type ReliabilityResponse = z.infer<typeof reliabilityResponseSchema>;
