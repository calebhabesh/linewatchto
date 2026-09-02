import { z } from "zod";

const nullableString = z.string().nullable().optional();

export const eventTypePreferencesSchema = z.object({
  suspensions: z.boolean().default(true),
  delays: z.boolean().default(true),
  tripCancellations: z.boolean().default(true),
  reducedSpeedZones: z.boolean().default(true),
  plannedClosures: z.boolean().default(true),
  serviceRestored: z.boolean().default(false),
});

export const savedCommutePreferencesSchema = z.object({
  currentDisruptions: z.boolean().default(true),
  plannedClosureReminders: z.boolean().default(true),
  eventTypes: eventTypePreferencesSchema.default({
    suspensions: true,
    delays: true,
    tripCancellations: true,
    reducedSpeedZones: true,
    plannedClosures: true,
    serviceRestored: false,
  }),
});

export const lineSubscriptionSchema = z.object({
  lineId: z.string(),
  lineNumber: z.string(),
  label: z.string(),
  subscribed: z.boolean().default(false),
});

export const lineSubscriptionPreferencesSchema = z.object({
  lines: z.array(lineSubscriptionSchema).default([]),
  eventTypes: eventTypePreferencesSchema.default({
    suspensions: true,
    delays: true,
    tripCancellations: true,
    reducedSpeedZones: true,
    plannedClosures: true,
    serviceRestored: false,
  }),
});

export const reminderTimingPreferencesSchema = z.object({
  onChange: z.boolean().default(true),
  closure24h: z.boolean().default(true),
  closureMorning: z.boolean().default(true),
});

export const pushPreferencesSchema = z.object({
  commuteNotificationsEnabled: z.boolean().default(true),
  plannedClosureNotificationsEnabled: z.boolean().default(true),
  savedCommutes: savedCommutePreferencesSchema.default({
    currentDisruptions: true,
    plannedClosureReminders: true,
    eventTypes: {
      suspensions: true,
      delays: true,
      tripCancellations: true,
      reducedSpeedZones: true,
      plannedClosures: true,
      serviceRestored: false,
    },
  }),
  lineSubscriptions: lineSubscriptionPreferencesSchema.default({
    lines: [],
    eventTypes: {
      suspensions: true,
      delays: true,
      tripCancellations: true,
      reducedSpeedZones: true,
      plannedClosures: true,
      serviceRestored: false,
    },
  }),
  reminderTiming: reminderTimingPreferencesSchema.default({
    onChange: true,
    closure24h: true,
    closureMorning: true,
  }),
  plannedClosureFollowUp: z.string().default("smart"),
});

export const pushDeviceSummarySchema = z.object({
  enabledDeviceCount: z.number().default(0),
  hasEnabledDevices: z.boolean().default(false),
});

export const pushConfigSchema = z.object({
  webPushAvailable: z.boolean().default(false),
  vapidPublicKey: nullableString,
  preferences: pushPreferencesSchema,
  deviceSummary: pushDeviceSummarySchema.default({
    enabledDeviceCount: 0,
    hasEnabledDevices: false,
  }),
});

export const lineSubscriptionSelectionInputSchema = z.object({
  lineId: z.string(),
  subscribed: z.boolean(),
});

export const updatePushPreferencesInputSchema = z.object({
  commuteNotificationsEnabled: z.boolean().optional(),
  plannedClosureNotificationsEnabled: z.boolean().optional(),
  savedCommutes: z
    .object({
      currentDisruptions: z.boolean().optional(),
      plannedClosureReminders: z.boolean().optional(),
      eventTypes: eventTypePreferencesSchema.partial().optional(),
    })
    .optional(),
  lineSubscriptions: z
    .object({
      lines: z.array(lineSubscriptionSelectionInputSchema).optional(),
      eventTypes: eventTypePreferencesSchema.partial().optional(),
    })
    .optional(),
  reminderTiming: reminderTimingPreferencesSchema.partial().optional(),
  plannedClosureFollowUp: z.string().optional(),
});

export type EventTypePreferences = z.infer<typeof eventTypePreferencesSchema>;
export type SavedCommutePreferences = z.infer<typeof savedCommutePreferencesSchema>;
export type LineSubscription = z.infer<typeof lineSubscriptionSchema>;
export type LineSubscriptionPreferences = z.infer<typeof lineSubscriptionPreferencesSchema>;
export type ReminderTimingPreferences = z.infer<typeof reminderTimingPreferencesSchema>;
export type PushPreferences = z.infer<typeof pushPreferencesSchema>;
export type PushDeviceSummary = z.infer<typeof pushDeviceSummarySchema>;
export type PushConfig = z.infer<typeof pushConfigSchema>;
export type UpdatePushPreferencesInput = z.infer<typeof updatePushPreferencesInputSchema>;
