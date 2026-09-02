import { describe, expect, it } from "@jest/globals";

import {
  pushConfigSchema,
  pushPreferencesSchema,
  updatePushPreferencesInputSchema,
} from "@/api/push-schema";

describe("push schema contract", () => {
  it("parses valid push preferences schema", () => {
    const parsed = pushPreferencesSchema.parse({
      commuteNotificationsEnabled: true,
      plannedClosureNotificationsEnabled: true,
      savedCommutes: {
        currentDisruptions: true,
        plannedClosureReminders: true,
        eventTypes: {
          suspensions: true,
          delays: true,
          tripCancellations: true,
          reducedSpeedZones: false,
          plannedClosures: true,
          serviceRestored: false,
        },
      },
      lineSubscriptions: {
        lines: [
          { lineId: "line-1", lineNumber: "1", label: "Yonge-University", subscribed: true },
          { lineId: "regional-lw", lineNumber: "LW", label: "Lakeshore West", subscribed: false },
        ],
        eventTypes: {
          suspensions: true,
          delays: true,
          tripCancellations: true,
          reducedSpeedZones: true,
          plannedClosures: true,
          serviceRestored: false,
        },
      },
      reminderTiming: {
        onChange: true,
        closure24h: true,
        closureMorning: true,
      },
      plannedClosureFollowUp: "smart",
    });

    expect(parsed.commuteNotificationsEnabled).toBe(true);
    expect(parsed.savedCommutes.eventTypes.reducedSpeedZones).toBe(false);
    expect(parsed.lineSubscriptions.lines).toHaveLength(2);
    expect(parsed.lineSubscriptions.lines[0]?.lineId).toBe("line-1");
    expect(parsed.lineSubscriptions.lines[0]?.subscribed).toBe(true);
  });

  it("parses valid push config schema", () => {
    const parsed = pushConfigSchema.parse({
      webPushAvailable: true,
      vapidPublicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckj0ENVW",
      preferences: {
        commuteNotificationsEnabled: true,
        plannedClosureNotificationsEnabled: false,
        savedCommutes: {
          currentDisruptions: true,
          plannedClosureReminders: false,
          eventTypes: {
            suspensions: true,
            delays: true,
            tripCancellations: true,
            reducedSpeedZones: true,
            plannedClosures: true,
            serviceRestored: false,
          },
        },
        lineSubscriptions: {
          lines: [],
          eventTypes: {
            suspensions: true,
            delays: true,
            tripCancellations: true,
            reducedSpeedZones: true,
            plannedClosures: true,
            serviceRestored: false,
          },
        },
        reminderTiming: {
          onChange: true,
          closure24h: false,
          closureMorning: false,
        },
        plannedClosureFollowUp: "announcements-only",
      },
      deviceSummary: {
        enabledDeviceCount: 2,
        hasEnabledDevices: true,
      },
    });

    expect(parsed.webPushAvailable).toBe(true);
    expect(parsed.deviceSummary.enabledDeviceCount).toBe(2);
    expect(parsed.preferences.plannedClosureFollowUp).toBe("announcements-only");
  });

  it("parses update push preferences input", () => {
    const input = updatePushPreferencesInputSchema.parse({
      commuteNotificationsEnabled: false,
      plannedClosureFollowUp: "24h",
      savedCommutes: {
        eventTypes: {
          delays: false,
        },
      },
      lineSubscriptions: {
        lines: [{ lineId: "line-2", subscribed: true }],
      },
    });

    expect(input.commuteNotificationsEnabled).toBe(false);
    expect(input.plannedClosureFollowUp).toBe("24h");
    expect(input.savedCommutes?.eventTypes?.delays).toBe(false);
  });
});
