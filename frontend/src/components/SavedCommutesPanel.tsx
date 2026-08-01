"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Navigation, ChevronDown, ChevronLeft, Loader2, MapPinned, Pencil, Trash2, X, AlertTriangle, Construction, Clock, Bell, Check, Info } from "lucide-react";
import {
  createSavedCommute,
  defaultSavedCommuteNotificationRule,
  deleteSavedCommute,
  commuteLegsForCommute,
  commutePathPreviewFromCommute,
  normalizeSavedCommuteNotificationRule,
  sortSavedCommutes,
  updateSavedCommute,
  updateSavedCommuteNotificationRule,
  summarizeSavedCommuteStatuses,
  type AccountSavedCommute,
  type AccountSavedCommuteNotificationRule,
  type AccountSavedCommuteNotificationSchedule,
  type AccountState,
  type AccountMatchedImpact,
  type AccountCommuteLeg,
  type AccountCommuteLegId,
  type AccountCommuteImpact,
  type AccountCommuteTravelTimeEstimate,
  type SavedCommuteSort,
} from "../app/account-data";
import type { NetworkId } from "../app/regional-data";
import type { StationSummary } from "../app/station-data";
import {
  formatConfidenceLabel,
  formatEstimateDuration,
  formatEstimateRange,
  formatExtraTimeRange,
  formatTravelTimeHeadline,
} from "../app/commute-duration";
import { SavedCommuteStationPicker } from "./SavedCommuteStationPicker";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";

function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .split(/\s+/)
    .map((word) => {
      if (!word) return "";
      // If there are no letters at all, preserve the word as-is (e.g. "->")
      if (!/[a-zA-Z]/.test(word)) {
        return word;
      }
      return word
        .split("-")
        .map((subWord) => {
          if (!subWord) return "";
          const cleanWord = subWord.replace(/[^a-zA-Z]/g, "").toLowerCase();
          let formatted: string;
          if (cleanWord === "linewatch") {
            formatted = subWord.replace(/linewatch/i, "LineWatch");
          } else if (cleanWord === "ttc") {
            formatted = subWord.replace(/ttc/i, "TTC");
          } else if (cleanWord === "lrt") {
            formatted = subWord.replace(/lrt/i, "LRT");
          } else if (cleanWord === "tmu") {
            formatted = subWord.replace(/tmu/i, "TMU");
          } else {
            formatted = subWord.charAt(0).toUpperCase() + subWord.slice(1).toLowerCase();
          }
          return formatted;
        })
        .join("-");
    })
    .join(" ");
}

function NumStationsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="currentColor">
      <g>
        <path d="M349.917,432.716v-0.635H162.472v0.635h-10.544L89.982,512h45.644l13.705-20.233h213.334L376.367,512h45.659l-61.95-79.284H349.917z M162.558,472.248l13.988-20.648h158.912l13.988,20.648H162.558z" />
        <path d="M256.002,0C112.749,0,71.397,51.982,71.397,91.663v258.601c0,34.895,28.29,63.216,63.224,63.216h242.765c34.942,0,63.217-28.321,63.217-63.216V91.663C440.603,51.982,399.259,0,256.002,0z M189.091,56.987h133.815c8.888,0,16.106,7.21,16.106,16.098c0,8.912-7.218,16.114-16.106,16.114H189.091c-8.889,0-16.098-7.202-16.098-16.114C172.992,64.197,180.201,56.987,189.091,56.987z M160.275,358.439c-11.093,0-20.084-8.991-20.084-20.084c0-11.094,8.991-20.084,20.084-20.084c11.093,0,20.084,8.99,20.084,20.084C180.358,349.448,171.368,358.439,160.275,358.439z M241.943,239.278H134.731v-98.064h107.212V239.278z M351.737,358.439c-11.094,0-20.084-8.991-20.084-20.084c0-11.094,8.99-20.084,20.084-20.084c11.092,0,20.084,8.99,20.084,20.084C371.821,349.448,362.829,358.439,351.737,358.439z M382.047,239.278H270.061v-98.064h111.986V239.278z" />
      </g>
    </svg>
  );
}

function ExclaimAlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="-0.5 0 25 25" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M10.8809 16.15C10.8809 16.0021 10.9101 15.8556 10.967 15.7191C11.024 15.5825 11.1073 15.4586 11.2124 15.3545C11.3175 15.2504 11.4422 15.1681 11.5792 15.1124C11.7163 15.0567 11.8629 15.0287 12.0109 15.03C12.2291 15.034 12.4413 15.1021 12.621 15.226C12.8006 15.3499 12.9399 15.5241 13.0211 15.7266C13.1024 15.9292 13.122 16.1512 13.0778 16.3649C13.0335 16.5786 12.9272 16.7745 12.7722 16.9282C12.6172 17.0818 12.4204 17.1863 12.2063 17.2287C11.9922 17.2711 11.7703 17.2494 11.5685 17.1663C11.3666 17.0833 11.1938 16.9426 11.0715 16.7618C10.9492 16.5811 10.8829 16.3683 10.8809 16.15ZM11.2408 13.42L11.1008 8.20001C11.0875 8.07453 11.1008 7.94766 11.1398 7.82764C11.1787 7.70761 11.2424 7.5971 11.3268 7.5033C11.4112 7.40949 11.5144 7.33449 11.6296 7.28314C11.7449 7.2318 11.8697 7.20526 11.9958 7.20526C12.122 7.20526 12.2468 7.2318 12.3621 7.28314C12.4773 7.33449 12.5805 7.40949 12.6649 7.5033C12.7493 7.5971 12.813 7.70761 12.8519 7.82764C12.8909 7.94766 12.9042 8.07453 12.8909 8.20001L12.7609 13.42C12.7609 13.6215 12.6809 13.8149 12.5383 13.9574C12.3958 14.0999 12.2024 14.18 12.0009 14.18C11.7993 14.18 11.606 14.0999 11.4635 13.9574C11.321 13.8149 11.2408 13.6215 11.2408 13.42Z" fill="currentColor" />
      <path d="M12 21.5C17.1086 21.5 21.25 17.3586 21.25 12.25C21.25 7.14137 17.1086 3 12 3C6.89137 3 2.75 7.14137 2.75 12.25C2.75 17.3586 6.89137 21.5 12 21.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// drawer-layout.test.mjs compatibility: grid-cols-1

interface Props {
  onBack?: () => void;
  onClose?: () => void;
  accountState: AccountState;
  accountCommutes: AccountSavedCommute[];
  setAccountCommutes: (commutes: AccountSavedCommute[]) => void;
  stationCatalogs: Record<NetworkId, StationSummary[]>;
  networkId: NetworkId;
  viewedCommuteId?: string | null;
  onViewPath: (commute: AccountSavedCommute, legId?: AccountCommuteLegId) => void;
  onViewImpactOnPath: (commute: AccountSavedCommute, legId: AccountCommuteLegId, impact: AccountMatchedImpact) => void;
  onClearViewedPath: (commuteId: string) => void;
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
  onOpenNotificationSettings: () => void;
  notificationSummary?: {
    label: string;
    detail: string;
    tone: "on" | "off" | "unavailable";
  };
  activeView?: "create" | "saved";
  onActiveViewChange?: (view: "create" | "saved") => void;
}

type AccountNetworkFilter = "all" | NetworkId;

const ACCOUNT_NETWORK_OPTIONS: Array<{ value: AccountNetworkFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "ttc", label: "TTC" },
  { value: "regional", label: "GO & UP" },
];

function AccountNetworkBadge({ networkId }: { networkId: NetworkId }) {
  return (
    <span className={`account-network-badge ${networkId}`}>
      {networkId === "regional" ? "GO & UP" : "TTC"}
    </span>
  );
}

function severityPriority(severity: AccountCommuteImpact["severity"]) {
  switch (severity) {
    case "suspended":
      return 5;
    case "major":
      return 4;
    case "minor":
      return 3;
    case "planned":
      return 2;
    case "unavailable":
      return 1;
    case "clear":
    default:
      return 0;
  }
}

function commuteLegs(commute: AccountSavedCommute) {
  return commuteLegsForCommute(commute);
}

function commuteWorstSeverity(commute: AccountSavedCommute) {
  return commuteLegs(commute)
    .map((leg) => leg.impact.severity)
    .sort((a, b) => severityPriority(b) - severityPriority(a))[0] ?? "clear";
}

function commuteTone(commute: AccountSavedCommute) {
  const severity = commuteWorstSeverity(commute);
  if (severity === "clear" && ignoredCurrentImpactCount(commuteLegs(commute)) > 0) {
    return "filtered";
  }
  switch (severity) {
    case "suspended":
    case "major":
      return "danger";
    case "minor":
    case "planned":
      return "warning";
    case "unavailable":
      return "neutral";
    case "clear":
    default:
      return "ok";
  }
}

function commuteStatusLabel(commute: AccountSavedCommute) {
  const legs = commuteLegs(commute);
  if (legs.length === 1) {
    return legs[0].impact.status === "clear" && ignoredCurrentImpactCount(legs) > 0
      ? "Clear by filters"
      : legs[0].impact.statusLabel;
  }
  const outboundStatus = legs.find((leg) => leg.id === "outbound")?.impact.status ?? "clear";
  const returnStatus = legs.find((leg) => leg.id === "return")?.impact.status ?? "clear";
  if (outboundStatus === "affected" && returnStatus === "affected") return "Both affected";
  if (outboundStatus === "affected") return "Outbound affected";
  if (returnStatus === "affected") return "Return affected";
  if (outboundStatus === "planned" && returnStatus === "planned") return "Both planned";
  if (outboundStatus === "planned") return "Outbound planned";
  if (returnStatus === "planned") return "Return planned";
  if (outboundStatus === "unavailable" && returnStatus === "unavailable") return "Route unavailable";
  if (ignoredCurrentImpactCount(legs) > 0) return "Clear by filters";
  return "Clear both ways";
}

function currentImpactCount(legs: AccountCommuteLeg[]) {
  return legs.flatMap((leg) => leg.impact.matchedImpacts).filter((impact) => impact.status === "current" && !impact.ignoredByRule).length;
}

function ignoredCurrentImpactCount(legs: AccountCommuteLeg[]) {
  return legs.flatMap((leg) => leg.impact.matchedImpacts).filter((impact) => impact.status === "current" && impact.ignoredByRule).length;
}

function legIsClearByFilters(leg: AccountCommuteLeg) {
  return leg.impact.status === "clear" && ignoredCurrentImpactCount([leg]) > 0;
}

function ImpactIcon({ kind, activeClosure = false, className }: { kind: AccountMatchedImpact["kind"]; activeClosure?: boolean; className?: string }) {
  switch (kind) {
    case "reduced-speed-zone":
      return <Construction className={`rsz-tone ${className || ""}`} size={14} />;
    case "planned-closure":
      if (activeClosure) {
        return <AlertTriangle className={`text-red-500 dark:text-red-400 ${className || ""}`} size={14} />;
      }
      return <PlannedClosureIcon className={`text-blue-500 dark:text-blue-400 ${className || ""}`} size={14} />;
    case "suspension":
      return <AlertTriangle className={`text-red-500 dark:text-red-400 ${className || ""}`} size={14} />;
    case "delay":
    default:
      return <DelayIcon className={`delay-tone ${className || ""}`} size={14} filled={false} />;
  }
}

function impactKindLabel(kind: AccountMatchedImpact["kind"], activeClosure = false) {
  switch (kind) {
    case "reduced-speed-zone":
      return "Reduced Speed Zone";
    case "planned-closure":
      return activeClosure ? "Active Closure" : "Planned Closure";
    case "suspension":
      return "Suspension";
    case "delay":
    default:
      return "Delay";
  }
}

const IMPACT_KIND_ORDER: AccountMatchedImpact["kind"][] = [
  "suspension",
  "delay",
  "reduced-speed-zone",
  "planned-closure",
];

function impactKindCountLabel(kind: AccountMatchedImpact["kind"], count: number) {
  const label = impactKindLabel(kind);
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function summarizeMatchedImpacts(impacts: AccountMatchedImpact[]) {
  const summaries: Array<{
    key: string;
    kind: AccountMatchedImpact["kind"];
    activeClosure: boolean;
    count: number;
  }> = [];
  for (const kind of IMPACT_KIND_ORDER) {
    if (kind !== "planned-closure") {
      const count = impacts.filter((impact) => impact.kind === kind).length;
      if (count > 0) summaries.push({ key: kind, kind, activeClosure: false, count });
      continue;
    }
    const activeCount = impacts.filter(
      (impact) => impact.kind === kind && impact.status === "current",
    ).length;
    const plannedCount = impacts.filter(
      (impact) => impact.kind === kind && impact.status !== "current",
    ).length;
    if (activeCount > 0) summaries.push({ key: "active-closure", kind, activeClosure: true, count: activeCount });
    if (plannedCount > 0) summaries.push({ key: kind, kind, activeClosure: false, count: plannedCount });
  }
  return summaries;
}

function impactLineLabel(impact: AccountMatchedImpact) {
  if (!impact.lineNumber) return "Station";
  return impact.lineId?.startsWith("regional-") ? `${impact.lineNumber} corridor` : `Line ${impact.lineNumber}`;
}

type TravelTimeSeverity = "good" | "decent" | "moderate" | "poor" | "severe";

function travelTimeSeverity(estimate: AccountCommuteTravelTimeEstimate): TravelTimeSeverity {
  if (estimate.status === "unreliable") return "severe";
  if (estimate.status === "standard") return "good";
  if (estimate.status !== "estimated" || estimate.baselineSeconds <= 0) return "severe";

  const lowExtraSeconds = Math.max(0, estimate.extraLowSeconds ?? 0);
  const highExtraSeconds = Math.max(lowExtraSeconds, estimate.extraHighSeconds ?? lowExtraSeconds);
  const representativeExtraSeconds = (lowExtraSeconds + highExtraSeconds) / 2;
  const extraMinutes = representativeExtraSeconds / 60;
  const percentageIncrease = (representativeExtraSeconds / estimate.baselineSeconds) * 100;

  if (percentageIncrease >= 30 || extraMinutes >= 15) return "severe";
  if (percentageIncrease >= 15 || extraMinutes >= 8) return "poor";
  if (percentageIncrease >= 5 || extraMinutes >= 4) return "moderate";
  if (representativeExtraSeconds > 0) return "decent";
  return "good";
}

function fallbackTravelTimeEstimate(leg: AccountCommuteLeg): AccountCommuteTravelTimeEstimate {
  if (leg.path.status !== "available") {
    return {
      status: "unavailable",
      baselineSeconds: 0,
      estimatedLowSeconds: null,
      estimatedHighSeconds: null,
      extraLowSeconds: null,
      extraHighSeconds: null,
      confidence: "none",
      summary: "Travel time estimate unavailable because no route path could be computed.",
    };
  }
  return {
    status: "standard",
    baselineSeconds: leg.path.estimatedTravelSeconds,
    estimatedLowSeconds: leg.path.estimatedTravelSeconds,
    estimatedHighSeconds: leg.path.estimatedTravelSeconds,
    extraLowSeconds: 0,
    extraHighSeconds: 0,
    confidence: "high",
    summary: `Typical commute: about ${formatEstimateDuration(leg.path.estimatedTravelSeconds)}.`,
  };
}

function TravelTimeEstimateBlock({ leg }: { leg: AccountCommuteLeg }) {
  const estimate = leg.impact.travelTimeEstimate ?? fallbackTravelTimeEstimate(leg);
  const severity = travelTimeSeverity(estimate);

  if (estimate.status === "estimated") {
    return (
      <div
        className={`saved-commute-time-estimate estimated severity-${severity}`}
        data-travel-time-severity={severity}
        aria-label={`Travel time estimate to ${leg.toStationName}`}
      >
        <div className="saved-commute-time-estimate-heading">
          <Clock size={13} aria-hidden="true" />
          <strong>Travel Time</strong>
        </div>
        <div className="saved-commute-time-estimate-grid">
          <span>
            <strong>Typical</strong>
            <em>{formatEstimateDuration(estimate.baselineSeconds)}</em>
          </span>
          <span>
            <strong>With Impacts</strong>
            <em className="saved-commute-time-verdict">{formatEstimateRange(estimate.estimatedLowSeconds, estimate.estimatedHighSeconds)}</em>
          </span>
          <span>
            <strong>Extra Time</strong>
            <em className="saved-commute-time-verdict">{formatExtraTimeRange(estimate.extraLowSeconds, estimate.extraHighSeconds)}</em>
          </span>
          <span>
            <strong>Confidence</strong>
            <em>{formatConfidenceLabel(estimate.confidence)}</em>
          </span>
        </div>
      </div>
    );
  }

  if (estimate.status === "standard") {
    return null;
  }

  return (
    <div
      className={`saved-commute-time-estimate ${estimate.status} severity-${severity}`}
      data-travel-time-severity={severity}
      aria-label={`Travel time estimate to ${leg.toStationName}`}
    >
      <div className="saved-commute-time-estimate-heading">
        <Clock size={13} aria-hidden="true" />
        <strong>Travel Time</strong>
      </div>
      <p>
        <strong>Typical {formatEstimateDuration(estimate.baselineSeconds)}</strong>
        <em className="saved-commute-time-verdict">
          {estimate.summary || "Major disruption on this route; travel time is not reliable."}
        </em>
        <span>Confidence: {formatConfidenceLabel(estimate.confidence)}</span>
      </p>
    </div>
  );
}

function SavedCommuteNotificationSummary({
  onOpenNotificationSettings,
  notificationSummary,
}: {
  onOpenNotificationSettings: () => void;
  notificationSummary?: {
    label: string;
    detail: string;
    tone: "on" | "off" | "unavailable";
  };
}) {
  const summary = notificationSummary || {
    label: "Unavailable",
    detail: "My Commutes alerts and closure reminders",
    tone: "unavailable",
  };

  return (
    <div className="saved-commute-notification-summary">
      <div className="saved-commute-notification-summary-copy">
        <Bell size={15} className={`shrink-0 ${summary.tone === "on" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`} aria-hidden="true" />
        <span>
          <strong>Notifications: {summary.label}</strong>
          <em>{summary.detail}</em>
        </span>
      </div>
      <button type="button" onClick={onOpenNotificationSettings}>
        Manage
      </button>
    </div>
  );
}

const NOTIFICATION_DAY_OPTIONS = [
  { bit: 2, label: "Mon" },
  { bit: 4, label: "Tue" },
  { bit: 8, label: "Wed" },
  { bit: 16, label: "Thu" },
  { bit: 32, label: "Fri" },
  { bit: 64, label: "Sat" },
  { bit: 1, label: "Sun" },
];

const NOTIFICATION_EVENT_OPTIONS: Array<{
  key: keyof AccountSavedCommuteNotificationRule["eventTypes"];
  label: string;
}> = [
  { key: "suspensions", label: "Suspensions" },
  { key: "delays", label: "Delays" },
  { key: "reducedSpeedZones", label: "Reduced Speed Zones" },
  { key: "plannedClosures", label: "Planned Closures" },
  { key: "serviceRestored", label: "Service Restored" },
];

function cloneNotificationRule(rule: AccountSavedCommuteNotificationRule | null | undefined) {
  return normalizeSavedCommuteNotificationRule(rule);
}

function minuteToTimeValue(minute: number | null | undefined) {
  if (minute === null || minute === undefined || minute < 0) return "";
  const safeMinute = Math.max(0, Math.min(1439, minute));
  const hours = Math.floor(safeMinute / 60).toString().padStart(2, "0");
  const minutes = (safeMinute % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function timeValueToMinute(value: string) {
  if (!value) return -1;
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return -1;
  }
  return Math.max(0, Math.min(1439, hours * 60 + minutes));
}

function formatMinuteLabel(minute: number | null | undefined) {
  if (minute === null || minute === undefined || minute < 0) return "";
  const hours24 = Math.floor(minute / 60);
  const minutes = minute % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function formatDayMask(dayMask: number) {
  if (dayMask === 127) return "Any Day";
  if (dayMask === 62) return "Weekdays";
  if (dayMask === 65) return "Weekends";
  const labels = NOTIFICATION_DAY_OPTIONS.filter((day) => (dayMask & day.bit) !== 0).map((day) => day.label);
  return labels.length > 0 ? labels.join(", ") : "No Days";
}

function formatWindow(schedule: AccountSavedCommuteNotificationSchedule) {
  if (schedule.startMinute === null || schedule.endMinute === null) {
    return "All Day";
  }
  if (schedule.startMinute < 0 || schedule.endMinute < 0) {
    return "Custom";
  }
  return `${formatMinuteLabel(schedule.startMinute)}-${formatMinuteLabel(schedule.endMinute)}`;
}

function formatLegSchedule(
  label: string,
  enabled: boolean,
  schedule: AccountSavedCommuteNotificationSchedule,
) {
  return enabled ? `${label}: ${formatDayMask(schedule.dayMask)} · ${formatWindow(schedule)}` : `${label}: Off`;
}

function hasInvalidNotificationSchedule(rule: AccountSavedCommuteNotificationRule) {
  return [rule.outboundSchedule, rule.returnSchedule].some((schedule) => {
    const hasStart = schedule.startMinute !== null;
    const hasEnd = schedule.endMinute !== null;
    return hasStart !== hasEnd
      || (hasStart && hasEnd && (
        schedule.startMinute! < 0
        || schedule.endMinute! < 0
        || schedule.startMinute === schedule.endMinute
      ));
  });
}

function formatEventTypes(rule: AccountSavedCommuteNotificationRule) {
  const labels = NOTIFICATION_EVENT_OPTIONS.filter((eventType) => rule.eventTypes[eventType.key]).map((eventType) => eventType.label);
  if (labels.length === NOTIFICATION_EVENT_OPTIONS.length) return "All Events";
  if (labels.length === 0) return "No Events";
  return labels.join(", ");
}

function ruleForCommute(commute: AccountSavedCommute) {
  return cloneNotificationRule(commute.notificationRule ?? defaultSavedCommuteNotificationRule);
}

function SavedCommuteNotificationRuleEditor({
  rule,
  onChange,
  allowReturnLeg,
}: {
  rule: AccountSavedCommuteNotificationRule;
  onChange: (rule: AccountSavedCommuteNotificationRule) => void;
  allowReturnLeg: boolean;
}) {
  function updateRule(patch: Partial<AccountSavedCommuteNotificationRule>) {
    onChange(normalizeSavedCommuteNotificationRule({
      ...rule,
      ...patch,
      eventTypes: {
        ...rule.eventTypes,
        ...(patch.eventTypes ?? {}),
      },
    }));
  }

  function updateSchedule(
    key: "outboundSchedule" | "returnSchedule",
    patch: Partial<AccountSavedCommuteNotificationSchedule>,
  ) {
    onChange(normalizeSavedCommuteNotificationRule({
      ...rule,
      [key]: {
        ...rule[key],
        ...patch,
      },
    }));
  }

  function renderLegSchedule(
    key: "outboundSchedule" | "returnSchedule",
    label: string,
    enabled: boolean,
    available: boolean,
  ) {
    const schedule = rule[key];
    const controlsEnabled = rule.enabled && enabled && available;
    const morningRush = schedule.dayMask === 62 && schedule.startMinute === 6 * 60 + 30 && schedule.endMinute === 9 * 60 + 30;
    const eveningRush = schedule.dayMask === 62 && schedule.startMinute === 15 * 60 && schedule.endMinute === 19 * 60;
    const allDay = schedule.startMinute === null && schedule.endMinute === null;
    const customWindow = schedule.startMinute !== null && schedule.endMinute !== null;

    const setEnabled = (checked: boolean) => {
      updateRule(key === "outboundSchedule" ? { outboundEnabled: checked } : { returnEnabled: checked });
    };
    const setDay = (bit: number) => {
      const nextMask = (schedule.dayMask & bit) !== 0 ? schedule.dayMask & ~bit : schedule.dayMask | bit;
      updateSchedule(key, { dayMask: nextMask });
    };

    return (
      <div className="saved-commute-notification-block" key={key}>
        <label className="saved-commute-notification-leg-toggle" aria-disabled={!available}>
          <input
            type="checkbox"
            checked={enabled && available}
            disabled={!rule.enabled || !available}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          {label}
        </label>
        <div className="saved-commute-notification-segmented" role="group" aria-label={`${label} notification window`}>
          <button
            type="button"
            aria-pressed={morningRush}
            disabled={!controlsEnabled}
            onClick={() => updateSchedule(key, { dayMask: 62, startMinute: 6 * 60 + 30, endMinute: 9 * 60 + 30 })}
          >
            AM Rush
          </button>
          <button
            type="button"
            aria-pressed={eveningRush}
            disabled={!controlsEnabled}
            onClick={() => updateSchedule(key, { dayMask: 62, startMinute: 15 * 60, endMinute: 19 * 60 })}
          >
            PM Rush
          </button>
          <button
            type="button"
            aria-pressed={allDay}
            disabled={!controlsEnabled}
            onClick={() => updateSchedule(key, { startMinute: null, endMinute: null })}
          >
            All Day
          </button>
          <button
            type="button"
            aria-pressed={customWindow && !morningRush && !eveningRush}
            disabled={!controlsEnabled}
            onClick={() => updateSchedule(key, {
              dayMask: allDay ? 62 : schedule.dayMask,
              startMinute: schedule.startMinute ?? (key === "outboundSchedule" ? 6 * 60 + 30 : 15 * 60),
              endMinute: schedule.endMinute ?? (key === "outboundSchedule" ? 9 * 60 + 30 : 19 * 60),
            })}
          >
            Custom
          </button>
        </div>
        <div className="saved-commute-day-grid" role="group" aria-label={`${label} notification days`}>
          {NOTIFICATION_DAY_OPTIONS.map((day) => (
            <button
              key={day.bit}
              type="button"
              className="saved-commute-day-button"
              aria-pressed={(schedule.dayMask & day.bit) !== 0}
              disabled={!controlsEnabled}
              onClick={() => setDay(day.bit)}
            >
              {day.label}
            </button>
          ))}
        </div>
        {customWindow ? (
          <div className="saved-commute-time-window">
            <label>
              <span>Start</span>
              <input
                type="time"
                value={minuteToTimeValue(schedule.startMinute)}
                disabled={!controlsEnabled}
                onChange={(event) => updateSchedule(key, { startMinute: timeValueToMinute(event.target.value) })}
              />
            </label>
            <label>
              <span>End</span>
              <input
                type="time"
                value={minuteToTimeValue(schedule.endMinute)}
                disabled={!controlsEnabled}
                onChange={(event) => updateSchedule(key, { endMinute: timeValueToMinute(event.target.value) })}
              />
            </label>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="saved-commute-notification-rule flex flex-col gap-3">
      <label className="saved-commute-return-toggle saved-commute-notification-master">
        <div className="saved-commute-switch">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(event) => updateRule({ enabled: event.target.checked })}
          />
          <span className="saved-commute-slider"></span>
        </div>
        <span>Notify Me For This Route</span>
      </label>

      {renderLegSchedule("outboundSchedule", "Outbound Route", rule.outboundEnabled, true)}
      <div className="station-arrival-line-divider" aria-hidden="true" />
      {renderLegSchedule("returnSchedule", "Return Route", rule.returnEnabled, allowReturnLeg)}
      <div className="station-arrival-line-divider" aria-hidden="true" />
      <div className="saved-commute-notification-note">
        <Info size={13} aria-hidden="true" />
        <span>Toronto time (ET). Overnight windows belong to the day they start. Existing impacts notify once when a normal window opens; changing a rule does not send catch-up alerts.</span>
      </div>

      <div className="saved-commute-notification-block">
        <strong>Event Types</strong>
        <div className="saved-commute-notification-checks">
          {NOTIFICATION_EVENT_OPTIONS.map((eventType) => (
            <label key={eventType.key}>
              <input
                type="checkbox"
                checked={rule.eventTypes[eventType.key]}
                disabled={!rule.enabled}
                onChange={(event) => updateRule({
                  eventTypes: {
                    ...rule.eventTypes,
                    [eventType.key]: event.target.checked,
                  },
                })}
              />
              <span>{eventType.label}</span>
            </label>
          ))}
        </div>
      </div>

    </div>
  );
}

export function SavedCommutesPanel({
  onBack,
  onClose,
  accountState,
  accountCommutes,
  setAccountCommutes,
  stationCatalogs,
  networkId,
  viewedCommuteId,
  onViewPath,
  onViewImpactOnPath,
  onClearViewedPath,
  onRequestSignIn,
  onRequestCreateAccount,
  onOpenNotificationSettings,
  notificationSummary,
  activeView: propActiveView,
  onActiveViewChange,
}: Props) {
  const [newLabel, setNewLabel] = useState("");
  const [editingCommuteId, setEditingCommuteId] = useState<string | null>(null);
  const [originStationId, setOriginStationId] = useState("");
  const [destinationStationId, setDestinationStationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(null);
  const [watchReturnTrip, setWatchReturnTrip] = useState(true);
  const [expandedCommuteId, setExpandedCommuteId] = useState<string | null>(null);
  const [deletingCommuteId, setDeletingCommuteId] = useState<string | null>(null);
  const [selectedLegIds, setSelectedLegIds] = useState<Record<string, AccountCommuteLegId>>({});
  const [activePicker, setActivePicker] = useState<"origin" | "destination" | null>(null);
  const [activeViewInternal, setActiveViewInternal] = useState<"create" | "saved">("create");
  const activeView = propActiveView ?? activeViewInternal;
  const setActiveView = (view: "create" | "saved") => {
    setActiveViewInternal(view);
    onActiveViewChange?.(view);
  };
  const [newNotificationRule, setNewNotificationRule] = useState<AccountSavedCommuteNotificationRule>(() => cloneNotificationRule(defaultSavedCommuteNotificationRule));
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [editingNotificationCommuteId, setEditingNotificationCommuteId] = useState<string | null>(null);
  const [notificationDrafts, setNotificationDrafts] = useState<Record<string, AccountSavedCommuteNotificationRule>>({});
  const [savingNotificationRuleId, setSavingNotificationRuleId] = useState<string | null>(null);
  const [notificationRuleError, setNotificationRuleError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [sortBy, setSortBy] = useState<SavedCommuteSort>("impact");
  const [networkFilter, setNetworkFilter] = useState<AccountNetworkFilter>("all");
  const [draftNetworkId, setDraftNetworkId] = useState<NetworkId>(networkId);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const deleteConfirmationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => {
      setSuccessMessage(null);
    }, 3200);
    return () => clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!deletingCommuteId || !window.matchMedia("(max-width: 767px)").matches) return;

    const frame = window.requestAnimationFrame(() => {
      const confirmation = deleteConfirmationRef.current;
      if (!confirmation) return;

      const confirmationRect = confirmation.getBoundingClientRect();
      const scrollContainer = confirmation.closest<HTMLElement>(".commute-grid");
      const scrollRect = scrollContainer?.getBoundingClientRect();
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
      const visibleTop = Math.max(viewportTop, scrollRect?.top ?? viewportTop);
      const visibleBottom = Math.min(viewportBottom, scrollRect?.bottom ?? viewportBottom);
      const revealInset = 12;
      const bottomOverflow = confirmationRect.bottom + revealInset - visibleBottom;
      const topOverflow = visibleTop + revealInset - confirmationRect.top;

      if (bottomOverflow <= 0 && topOverflow <= 0) return;

      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      const top = bottomOverflow > 0 ? bottomOverflow : -topOverflow;
      (scrollContainer ?? window).scrollBy({
        behavior,
        top,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [deletingCommuteId]);

  const stationSummaries = stationCatalogs[draftNetworkId];
  const visibleCommutes = useMemo(
    () => accountCommutes.filter((commute) => networkFilter === "all" || (commute.networkId ?? "ttc") === networkFilter),
    [accountCommutes, networkFilter]
  );

  const { clear: commuteClearCount, affectedNow: commuteAffectedCount } = useMemo(
    () => summarizeSavedCommuteStatuses(visibleCommutes),
    [visibleCommutes]
  );

  const sortedCommutes = useMemo(
    () => sortSavedCommutes(visibleCommutes, sortBy),
    [visibleCommutes, sortBy]
  );

  function stationNameFor(stationId: string, commuteNetworkId: NetworkId) {
    return stationCatalogs[commuteNetworkId].find((station) => station.id === stationId)?.name ?? stationId;
  }

  const resetRouteDraft = () => {
    setNewLabel("");
    setOriginStationId("");
    setDestinationStationId("");
    setWatchReturnTrip(true);
    setEditingCommuteId(null);
    setDraftNetworkId(networkId);
  };

  const startCreatingCommute = () => {
    resetRouteDraft();
    setDraftNetworkId(networkId);
    setCommuteError(null);
    setActiveView("create");
  };

  const handleSaveCommute = async () => {
    if (!originStationId || !destinationStationId) {
      setCommuteError("Choose an origin and destination station.");
      return;
    }
    if (originStationId === destinationStationId) {
      setCommuteError("Choose two different stations.");
      return;
    }
    if (hasInvalidNotificationSchedule(newNotificationRule)) {
      setCommuteError("Choose different start and end times for each custom notification window.");
      return;
    }
    setSaving(true);
    setCommuteError(null);
    try {
      const saved = editingCommuteId
        ? await updateSavedCommute(editingCommuteId, { label: newLabel, originStationId, destinationStationId, watchReturnTrip })
        : await createSavedCommute({
            label: newLabel,
            networkId: draftNetworkId,
            originStationId,
            destinationStationId,
            watchReturnTrip,
            notificationRule: newNotificationRule,
          });
      setAccountCommutes(editingCommuteId
        ? accountCommutes.map((commute) => commute.id === saved.id ? saved : commute)
        : [...accountCommutes, saved]);
      resetRouteDraft();
      setNewNotificationRule(cloneNotificationRule(defaultSavedCommuteNotificationRule));
      setSuccessMessage(editingCommuteId ? "Commute Updated Successfully" : "Commute Saved Successfully");
      setToastKey((prev) => prev + 1);
      setActiveView("saved");
    } catch {
      setCommuteError("Could not save that commute.");
    } finally {
      setSaving(false);
    }
  };

  const startEditingCommute = (commute: AccountSavedCommute) => {
    setEditingCommuteId(commute.id);
    setNewLabel(commute.label);
    setOriginStationId(commute.originStationId);
    setDestinationStationId(commute.destinationStationId);
    setWatchReturnTrip(commute.watchReturnTrip);
    setDraftNetworkId(commute.networkId ?? "ttc");
    setCommuteError(null);
    setActiveView("create");
  };

  const handleDeleteCommute = async (id: string) => {
    try {
      await deleteSavedCommute(id);
      setAccountCommutes(accountCommutes.filter((commute) => commute.id !== id));
      onClearViewedPath(id);
      setExpandedCommuteId((current) => current === id ? null : current);
    } catch {
      setCommuteError("Could not delete that commute.");
    }
  };

  function startEditingNotificationRule(commute: AccountSavedCommute) {
    setNotificationRuleError(null);
    setEditingNotificationCommuteId(commute.id);
    setNotificationDrafts((current) => ({
      ...current,
      [commute.id]: ruleForCommute(commute),
    }));
  }

  function updateNotificationDraft(commuteId: string, rule: AccountSavedCommuteNotificationRule) {
    setNotificationDrafts((current) => ({
      ...current,
      [commuteId]: rule,
    }));
  }

  async function saveNotificationRule(commute: AccountSavedCommute) {
    const draft = notificationDrafts[commute.id] ?? ruleForCommute(commute);
    if (hasInvalidNotificationSchedule(draft)) {
      setNotificationRuleError("Choose different start and end times for each custom notification window.");
      return;
    }
    setSavingNotificationRuleId(commute.id);
    setNotificationRuleError(null);
    try {
      const updated = await updateSavedCommuteNotificationRule(commute.id, draft);
      setAccountCommutes(accountCommutes.map((item) => item.id === updated.id ? updated : item));
      setEditingNotificationCommuteId(null);
      setNotificationDrafts((current) => {
        const next = { ...current };
        delete next[commute.id];
        return next;
      });
    } catch {
      setNotificationRuleError("Could not save route notification rules.");
    } finally {
      setSavingNotificationRuleId(null);
    }
  }

  return (
    <section className="commute-panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-1 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {onBack && (
            <button
              onClick={() => {
                if (activePicker) {
                  setActivePicker(null);
                } else if (activeView === "create") {
                  setActiveView("saved");
                  setCommuteError(null);
                } else {
                  onBack();
                }
              }}
              className="p-1 sm:p-2 -ml-1.5 sm:ml-0 mr-1 sm:mr-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              aria-label="Back"
            >
              <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-2 whitespace-nowrap">
            <Navigation className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-emerald-500 shrink-0" />
            <span>My Commutes</span>
          </h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className={`shrink-0 text-[8px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${
            accountState.authenticated
              ? accountState.user?.demo
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              : "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20"
          }`}>
            {accountState.authenticated
              ? accountState.user?.demo
                ? "Demo Account"
                : "Route Impacts Enabled"
              : "Route Impacts Disabled"}
          </span>
          {onClose && (
            <button
              onClick={() => {
                if (activePicker) {
                  setActivePicker(null);
                } else {
                  onClose();
                }
              }}
              className="p-1 sm:p-2 -mr-1.5 sm:mr-0 ml-1 sm:ml-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
            </button>
          )}
        </div>
      </div>
      <div key={activeView} className="commute-grid min-w-0 px-3 sm:px-4 py-3 flex flex-col gap-3" data-nav-direction={activeView === "create" ? "forward" : "back"}>
        {!accountState.authenticated ? (
          <div className="account-feature-preview saved-commute-account-prompt p-4 rounded-lg flex flex-col gap-4 border border-black/10 dark:border-white/10">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1.5">
                <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M18.9922 8.07411C18.7683 8.30212 18.5423 8.50328 18.3375 8.67188C18.1401 8.50899 17.9227 8.31226 17.7078 8.08774C16.9853 7.333 16.5 6.48786 16.5 5.6875C16.5 4.59138 17.3653 3.75 18.375 3.75C19.3847 3.75 20.25 4.59138 20.25 5.6875C20.25 6.46225 19.7514 7.30076 18.9922 8.07411ZM21.75 5.6875C21.75 8.4375 18.375 10.5 18.375 10.5C18.2063 10.5 15 8.4375 15 5.6875C15 3.78902 16.511 2.25 18.375 2.25C20.239 2.25 21.75 3.78902 21.75 5.6875ZM3.75 9C3.75 10.2426 4.75736 11.25 6 11.25H18C20.0711 11.25 21.75 12.9289 21.75 15C21.75 17.0711 20.0711 18.75 18 18.75H9.75V17.25H18C19.2426 17.25 20.25 16.2426 20.25 15C20.25 13.7574 19.2426 12.75 18 12.75H6C3.92893 12.75 2.25 11.0711 2.25 9C2.25 6.92893 3.92893 5.25 6 5.25L14.25 5.25V6.75L6 6.75C4.75736 6.75 3.75 7.75736 3.75 9ZM6.24215 19.3241C6.01829 19.5521 5.79234 19.7533 5.58752 19.9219C5.39011 19.759 5.1727 19.5623 4.95777 19.3377C4.23528 18.583 3.75 17.7379 3.75 16.9375C3.75 15.8414 4.61529 15 5.625 15C6.63471 15 7.5 15.8414 7.5 16.9375C7.5 17.7123 7.00145 18.5508 6.24215 19.3241ZM9 16.9375C9 19.6875 5.625 21.75 5.625 21.75C5.45625 21.75 2.25 19.6875 2.25 16.9375C2.25 15.039 3.76104 13.5 5.625 13.5C7.48896 13.5 9 15.039 9 16.9375ZM6.75 16.875C6.75 17.4963 6.24632 18 5.625 18C5.00368 18 4.5 17.4963 4.5 16.875C4.5 16.2537 5.00368 15.75 5.625 15.75C6.24632 15.75 6.75 16.2537 6.75 16.875ZM18.375 6.75C18.9963 6.75 19.5 6.24632 19.5 5.625C19.5 5.00368 18.9963 4.5 18.375 4.5C17.7537 4.5 17.25 5.00368 17.25 5.625C17.25 6.24632 17.7537 6.75 18.375 6.75Z"
                    fill="currentColor"
                  />
                </svg>
                Track Your Daily Commute
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Unlock personalized tracking and route impact checks for your daily {networkId === "regional" ? "GO and UP" : "subway and LRT"} routes.
              </p>
            </div>

            <div className="space-y-3 my-1 border-t border-b border-black/5 dark:border-white/5 py-3">
              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Personalized Route Pathing</span>
                  <span className="text-slate-500 dark:text-slate-400">Save custom origin-destination pairs on the selected LineWatchTO rail network.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Direction-Aware Impact Matching</span>
                  <span className="text-slate-500 dark:text-slate-400">See fresh dashboard-visible disruptions that match the stations, segments, or corridors on your route.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Return Leg Monitoring</span>
                  <span className="text-slate-500 dark:text-slate-400">Easily toggle and monitor your reverse return leg in the same view.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Route Impact Alerts</span>
                  <span className="text-slate-500 dark:text-slate-400">Receive route impact alerts when notifications are enabled and the selected network source is fresh.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Free</span>
                </div>
              </div>
            </div>

            <div className="account-action-row mt-1">
              <button type="button" onClick={onRequestSignIn}>Sign In</button>
              <button type="button" onClick={onRequestCreateAccount} className="saved-commute-signup-btn">Create Account</button>
            </div>
          </div>
        ) : null}

        {accountState.authenticated ? (
          <>
            {activeView === "create" ? (
              <div className="saved-commute-form">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{editingCommuteId ? "Edit Route" : "Create a Route"}</h3>
                {!editingCommuteId ? (
                  <div className="account-network-filter" data-network={draftNetworkId} data-options-count={2} role="group" aria-label="Choose commute network">
                    <div className="account-network-glider" aria-hidden="true" />
                    {ACCOUNT_NETWORK_OPTIONS.slice(1).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        data-network={option.value}
                        aria-pressed={draftNetworkId === option.value}
                        onClick={() => {
                          setDraftNetworkId(option.value as NetworkId);
                          setOriginStationId("");
                          setDestinationStationId("");
                          setActivePicker(null);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Enter a Commute Label (e.g. Work)" aria-label="Commute label" />
                <div className="saved-commute-station-grid">
                  <SavedCommuteStationPicker
                    label="Origin"
                    placeholder="Origin Station"
                    value={originStationId}
                    stations={stationSummaries}
                    blockedStationId={destinationStationId || undefined}
                    blockedLabel="Already selected as destination"
                    onChange={setOriginStationId}
                    isOpen={activePicker === "origin"}
                    onOpenChange={(open) => setActivePicker(open ? "origin" : null)}
                  />
                  <SavedCommuteStationPicker
                    label="Destination"
                    placeholder="Destination Station"
                    value={destinationStationId}
                    stations={stationSummaries}
                    blockedStationId={originStationId || undefined}
                    blockedLabel="Already selected as origin"
                    onChange={setDestinationStationId}
                    isOpen={activePicker === "destination"}
                    onOpenChange={(open) => setActivePicker(open ? "destination" : null)}
                  />
                </div>
                <label className="saved-commute-return-toggle">
                  <div className="saved-commute-switch">
                    <input
                      type="checkbox"
                      checked={watchReturnTrip}
                      onChange={(event) => setWatchReturnTrip(event.target.checked)}
                    />
                    <span className="saved-commute-slider"></span>
                  </div>
                  <span>Track Return Route</span>
                </label>
                {!editingCommuteId ? <button
                    type="button"
                    className="saved-commute-customize-toggle"
                    aria-expanded={showNotificationSettings}
                    onClick={() => setShowNotificationSettings(!showNotificationSettings)}
                  >
                    <span>Customize Commute Notifications</span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showNotificationSettings ? "rotate-180" : ""}`} />
                  </button> : null}

                {draftNetworkId === "regional" ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Travel times are low-confidence planning estimates. Notification matching uses only fresh dashboard-visible Metrolinx corridor, segment, and station impacts.
                  </p>
                ) : null}

                {!editingCommuteId && showNotificationSettings ? (
                  <div>
                    <SavedCommuteNotificationRuleEditor
                      rule={newNotificationRule}
                      onChange={setNewNotificationRule}
                      allowReturnLeg={watchReturnTrip}
                    />
                  </div>
                ) : null}

                <div className="flex gap-2.5 mt-2">
                  <button
                    type="button"
                    className="saved-commute-cancel-button flex-1"
                    onClick={() => {
                      resetRouteDraft();
                      setActiveView("saved");
                      setCommuteError(null);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="saved-commute-primary-button flex-1"
                    onClick={handleSaveCommute}
                    disabled={saving}
                    aria-busy={saving}
                  >
                    {saving ? (
                      <>
                        <Loader2 size={15} className="saved-commute-loading-icon" aria-hidden="true" />
                        Plotting route
                      </>
                    ) : (
                      editingCommuteId ? "Save changes" : "Save commute"
                    )}
                  </button>
                </div>
                {commuteError ? <p className="text-xs font-semibold text-red-600 dark:text-red-300">{commuteError}</p> : null}

                <SavedCommuteNotificationSummary
                    onOpenNotificationSettings={onOpenNotificationSettings}
                    notificationSummary={notificationSummary}
                  />
              </div>
            ) : (
              <div className={`flex flex-col gap-3 ${onBack ? "px-[6px] sm:px-[20px]" : ""}`}>
                <div className="account-network-filter" data-network={networkFilter} data-options-count={ACCOUNT_NETWORK_OPTIONS.length} role="group" aria-label="Filter My Commutes by network">
                  <div className="account-network-glider" aria-hidden="true" />
                  {ACCOUNT_NETWORK_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      data-network={option.value}
                      aria-pressed={networkFilter === option.value}
                      onClick={() => setNetworkFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="saved-commute-list-toolbar flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-1">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-bold text-slate-800 dark:text-slate-100">Your Routes</span>
                      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">({visibleCommutes.length})</span>
                    </div>
                    {visibleCommutes.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-0.5" data-testid="commute-status-badges">
                        {commuteAffectedCount > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-[10px] font-bold text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            {commuteAffectedCount} Affected
                          </span>
                        )}
                        {commuteClearCount > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {commuteClearCount} Clear
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {visibleCommutes.length > 0 ? (
                    <div className="saved-commute-list-actions flex items-end gap-2 sm:shrink-0">
                      <div className="saved-commute-sort-control" ref={sortDropdownRef}>
                        <span>Sort by</span>
                        <select
                          value={sortBy}
                          onChange={(event) => setSortBy(event.target.value as SavedCommuteSort)}
                          aria-label="Sort My Commutes"
                          className="sr-only"
                          tabIndex={-1}
                        >
                          <option value="impact">Most Affected</option>
                          <option value="recent">Recently Saved</option>
                          <option value="oldest">Oldest Saved</option>
                          <option value="name">Route Name A–Z</option>
                        </select>
                        <button
                          type="button"
                          className="site-dropdown-trigger saved-commute-sort-trigger"
                          aria-label="Sort My Commutes"
                          aria-haspopup="listbox"
                          aria-expanded={sortDropdownOpen}
                          onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                        >
                          <span className="truncate">
                            {sortBy === "impact" && "Most Affected"}
                            {sortBy === "recent" && "Recently Saved"}
                            {sortBy === "oldest" && "Oldest Saved"}
                            {sortBy === "name" && "Route Name A–Z"}
                          </span>
                          <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 shrink-0" style={{ transform: sortDropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                        </button>
                        {sortDropdownOpen && (
                          <div className="site-dropdown-menu saved-commute-sort-options" role="listbox">
                            {(
                              [
                                { value: "impact", label: "Most Affected" },
                                { value: "recent", label: "Recently Saved" },
                                { value: "oldest", label: "Oldest Saved" },
                                { value: "name", label: "Route Name A–Z" },
                              ] as const
                            ).map((option) => {
                              const isSelected = option.value === sortBy;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  role="option"
                                  aria-selected={isSelected}
                                  className={`site-dropdown-option saved-commute-sort-option${isSelected ? " selected" : ""}`}
                                  onClick={() => {
                                    setSortBy(option.value);
                                    setSortDropdownOpen(false);
                                  }}
                                >
                                  <span>{option.label}</span>
                                  {isSelected && <Check size={12} className="text-emerald-500 dark:text-emerald-400 shrink-0 ml-2" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="saved-commute-add-btn flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer shrink-0"
                        onClick={startCreatingCommute}
                      >
                        + Add Route
                      </button>
                    </div>
                  ) : null}
                </div>

                {visibleCommutes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center pt-3 pb-10 sm:py-10 text-center">
                    <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 mb-4">
                      {accountCommutes.length === 0 ? "No Commutes Yet" : "No Commutes Match This Network"}
                    </p>
                    <button
                      type="button"
                      className="saved-commute-add-btn flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer"
                      onClick={startCreatingCommute}
                    >
                      + Add Route
                    </button>
                  </div>
                ) : (
              sortedCommutes.map((commute) => {
                const legs = commuteLegs(commute);
                const selectedLegId = selectedLegIds[commute.id] ?? "outbound";
                const selectedLeg = legs.find((leg) => leg.id === selectedLegId) ?? legs[0];
                const stopsExpanded = expandedCommuteId === commute.id;
                const routeStops = selectedLeg.path.stationIds;
                const canViewPath = selectedLeg.path.status === "available" && selectedLeg.path.segmentIds.length > 0;
                const selectedPreview = commutePathPreviewFromCommute(commute, selectedLeg.id);
                const viewingPath = Boolean(selectedPreview && viewedCommuteId === selectedPreview.id);
                const routeLabel = commute.watchReturnTrip
                  ? `${commute.originStationName} <-> ${commute.destinationStationName}`
                  : commute.routeLabel;
                const notificationRule = ruleForCommute(commute);
                const notificationDraft = notificationDrafts[commute.id] ?? notificationRule;
                const editingNotificationRule = editingNotificationCommuteId === commute.id;
                const notificationRuleStatus = notificationRule.enabled ? "On" : "Off";
                const selectedTravelTimeEstimate = selectedLeg.impact.travelTimeEstimate ?? fallbackTravelTimeEstimate(selectedLeg);
                const selectedTravelTimeSeverity = travelTimeSeverity(selectedTravelTimeEstimate);
                const travelTimeHeadline = formatTravelTimeHeadline(selectedTravelTimeEstimate);
                const selectedLegClearByFilters = legIsClearByFilters(selectedLeg);
                const selectedLegImpactSummary = summarizeMatchedImpacts(selectedLeg.impact.matchedImpacts);

                return (
                  <div key={commute.id} className={`commute-card ${commuteTone(commute)} min-w-0 rounded-lg border border-black/10 !bg-slate-50 p-3 dark:border-white/10 dark:!bg-[#12151c]`}>
                    <div className="min-w-0">
                      <div className="saved-commute-card-header">
                        <div className="saved-commute-card-identity">
                          <h3 className="min-w-0 text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">
                            {toTitleCase(commute.label.replace(/\bto\b/g, "->"))}
                          </h3>
                          <AccountNetworkBadge networkId={commute.networkId ?? "ttc"} />
                          <span className={`status-pill ${commuteTone(commute)}`}>{toTitleCase(commuteStatusLabel(commute))}</span>
                        </div>
                        {(() => {
                          const currentImpactsCount = currentImpactCount(legs);
                          const ignoredImpactsCount = ignoredCurrentImpactCount(legs);
                          const hasCurrentImpacts = currentImpactsCount > 0;
                          const impactBgColor = hasCurrentImpacts
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                            : ignoredImpactsCount > 0
                              ? "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60";
                          const impactText = hasCurrentImpacts
                            ? `${currentImpactsCount} Impact${currentImpactsCount === 1 ? "" : "s"}`
                            : ignoredImpactsCount > 0
                              ? `${ignoredImpactsCount} Ignored`
                              : "No Impacts";
                          return (
                            <div className={`saved-commute-current-impact-badge rounded-full font-bold uppercase tracking-wider shrink-0 ${impactBgColor}`}>
                              {hasCurrentImpacts || ignoredImpactsCount > 0 ? (
                                <ExclaimAlertIcon className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />
                              )}
                              <span>{impactText}</span>
                            </div>
                          );
                        })()}
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{routeLabel}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-semibold">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">Origin:</span>
                          <span className="text-slate-800 dark:text-white">{commute.originStationName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">Destination:</span>
                          <span className="text-slate-800 dark:text-white">{commute.destinationStationName}</span>
                        </div>
                      </div>

                      {legs.length > 1 ? (
                        <div className="commute-leg-toggle" role="tablist" aria-label={`Route direction for ${commute.label}`}>
                          {legs.map((leg) => {
                            const isClear = leg.impact.severity === "clear";
                            const isClearByFilters = legIsClearByFilters(leg);
                            return (
                              <button
                                key={leg.id}
                                type="button"
                                role="tab"
                                aria-selected={selectedLeg.id === leg.id}
                                className={isClearByFilters ? "leg-btn-filtered" : isClear ? "leg-btn-clear" : "leg-btn-affected"}
                                onClick={() => setSelectedLegIds((current) => ({ ...current, [commute.id]: leg.id }))}
                              >
                                To {leg.toStationName}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="saved-commute-time-estimate-heading mt-3 justify-center">
                        <strong
                          className={`!text-[0.88rem] inline-block pb-1.5 border-b-2 ${
                            selectedLegClearByFilters
                              ? "text-slate-500 dark:text-slate-400 border-slate-400/30"
                              : selectedLeg.impact.severity === "clear"
                              ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-400/30"
                              : "text-amber-600 dark:text-amber-400 border-amber-500/30 dark:border-amber-400/30"
                          }`}
                          style={{
                            color: selectedLegClearByFilters
                              ? "var(--quiet)"
                              : selectedLeg.impact.severity === "clear"
                                ? "var(--ok)"
                                : "var(--warning)",
                          }}
                        >
                          {toTitleCase(selectedLeg.impact.statusLabel)}
                        </strong>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 mt-2 text-sm sm:text-base text-slate-800 dark:text-white font-bold">
                        <div className="flex items-center gap-2">
                          <NumStationsIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-slate-800 dark:text-white shrink-0" />
                          <span>
                            {toTitleCase(`${selectedLeg.path.stationIds.length} Station${selectedLeg.path.stationIds.length === 1 ? "" : "s"}`)}
                          </span>
                        </div>
                        <div className="flex items-center justify-center gap-2 text-center">
                          <Clock className={`saved-commute-time-headline-clock severity-${selectedTravelTimeSeverity} w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0`} />
                          <span>{travelTimeHeadline.value}</span>
                        </div>
                      </div>

                      <div
                        className={`mt-1 text-center text-[11px] font-bold tracking-wide ${
                          selectedTravelTimeEstimate.status === "standard"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : selectedTravelTimeEstimate.status === "estimated"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {travelTimeHeadline.context}
                      </div>

                      <div className="mt-1 mb-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {commute.networkId === "regional" ? "Topology Planning Estimate" : "Default Scheduled Route"} · To {selectedLeg.toStationName}
                      </div>

                      <TravelTimeEstimateBlock leg={selectedLeg} />

                      {selectedLeg.impact.matchedImpacts.length > 0 ? (
                        <details className="saved-commute-impact-disclosure">
                          <summary className="saved-commute-impact-summary">
                            <span className="saved-commute-impact-summary-heading">
                              <ExclaimAlertIcon className="saved-commute-impact-summary-icon" />
                              <strong>Active Commute Disruptions</strong>
                              <span className="saved-commute-impact-total">
                                {selectedLeg.impact.matchedImpacts.length}
                              </span>
                            </span>
                            <span className="saved-commute-impact-summary-chips">
                              {selectedLegImpactSummary.map(({ key, kind, activeClosure, count }) => (
                                <span
                                  key={key}
                                  className={`saved-commute-impact-summary-chip kind-${activeClosure ? "suspension" : kind}`}
                                >
                                  <ImpactIcon kind={kind} activeClosure={activeClosure} className="shrink-0" />
                                  {activeClosure
                                    ? `${count} Active Closure${count === 1 ? "" : "s"}`
                                    : impactKindCountLabel(kind, count)}
                                </span>
                              ))}
                            </span>
                            <span className="saved-commute-impact-summary-action">
                              <span className="saved-commute-impact-summary-action-collapsed">List View</span>
                              <span className="saved-commute-impact-summary-action-expanded">Hide List</span>
                              <ChevronDown className="saved-commute-impact-summary-chevron" size={16} aria-hidden="true" />
                            </span>
                          </summary>
                          <ul className="saved-commute-impact-list">
                            {selectedLeg.impact.matchedImpacts.map((impact) => (
                              <li
                                key={`${impact.kind}-${impact.id}`}
                                className={impact.ignoredByRule ? "saved-commute-impact-ignored" : undefined}
                              >
                                <span className="saved-commute-impact-icon" aria-hidden="true">
                                  <ImpactIcon kind={impact.kind} activeClosure={impact.kind === "planned-closure" && impact.status === "current"} className="shrink-0" />
                                </span>
                                <div className="saved-commute-impact-copy">
                                  <div className="saved-commute-impact-details">
                                    <div className="saved-commute-impact-heading">
                                      <strong className="text-slate-800 dark:text-slate-200">
                                        <span className="saved-commute-impact-kind-label">
                                          {toTitleCase(impactKindLabel(impact.kind, impact.kind === "planned-closure" && impact.status === "current"))}
                                        </span>
                                        {impact.ignoredByRule ? (
                                          <em className="saved-commute-impact-filter-note">
                                            (Ignored by Route Filter)
                                          </em>
                                        ) : null}
                                      </strong>
                                    </div>
                                    <span className="text-slate-600 dark:text-slate-400">
                                      {toTitleCase(impactLineLabel(impact))}{impact.location ? `: ${toTitleCase(impact.location)}` : ""}{impact.displayDirection ? ` (${toTitleCase(impact.displayDirection)})` : ""}
                                    </span>
                                  </div>
                                  <div className="saved-commute-impact-action">
                                    <button
                                      type="button"
                                      className="saved-commute-map-action saved-commute-impact-map-button"
                                      onClick={() => onViewImpactOnPath(commute, selectedLeg.id, impact)}
                                      aria-label={`View ${impactKindLabel(impact.kind, impact.kind === "planned-closure" && impact.status === "current")} on the map for ${commute.label}`}
                                    >
                                      <MapPinned size={12} aria-hidden="true" />
                                      View on Map
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}

                      {selectedLeg.impact.matchedImpacts.length === 0 ? (
                        <hr className="border-slate-800/10 dark:border-slate-200/10 mt-5 mb-1.5 mx-1" />
                      ) : null}
                      <div className="saved-commute-rule-summary">
                        <div>
                          <strong>Route Notifications: {notificationRuleStatus}</strong>
                          <ul className="list-disc list-outside pl-3 mt-1 space-y-0.5 text-[0.66rem] font-medium text-slate-600 dark:text-slate-400">
                            {notificationRule.enabled ? (
                              <>
                                <li>{formatLegSchedule("Outbound", notificationRule.outboundEnabled, notificationRule.outboundSchedule)}</li>
                                {commute.watchReturnTrip ? (
                                  <li>{formatLegSchedule("Return", notificationRule.returnEnabled, notificationRule.returnSchedule)}</li>
                                ) : null}
                                <li>{formatEventTypes(notificationRule)}</li>
                              </>
                            ) : (
                              <li>Notifications are disabled for this commute.</li>
                            )}
                          </ul>
                        </div>
                        <button
                          type="button"
                          onClick={() => editingNotificationRule ? setEditingNotificationCommuteId(null) : startEditingNotificationRule(commute)}
                          aria-expanded={editingNotificationRule}
                        >
                          {editingNotificationRule ? "Close" : "Edit Alerts"}
                        </button>
                      </div>

                      {editingNotificationRule ? (
                        <div className="saved-commute-rule-editor">
                          <SavedCommuteNotificationRuleEditor
                            rule={notificationDraft}
                            onChange={(rule) => updateNotificationDraft(commute.id, rule)}
                            allowReturnLeg={commute.watchReturnTrip}
                          />
                          {notificationRuleError ? <p className="text-xs font-semibold text-red-600 dark:text-red-300">{notificationRuleError}</p> : null}
                          <div className="saved-commute-rule-actions">
                            <button
                              type="button"
                              onClick={() => saveNotificationRule(commute)}
                              disabled={savingNotificationRuleId === commute.id}
                              aria-busy={savingNotificationRuleId === commute.id}
                            >
                              {savingNotificationRuleId === commute.id ? "Saving" : "Save Alerts"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNotificationCommuteId(null);
                                setNotificationRuleError(null);
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div className="commute-route-actions">
                        <button
                          type="button"
                          className="commute-route-stop-toggle"
                          onClick={() => startEditingCommute(commute)}
                          aria-label={`Edit commute ${commute.label}`}
                        >
                          <Pencil size={13} aria-hidden="true" />
                          Edit route
                        </button>
                        <button
                          type="button"
                          className="commute-route-stop-toggle"
                          onClick={() => setExpandedCommuteId((current) => current === commute.id ? null : commute.id)}
                          aria-expanded={stopsExpanded}
                          aria-controls={`commute-stops-${commute.id}`}
                          disabled={routeStops.length === 0}
                        >
                          <ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-200 ${stopsExpanded ? "rotate-180" : ""}`} />
                          {stopsExpanded ? "Hide stops" : `View ${routeStops.length} stops`}
                        </button>
                        <button
                          type="button"
                          className="saved-commute-map-action commute-route-map-button"
                          onClick={() => onViewPath(commute, selectedLeg.id)}
                          disabled={!canViewPath}
                          aria-pressed={viewingPath}
                        >
                          <MapPinned size={14} aria-hidden="true" />
                          {viewingPath ? "Viewing path" : "View path on map"}
                        </button>
                        {deletingCommuteId === commute.id ? (
                          <div ref={deleteConfirmationRef} className="commute-route-delete-confirmation">
                            <span className="commute-route-delete-confirmation-prompt text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mr-1">Are you sure?</span>
                            <button
                              type="button"
                              className="commute-route-delete-confirm-button"
                              onClick={() => {
                                handleDeleteCommute(commute.id);
                                setDeletingCommuteId(null);
                              }}
                              aria-label={`Confirm delete commute ${commute.label}`}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              className="commute-route-delete-cancel-button"
                              onClick={() => setDeletingCommuteId(null)}
                              aria-label={`Cancel delete commute ${commute.label}`}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="commute-route-delete-button"
                            onClick={() => setDeletingCommuteId(commute.id)}
                            aria-label={`Delete commute ${commute.label}`}
                            title="Delete commute"
                          >
                            <Trash2 size={22} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {stopsExpanded ? (
                        <ol id={`commute-stops-${commute.id}`} className="commute-route-stop-list" aria-label={`Stops for ${commute.label}`}>
                          {routeStops.map((stationId, index) => (
                            <li key={`${commute.id}-${stationId}-${index}`}>
                              <span className="commute-route-stop-index">{index + 1}</span>
                              <span>{stationNameFor(stationId, commute.networkId ?? "ttc")}</span>
                              {selectedLeg.path.transferStationIds.includes(stationId) ? (
                                <strong>Transfer</strong>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </>
    ) : null}
      </div>
      {successMessage && (
        <div key={toastKey} className="commute-toast-success text-white">
          <Check size={16} className="text-white" />
          <span className="text-white">{successMessage}</span>
        </div>
      )}
    </section>
  );
}
