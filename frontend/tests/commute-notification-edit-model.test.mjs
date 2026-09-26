import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NOTIFICATION_DAY_OPTIONS,
  NOTIFICATION_EVENT_OPTIONS,
  notificationEventOptionsForNetwork,
  scopeNotificationRuleToNetwork,
  notificationScheduleMode,
  presetScheduleForMode,
  cloneNotificationRule,
  minuteToTimeValue,
  timeValueToMinute,
  formatMinuteLabel,
  formatDayMask,
  formatWindow,
  formatScheduleSummary,
  formatLegSchedule,
  hasInvalidNotificationSchedule,
  formatEventTypes,
  ruleForCommute,
} from "../src/app/commute-notification-edit-model.ts";
import { defaultSavedCommuteNotificationRule } from "../src/app/commute-data.ts";

describe("commute notification edit model", () => {
  describe("day masks and day options", () => {
    it("defines 7 distinct day bits covering all days of the week", () => {
      assert.equal(NOTIFICATION_DAY_OPTIONS.length, 7);
      const totalMask = NOTIFICATION_DAY_OPTIONS.reduce((acc, day) => acc | day.bit, 0);
      assert.equal(totalMask, 127);
    });

    it("formats standard day mask combinations", () => {
      assert.equal(formatDayMask(127), "Every Day");
      assert.equal(formatDayMask(62), "Weekdays"); // Mon(2) + Tue(4) + Wed(8) + Thu(16) + Fri(32)
      assert.equal(formatDayMask(65), "Weekends"); // Sat(64) + Sun(1)
      assert.equal(formatDayMask(0), "No Days");
    });

    it("formats custom subsets of days in order", () => {
      assert.equal(formatDayMask(2 | 8), "Mon, Wed");
      assert.equal(formatDayMask(16 | 32 | 64), "Thu, Fri, Sat");
      assert.equal(formatDayMask(1), "Sun");
    });
  });

  describe("Toronto time conversion and minute formatting", () => {
    it("converts minutes to HH:MM time value string", () => {
      assert.equal(minuteToTimeValue(0), "00:00");
      assert.equal(minuteToTimeValue(390), "06:30");
      assert.equal(minuteToTimeValue(900), "15:00");
      assert.equal(minuteToTimeValue(1439), "23:59");
      assert.equal(minuteToTimeValue(null), "");
      assert.equal(minuteToTimeValue(undefined), "");
      assert.equal(minuteToTimeValue(-1), "");
    });

    it("clamps out-of-range minutes safely", () => {
      assert.equal(minuteToTimeValue(2000), "23:59");
    });

    it("parses HH:MM time values to minutes from midnight", () => {
      assert.equal(timeValueToMinute("00:00"), 0);
      assert.equal(timeValueToMinute("06:30"), 390);
      assert.equal(timeValueToMinute("15:00"), 900);
      assert.equal(timeValueToMinute("23:59"), 1439);
      assert.equal(timeValueToMinute(""), -1);
      assert.equal(timeValueToMinute("invalid"), -1);
      assert.equal(timeValueToMinute("25:99"), 1439);
    });

    it("formats 12-hour AM/PM minute labels", () => {
      assert.equal(formatMinuteLabel(0), "12:00 AM");
      assert.equal(formatMinuteLabel(390), "6:30 AM");
      assert.equal(formatMinuteLabel(720), "12:00 PM");
      assert.equal(formatMinuteLabel(900), "3:00 PM");
      assert.equal(formatMinuteLabel(1140), "7:00 PM");
      assert.equal(formatMinuteLabel(1439), "11:59 PM");
      assert.equal(formatMinuteLabel(null), "");
      assert.equal(formatMinuteLabel(-1), "");
    });

    it("formats time windows and schedule summaries", () => {
      assert.equal(formatWindow({ dayMask: 62, startMinute: null, endMinute: null }), "All Day");
      assert.equal(formatWindow({ dayMask: 62, startMinute: 390, endMinute: 570 }), "6:30 AM-9:30 AM");
      assert.equal(formatWindow({ dayMask: 62, startMinute: -1, endMinute: 570 }), "Custom");

      assert.equal(
        formatScheduleSummary({ dayMask: 127, startMinute: null, endMinute: null }),
        "Every Day · All Day",
      );
      assert.equal(
        formatScheduleSummary({ dayMask: 62, startMinute: 390, endMinute: 570 }),
        "Weekdays · 6:30 AM-9:30 AM",
      );
    });

    it("formats leg schedules with label and enabled state", () => {
      const schedule = { dayMask: 62, startMinute: 390, endMinute: 570 };
      assert.equal(
        formatLegSchedule("Outbound", true, schedule),
        "Outbound: Weekdays · 6:30 AM-9:30 AM",
      );
      assert.equal(formatLegSchedule("Outbound", false, schedule), "Outbound: Off");
      assert.equal(formatLegSchedule("Return", false, schedule), "Return: Off");
    });
  });

  describe("schedule modes and presets", () => {
    it("recognizes standard schedule modes", () => {
      assert.equal(
        notificationScheduleMode({ dayMask: 62, startMinute: 390, endMinute: 570 }),
        "am-rush",
      );
      assert.equal(
        notificationScheduleMode({ dayMask: 62, startMinute: 900, endMinute: 1140 }),
        "pm-rush",
      );
      assert.equal(
        notificationScheduleMode({ dayMask: 127, startMinute: null, endMinute: null }),
        "all-day",
      );
      assert.equal(
        notificationScheduleMode({ dayMask: 62, startMinute: 480, endMinute: 600 }),
        "custom",
      );
    });

    it("generates correct preset patches for each mode", () => {
      assert.deepEqual(presetScheduleForMode("am-rush"), {
        dayMask: 62,
        startMinute: 390,
        endMinute: 570,
      });
      assert.deepEqual(presetScheduleForMode("pm-rush"), {
        dayMask: 62,
        startMinute: 900,
        endMinute: 1140,
      });
      assert.deepEqual(presetScheduleForMode("all-day"), {
        dayMask: 127,
        startMinute: null,
        endMinute: null,
      });
      const customOutbound = presetScheduleForMode("custom", undefined, "outboundSchedule");
      assert.equal(customOutbound.dayMask, 62);
      assert.equal(customOutbound.startMinute, 390);
      assert.equal(customOutbound.endMinute, 570);

      const customReturn = presetScheduleForMode("custom", undefined, "returnSchedule");
      assert.equal(customReturn.dayMask, 62);
      assert.equal(customReturn.startMinute, 900);
      assert.equal(customReturn.endMinute, 1140);
    });
  });

  describe("schedule validation and invalid windows", () => {
    it("accepts valid schedules with both times null (All Day)", () => {
      const rule = {
        ...defaultSavedCommuteNotificationRule,
        outboundSchedule: { dayMask: 127, startMinute: null, endMinute: null },
        returnSchedule: { dayMask: 127, startMinute: null, endMinute: null },
      };
      assert.equal(hasInvalidNotificationSchedule(rule), false);
    });

    it("accepts valid schedules with different positive start and end minutes", () => {
      const rule = {
        ...defaultSavedCommuteNotificationRule,
        outboundSchedule: { dayMask: 62, startMinute: 390, endMinute: 570 },
        returnSchedule: { dayMask: 62, startMinute: 900, endMinute: 1140 },
      };
      assert.equal(hasInvalidNotificationSchedule(rule), false);
    });

    it("rejects schedules with startMinute set but endMinute null", () => {
      const rule = {
        ...defaultSavedCommuteNotificationRule,
        outboundSchedule: { dayMask: 62, startMinute: 390, endMinute: null },
      };
      assert.equal(hasInvalidNotificationSchedule(rule), true);
    });

    it("rejects schedules with endMinute set but startMinute null", () => {
      const rule = {
        ...defaultSavedCommuteNotificationRule,
        outboundSchedule: { dayMask: 62, startMinute: null, endMinute: 570 },
      };
      assert.equal(hasInvalidNotificationSchedule(rule), true);
    });

    it("rejects schedules where startMinute equals endMinute", () => {
      const rule = {
        ...defaultSavedCommuteNotificationRule,
        outboundSchedule: { dayMask: 62, startMinute: 480, endMinute: 480 },
      };
      assert.equal(hasInvalidNotificationSchedule(rule), true);
    });

    it("rejects schedules with negative minutes", () => {
      const rule = {
        ...defaultSavedCommuteNotificationRule,
        outboundSchedule: { dayMask: 62, startMinute: -1, endMinute: 570 },
      };
      assert.equal(hasInvalidNotificationSchedule(rule), true);
    });

    it("checks both outbound and return schedules independently", () => {
      const invalidReturnRule = {
        ...defaultSavedCommuteNotificationRule,
        outboundSchedule: { dayMask: 62, startMinute: 390, endMinute: 570 },
        returnSchedule: { dayMask: 62, startMinute: 600, endMinute: 600 },
      };
      assert.equal(hasInvalidNotificationSchedule(invalidReturnRule), true);
    });
  });

  describe("network event options and scoping", () => {
    it("defines the canonical notification event options list", () => {
      assert.equal(NOTIFICATION_EVENT_OPTIONS.length, 6);
      assert.deepEqual(
        NOTIFICATION_EVENT_OPTIONS.map((opt) => opt.key),
        ["suspensions", "delays", "tripCancellations", "plannedClosures", "serviceRestored", "reducedSpeedZones"]
      );
    });

    it("provides TTC-specific event options excluding train cancellations", () => {
      const ttcOptions = notificationEventOptionsForNetwork("ttc");
      assert.equal(ttcOptions.some((opt) => opt.key === "reducedSpeedZones"), true);
      assert.equal(ttcOptions.some((opt) => opt.key === "tripCancellations"), false);
      assert.equal(ttcOptions.some((opt) => opt.key === "suspensions"), true);
      assert.equal(ttcOptions.some((opt) => opt.key === "delays"), true);
      assert.equal(ttcOptions.some((opt) => opt.key === "plannedClosures"), true);
      assert.equal(ttcOptions.some((opt) => opt.key === "serviceRestored"), true);
    });

    it("provides Regional-specific event options excluding reduced speed zones", () => {
      const regionalOptions = notificationEventOptionsForNetwork("regional");
      assert.equal(regionalOptions.some((opt) => opt.key === "reducedSpeedZones"), false);
      assert.equal(regionalOptions.some((opt) => opt.key === "tripCancellations"), true);
      assert.equal(regionalOptions.some((opt) => opt.key === "suspensions"), true);
    });

    it("scopes notification rules to regional network by forcing reducedSpeedZones off", () => {
      const rule = {
        ...defaultSavedCommuteNotificationRule,
        eventTypes: {
          ...defaultSavedCommuteNotificationRule.eventTypes,
          reducedSpeedZones: true,
          tripCancellations: true,
        },
      };
      const scopedRegional = scopeNotificationRuleToNetwork(rule, "regional");
      assert.equal(scopedRegional.eventTypes.reducedSpeedZones, false);
      assert.equal(scopedRegional.eventTypes.tripCancellations, true);

      const scopedTtc = scopeNotificationRuleToNetwork(rule, "ttc");
      assert.equal(scopedTtc.eventTypes.reducedSpeedZones, true);
    });

    it("formats event type labels correctly", () => {
      const allEventsRule = {
        ...defaultSavedCommuteNotificationRule,
        eventTypes: {
          suspensions: true,
          delays: true,
          tripCancellations: true,
          plannedClosures: true,
          serviceRestored: true,
          reducedSpeedZones: true,
        },
      };
      assert.equal(formatEventTypes(allEventsRule, "ttc"), "All Events");
      assert.equal(formatEventTypes(allEventsRule, "regional"), "All Events");

      const noEventsRule = {
        ...defaultSavedCommuteNotificationRule,
        eventTypes: {
          suspensions: false,
          delays: false,
          tripCancellations: false,
          plannedClosures: false,
          serviceRestored: false,
          reducedSpeedZones: false,
        },
      };
      assert.equal(formatEventTypes(noEventsRule, "ttc"), "No Events");

      const subsetRule = {
        ...defaultSavedCommuteNotificationRule,
        eventTypes: {
          suspensions: true,
          delays: true,
          tripCancellations: false,
          plannedClosures: false,
          serviceRestored: false,
          reducedSpeedZones: false,
        },
      };
      assert.equal(formatEventTypes(subsetRule, "ttc"), "Suspensions, Delays");
    });
  });

  describe("commute rule extraction and cloning", () => {
    it("extracts rule from commute or defaults", () => {
      const commuteWithRule = {
        id: "commute-1",
        label: "Work",
        originStationId: "finch",
        destinationStationId: "union",
        networkId: "ttc",
        watchReturnTrip: true,
        notificationRule: {
          ...defaultSavedCommuteNotificationRule,
          enabled: true,
          outboundEnabled: true,
          returnEnabled: false,
        },
      };
      const rule = ruleForCommute(commuteWithRule);
      assert.equal(rule.enabled, true);
      assert.equal(rule.outboundEnabled, true);
      assert.equal(rule.returnEnabled, false);

      const commuteWithoutRule = {
        id: "commute-2",
        label: "Gym",
        originStationId: "bloor",
        destinationStationId: "dundas",
        networkId: "ttc",
        watchReturnTrip: false,
      };
      const defaultRule = ruleForCommute(commuteWithoutRule);
      assert.equal(defaultRule.enabled, true);
      assert.equal(defaultRule.outboundEnabled, true);
      assert.equal(defaultRule.returnEnabled, true);
    });

    it("clones a notification rule without shared mutation", () => {
      const original = { ...defaultSavedCommuteNotificationRule };
      const clone = cloneNotificationRule(original);
      assert.notEqual(clone, original);
      assert.deepEqual(clone, original);
    });
  });
});
