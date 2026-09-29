import type {
  AccountSavedCommute,
  AccountSavedCommuteNotificationRule,
  AccountSavedCommuteNotificationSchedule,
} from "./commute-data.ts";
import {
  defaultSavedCommuteNotificationRule,
  normalizeSavedCommuteNotificationRule,
} from "./commute-data.ts";
import type { NetworkId } from "./regional-data.ts";

export const NOTIFICATION_DAY_OPTIONS = [
  { bit: 2, label: "Mon" },
  { bit: 4, label: "Tue" },
  { bit: 8, label: "Wed" },
  { bit: 16, label: "Thu" },
  { bit: 32, label: "Fri" },
  { bit: 64, label: "Sat" },
  { bit: 1, label: "Sun" },
] as const;

export const NOTIFICATION_EVENT_OPTIONS: Array<{
  key: keyof AccountSavedCommuteNotificationRule["eventTypes"];
  label: string;
}> = [
  { key: "suspensions", label: "Suspensions" },
  { key: "delays", label: "Delays" },
  { key: "tripCancellations", label: "Train Cancellations" },
  { key: "plannedClosures", label: "Planned Advisories" },
  { key: "serviceRestored", label: "Service Restored" },
  { key: "reducedSpeedZones", label: "Reduced Speed Zones" },
];

export function notificationEventOptionsForNetwork(networkId: NetworkId) {
  return networkId === "regional"
    ? NOTIFICATION_EVENT_OPTIONS.filter((eventType) => eventType.key !== "reducedSpeedZones")
    : NOTIFICATION_EVENT_OPTIONS.filter((eventType) => eventType.key !== "tripCancellations");
}

export function scopeNotificationRuleToNetwork(
  rule: AccountSavedCommuteNotificationRule,
  networkId: NetworkId,
): AccountSavedCommuteNotificationRule {
  const normalized = normalizeSavedCommuteNotificationRule(rule);
  return networkId === "regional"
    ? {
        ...normalized,
        eventTypes: {
          ...normalized.eventTypes,
          reducedSpeedZones: false,
        },
      }
    : normalized;
}

export type NotificationScheduleKey = "outboundSchedule" | "returnSchedule";
export type NotificationScheduleMode = "am-rush" | "pm-rush" | "all-day" | "custom";

export function notificationScheduleMode(
  schedule: AccountSavedCommuteNotificationSchedule,
): NotificationScheduleMode {
  if (schedule.dayMask === 62 && schedule.startMinute === 6 * 60 + 30 && schedule.endMinute === 9 * 60 + 30) {
    return "am-rush";
  }
  if (schedule.dayMask === 62 && schedule.startMinute === 15 * 60 && schedule.endMinute === 19 * 60) {
    return "pm-rush";
  }
  if (schedule.dayMask === 127 && schedule.startMinute === null && schedule.endMinute === null) {
    return "all-day";
  }
  return "custom";
}

export function presetScheduleForMode(
  mode: NotificationScheduleMode,
  currentSchedule?: AccountSavedCommuteNotificationSchedule,
  key?: NotificationScheduleKey,
): Partial<AccountSavedCommuteNotificationSchedule> {
  if (mode === "am-rush") {
    return { dayMask: 62, startMinute: 6 * 60 + 30, endMinute: 9 * 60 + 30 };
  }
  if (mode === "pm-rush") {
    return { dayMask: 62, startMinute: 15 * 60, endMinute: 19 * 60 };
  }
  if (mode === "all-day") {
    return { dayMask: 127, startMinute: null, endMinute: null };
  }
  return {
    dayMask: currentSchedule?.dayMask || 62,
    startMinute: currentSchedule?.startMinute ?? (key === "outboundSchedule" ? 6 * 60 + 30 : 15 * 60),
    endMinute: currentSchedule?.endMinute ?? (key === "outboundSchedule" ? 9 * 60 + 30 : 19 * 60),
  };
}

export function cloneNotificationRule(
  rule: AccountSavedCommuteNotificationRule | null | undefined,
): AccountSavedCommuteNotificationRule {
  return normalizeSavedCommuteNotificationRule(rule);
}

export function minuteToTimeValue(minute: number | null | undefined): string {
  if (minute === null || minute === undefined || minute < 0) return "";
  const safeMinute = Math.max(0, Math.min(1439, minute));
  const hours = Math.floor(safeMinute / 60).toString().padStart(2, "0");
  const minutes = (safeMinute % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function timeValueToMinute(value: string): number {
  if (!value) return -1;
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return -1;
  }
  return Math.max(0, Math.min(1439, hours * 60 + minutes));
}

export function formatMinuteLabel(minute: number | null | undefined): string {
  if (minute === null || minute === undefined || minute < 0) return "";
  const hours24 = Math.floor(minute / 60);
  const minutes = minute % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export function formatDayMask(dayMask: number): string {
  if (dayMask === 127) return "Every Day";
  if (dayMask === 62) return "Weekdays";
  if (dayMask === 65) return "Weekends";
  const labels = NOTIFICATION_DAY_OPTIONS.filter((day) => (dayMask & day.bit) !== 0).map((day) => day.label);
  return labels.length > 0 ? labels.join(", ") : "No Days";
}

export function formatWindow(schedule: AccountSavedCommuteNotificationSchedule): string {
  if (schedule.startMinute === null || schedule.endMinute === null) {
    return "All Day";
  }
  if (schedule.startMinute < 0 || schedule.endMinute < 0) {
    return "Custom";
  }
  return `${formatMinuteLabel(schedule.startMinute)}-${formatMinuteLabel(schedule.endMinute)}`;
}

export function formatScheduleSummary(schedule: AccountSavedCommuteNotificationSchedule): string {
  if (schedule.dayMask === 127 && schedule.startMinute === null && schedule.endMinute === null) {
    return "Every Day · All Day";
  }
  return `${formatDayMask(schedule.dayMask)} · ${formatWindow(schedule)}`;
}

export function formatLegSchedule(
  label: string,
  enabled: boolean,
  schedule: AccountSavedCommuteNotificationSchedule,
): string {
  return enabled ? `${label}: ${formatDayMask(schedule.dayMask)} · ${formatWindow(schedule)}` : `${label}: Off`;
}

export function hasInvalidNotificationSchedule(rule: AccountSavedCommuteNotificationRule): boolean {
  return [rule.outboundSchedule, rule.returnSchedule].some((schedule) => {
    const hasStart = schedule.startMinute !== null;
    const hasEnd = schedule.endMinute !== null;
    return (
      hasStart !== hasEnd ||
      (hasStart &&
        hasEnd &&
        (schedule.startMinute! < 0 || schedule.endMinute! < 0 || schedule.startMinute === schedule.endMinute))
    );
  });
}

export function formatEventTypes(rule: AccountSavedCommuteNotificationRule, networkId: NetworkId): string {
  const availableEventTypes = notificationEventOptionsForNetwork(networkId);
  const labels = availableEventTypes
    .filter((eventType) => rule.eventTypes[eventType.key])
    .map((eventType) => eventType.label);
  if (labels.length === availableEventTypes.length) return "All Events";
  if (labels.length === 0) return "No Events";
  return labels.join(", ");
}

export function ruleForCommute(commute: AccountSavedCommute): AccountSavedCommuteNotificationRule {
  return cloneNotificationRule(commute.notificationRule ?? defaultSavedCommuteNotificationRule);
}
