"use client";

import { useEffect, useMemo, useState } from "react";
import { Navigation, ChevronDown, ChevronLeft, Loader2, MapPinned, X, AlertTriangle, Construction, Calendar, Clock, Bell, Check, Pin } from "lucide-react";
import {
  createSavedCommute,
  defaultSavedCommuteNotificationRule,
  deleteSavedCommute,
  commuteLegsForCommute,
  commutePathPreviewFromCommute,
  normalizeSavedCommuteNotificationRule,
  updateSavedCommuteNotificationRule,
  summarizeSavedCommuteStatuses,
  sortSavedCommutes,
  updateSavedCommutePin,
  type SavedCommuteSort,
  type AccountSavedCommute,
  type AccountSavedCommuteNotificationRule,
  type AccountState,
  type AccountMatchedImpact,
  type AccountCommuteLeg,
  type AccountCommuteLegId,
  type AccountCommuteImpact,
  type AccountCommuteTravelTimeEstimate,
} from "../app/account-data";
import type { StationSummary } from "../app/station-data";
import { SavedCommuteStationPicker } from "./SavedCommuteStationPicker";
import { DelayIcon } from "./DelayIcon";
import { CardSource } from "./ImpactCardFields";

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
  stationSummaries: StationSummary[];
  viewedCommuteId?: string | null;
  onViewPath: (commute: AccountSavedCommute, legId?: AccountCommuteLegId) => void;
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
  switch (commuteWorstSeverity(commute)) {
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
    return legs[0].impact.statusLabel;
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
  return "Clear both ways";
}

function currentImpactCount(legs: AccountCommuteLeg[]) {
  return legs.flatMap((leg) => leg.impact.matchedImpacts).filter((impact) => impact.status === "current" && !impact.ignoredByRule).length;
}

function ImpactIcon({ kind, className }: { kind: AccountMatchedImpact["kind"]; className?: string }) {
  switch (kind) {
    case "reduced-speed-zone":
      return <Construction className={`rsz-tone ${className || ""}`} size={14} />;
    case "planned-closure":
      return <Calendar className={`text-blue-500 dark:text-blue-400 ${className || ""}`} size={14} />;
    case "suspension":
      return <AlertTriangle className={`text-red-500 dark:text-red-400 ${className || ""}`} size={14} />;
    case "delay":
    default:
      return <DelayIcon className={`delay-tone ${className || ""}`} size={14} filled={false} />;
  }
}

function impactKindLabel(kind: AccountMatchedImpact["kind"]) {
  switch (kind) {
    case "reduced-speed-zone":
      return "Reduced Speed Zone";
    case "planned-closure":
      return "Planned Closure";
    case "suspension":
      return "Suspension";
    case "delay":
    default:
      return "Delay";
  }
}

function impactLineLabel(impact: AccountMatchedImpact) {
  return impact.lineNumber ? `Line ${impact.lineNumber}` : "Station";
}

function minutesFromSeconds(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds / 60));
}

function formatEstimateMinutes(seconds: number | null | undefined) {
  const minutes = minutesFromSeconds(seconds);
  return minutes === 0 ? "Unavailable" : `${minutes} min`;
}

function formatEstimateRange(lowSeconds: number | null | undefined, highSeconds: number | null | undefined) {
  const low = minutesFromSeconds(lowSeconds);
  const high = minutesFromSeconds(highSeconds);
  if (low === 0 && high === 0) return "Unavailable";
  if (low === high || high === 0) return `${low} min`;
  return `${low}-${high} min`;
}

function formatExtraTimeRange(lowSeconds: number | null | undefined, highSeconds: number | null | undefined) {
  const low = minutesFromSeconds(lowSeconds);
  const high = minutesFromSeconds(highSeconds);
  if (low === 0 && high === 0) return "+0 min";
  if (low === high || high === 0) return `+${low} min`;
  return `+${low}-${high} min`;
}

function confidenceLabel(confidence: AccountCommuteTravelTimeEstimate["confidence"]) {
  switch (confidence) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "none":
      return "None";
    default:
      return toTitleCase(confidence || "Unknown");
  }
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
    summary: `Typical commute: about ${formatEstimateMinutes(leg.path.estimatedTravelSeconds)}. No extra time estimated.`,
  };
}

function TravelTimeEstimateBlock({ leg }: { leg: AccountCommuteLeg }) {
  const estimate = leg.impact.travelTimeEstimate ?? fallbackTravelTimeEstimate(leg);

  if (estimate.status === "estimated") {
    return (
      <div className="saved-commute-time-estimate estimated" aria-label={`Travel time estimate to ${leg.toStationName}`}>
        <div className="saved-commute-time-estimate-heading">
          <Clock size={13} aria-hidden="true" />
          <strong>Travel Time</strong>
        </div>
        <div className="saved-commute-time-estimate-grid">
          <span>
            <strong>Typical</strong>
            <em>{formatEstimateMinutes(estimate.baselineSeconds)}</em>
          </span>
          <span>
            <strong>With Impacts</strong>
            <em>{formatEstimateRange(estimate.estimatedLowSeconds, estimate.estimatedHighSeconds)}</em>
          </span>
          <span>
            <strong>Extra Time</strong>
            <em>{formatExtraTimeRange(estimate.extraLowSeconds, estimate.extraHighSeconds)}</em>
          </span>
          <span>
            <strong>Confidence</strong>
            <em>{confidenceLabel(estimate.confidence)}</em>
          </span>
        </div>
      </div>
    );
  }

  if (estimate.status === "standard") {
    return (
      <div className="saved-commute-time-estimate standard" aria-label={`Travel time estimate to ${leg.toStationName}`}>
        <div className="saved-commute-time-estimate-heading">
          <Clock size={13} aria-hidden="true" />
          <strong>Travel Time</strong>
        </div>
        <div className="saved-commute-time-estimate-grid">
          <span>
            <strong>Typical</strong>
            <em>{formatEstimateMinutes(estimate.baselineSeconds)}</em>
          </span>
          <span>
            <strong>With Impacts</strong>
            <em>No extra time</em>
          </span>
          <span>
            <strong>Extra Time</strong>
            <em>{formatExtraTimeRange(estimate.extraLowSeconds, estimate.extraHighSeconds)}</em>
          </span>
          <span>
            <strong>Confidence</strong>
            <em>{confidenceLabel(estimate.confidence)}</em>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`saved-commute-time-estimate ${estimate.status}`} aria-label={`Travel time estimate to ${leg.toStationName}`}>
      <div className="saved-commute-time-estimate-heading">
        <Clock size={13} aria-hidden="true" />
        <strong>Travel Time</strong>
      </div>
      <p>
        <strong>Typical {formatEstimateMinutes(estimate.baselineSeconds)}</strong>
        <em>{estimate.summary || "Major disruption on this route; travel time is not reliable."}</em>
        <span>Confidence: {confidenceLabel(estimate.confidence)}</span>
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
    detail: "Saved commute alerts and closure reminders",
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

function formatWindow(rule: AccountSavedCommuteNotificationRule) {
  if (rule.startMinute === null || rule.endMinute === null) {
    return "All Day";
  }
  if (rule.startMinute < 0 || rule.endMinute < 0) {
    return "Custom";
  }
  return `${formatMinuteLabel(rule.startMinute)}-${formatMinuteLabel(rule.endMinute)}`;
}

function formatSection(rule: AccountSavedCommuteNotificationRule, stationNameFor: (stationId: string) => string) {
  if (!rule.sectionStartStationId || !rule.sectionEndStationId) {
    return "Whole Route";
  }
  return `${stationNameFor(rule.sectionStartStationId)} to ${stationNameFor(rule.sectionEndStationId)}`;
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
  routeStationIds,
  stationNameFor,
  allowReturnLeg,
  showSectionControls,
}: {
  rule: AccountSavedCommuteNotificationRule;
  onChange: (rule: AccountSavedCommuteNotificationRule) => void;
  routeStationIds: string[];
  stationNameFor: (stationId: string) => string;
  allowReturnLeg: boolean;
  showSectionControls: boolean;
}) {
  const customWindow = rule.startMinute !== null && rule.endMinute !== null;
  const canSelectSection = showSectionControls && routeStationIds.length >= 2;
  const selectedSection = Boolean(rule.sectionStartStationId && rule.sectionEndStationId);

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

  function setDay(bit: number) {
    const nextMask = (rule.dayMask & bit) !== 0 ? rule.dayMask & ~bit : rule.dayMask | bit;
    updateRule({ dayMask: nextMask });
  }

  function setCustomWindow(enabled: boolean) {
    updateRule(enabled
      ? {
          startMinute: rule.startMinute ?? -1,
          endMinute: rule.endMinute ?? -1,
        }
      : {
          startMinute: null,
          endMinute: null,
        }
    );
  }

  function setSelectedSection(enabled: boolean) {
    if (!enabled || routeStationIds.length < 2) {
      updateRule({ sectionStartStationId: null, sectionEndStationId: null });
      return;
    }
    updateRule({
      sectionStartStationId: rule.sectionStartStationId ?? routeStationIds[0],
      sectionEndStationId: rule.sectionEndStationId ?? routeStationIds[routeStationIds.length - 1],
    });
  }

  return (
    <div className="saved-commute-notification-rule flex flex-col gap-3">

      <div className="saved-commute-notification-block">
        <strong>Notification Days</strong>
        <div className="saved-commute-day-grid" role="group" aria-label="Notification Days">
          {NOTIFICATION_DAY_OPTIONS.map((day) => (
            <button
              key={day.bit}
              type="button"
              className="saved-commute-day-button"
              aria-pressed={(rule.dayMask & day.bit) !== 0}
              disabled={!rule.enabled}
              onClick={() => setDay(day.bit)}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      <div className="saved-commute-notification-block">
        <strong>Notification Window</strong>
        <div className="saved-commute-notification-segmented" role="group" aria-label="Notification Window">
          <button type="button" aria-pressed={!customWindow} disabled={!rule.enabled} onClick={() => setCustomWindow(false)}>
            All Day
          </button>
          <button type="button" aria-pressed={customWindow} disabled={!rule.enabled} onClick={() => setCustomWindow(true)}>
            Custom
          </button>
        </div>
        {customWindow ? (
          <div className="saved-commute-time-window">
            <label>
              <span>Start</span>
              <input
                type="time"
                value={minuteToTimeValue(rule.startMinute)}
                disabled={!rule.enabled}
                onChange={(event) => updateRule({ startMinute: timeValueToMinute(event.target.value) })}
              />
            </label>
            <label>
              <span>End</span>
              <input
                type="time"
                value={minuteToTimeValue(rule.endMinute)}
                disabled={!rule.enabled}
                onChange={(event) => updateRule({ endMinute: timeValueToMinute(event.target.value) })}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="saved-commute-notification-block">
        <strong>Direction</strong>
        <div className="saved-commute-notification-checks">
          <label>
            <input
              type="checkbox"
              checked={rule.outboundEnabled}
              disabled={!rule.enabled}
              onChange={(event) => updateRule({ outboundEnabled: event.target.checked })}
            />
            <span>Outbound Route</span>
          </label>
          <label aria-disabled={!allowReturnLeg}>
            <input
              type="checkbox"
              checked={rule.returnEnabled && allowReturnLeg}
              disabled={!rule.enabled || !allowReturnLeg}
              onChange={(event) => updateRule({ returnEnabled: event.target.checked })}
            />
            <span>Return Route</span>
          </label>
        </div>
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

      <div className="saved-commute-notification-block">
        <strong>Route Section</strong>
        <div className="saved-commute-notification-segmented" role="group" aria-label="Route Section">
          <button type="button" aria-pressed={!selectedSection} disabled={!rule.enabled} onClick={() => setSelectedSection(false)}>
            Whole Route
          </button>
          <button type="button" aria-pressed={selectedSection} disabled={!rule.enabled || !canSelectSection} onClick={() => setSelectedSection(true)}>
            Selected Section
          </button>
        </div>
        {selectedSection && canSelectSection ? (
          <div className="saved-commute-section-grid">
            <div>
              <span>From</span>
              <div className="saved-commute-section-select" role="group" aria-label="Section start station">
                {routeStationIds.map((stationId) => (
                  <button
                    key={`start-${stationId}`}
                    type="button"
                    aria-pressed={rule.sectionStartStationId === stationId}
                    disabled={!rule.enabled}
                    onClick={() => updateRule({ sectionStartStationId: stationId })}
                  >
                    {stationNameFor(stationId)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span>To</span>
              <div className="saved-commute-section-select" role="group" aria-label="Section end station">
                {routeStationIds.map((stationId) => (
                  <button
                    key={`end-${stationId}`}
                    type="button"
                    aria-pressed={rule.sectionEndStationId === stationId}
                    disabled={!rule.enabled}
                    onClick={() => updateRule({ sectionEndStationId: stationId })}
                  >
                    {stationNameFor(stationId)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <em className="saved-commute-notification-note" style={{ fontSize: '0.62rem', display: 'block', marginTop: '0.25rem' }}>{canSelectSection ? "Whole Route" : "Selected Section can be configured once commute is saved"}</em>
        )}
      </div>

      <label className="saved-commute-return-toggle saved-commute-notification-master mt-1">
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
    </div>
  );
}

export function SavedCommutesPanel({
  onBack,
  onClose,
  accountState,
  accountCommutes,
  setAccountCommutes,
  stationSummaries,
  viewedCommuteId,
  onViewPath,
  onClearViewedPath,
  onRequestSignIn,
  onRequestCreateAccount,
  onOpenNotificationSettings,
  notificationSummary,
  activeView: propActiveView,
  onActiveViewChange,
}: Props) {
  const [newLabel, setNewLabel] = useState("");
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
  const [commuteSort, setCommuteSort] = useState<SavedCommuteSort>("attention");
  const [notificationRuleError, setNotificationRuleError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const stationById = useMemo(() => {
    return new Map(stationSummaries.map((station) => [station.id, station]));
  }, [stationSummaries]);

  const { clear: commuteClearCount, affectedNow: commuteAffectedCount } = useMemo(
    () => summarizeSavedCommuteStatuses(accountCommutes),
    [accountCommutes]
  );
  const sortedCommutes = useMemo(() => sortSavedCommutes(accountCommutes, commuteSort), [accountCommutes, commuteSort]);

  function stationNameFor(stationId: string) {
    return stationById.get(stationId)?.name ?? stationId;
  }

  const handleCreateCommute = async () => {
    if (!originStationId || !destinationStationId) {
      setCommuteError("Choose an origin and destination station.");
      return;
    }
    if (originStationId === destinationStationId) {
      setCommuteError("Choose two different stations.");
      return;
    }
    if (newNotificationRule.startMinute !== null && newNotificationRule.endMinute !== null) {
      if (newNotificationRule.startMinute < 0 || newNotificationRule.endMinute < 0) {
        setCommuteError("Please configure the custom notification window times.");
        return;
      }
    }
    setSaving(true);
    setCommuteError(null);
    try {
      const created = await createSavedCommute({
        label: newLabel,
        originStationId,
        destinationStationId,
        watchReturnTrip,
        notificationRule: newNotificationRule,
      });
      setAccountCommutes([...accountCommutes, created]);
      setNewLabel("");
      setOriginStationId("");
      setDestinationStationId("");
      setWatchReturnTrip(true);
      setNewNotificationRule(cloneNotificationRule(defaultSavedCommuteNotificationRule));
      setSuccessMessage("Commute Saved Successfully");
      setToastKey((prev) => prev + 1);
      setActiveView("saved");
    } catch {
      setCommuteError("Could not save that commute.");
    } finally {
      setSaving(false);
    }
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

  const handlePinCommute = async (commute: AccountSavedCommute) => {
    try {
      const updated = await updateSavedCommutePin(commute.id, !commute.pinned);
      setAccountCommutes(accountCommutes.map((item) => item.id === updated.id ? updated : item));
    } catch {
      setCommuteError("Could not update that route pin.");
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
    if (draft.startMinute !== null && draft.endMinute !== null) {
      if (draft.startMinute < 0 || draft.endMinute < 0) {
        setNotificationRuleError("Please configure the custom notification window times.");
        return;
      }
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
            <span>Saved Commutes</span>
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
      <div className="commute-grid min-w-0 px-3 sm:px-4 py-3 flex flex-col gap-3">
        {!accountState.authenticated ? (
          <div className="saved-commute-account-prompt p-4 rounded-lg flex flex-col gap-4 border border-black/10 dark:border-white/10">
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
                Unlock personalized tracking and route impact alerts for your daily subway and LRT routes.
              </p>
            </div>

            <div className="space-y-3 my-1 border-t border-b border-black/5 dark:border-white/5 py-3">
              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Personalized Route Pathing</span>
                  <span className="text-slate-500 dark:text-slate-400">Save custom origin-destination pairs on subway Lines 1, 2, 4 and LRT Lines 5, 6.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Direction-Aware Impact Matching</span>
                  <span className="text-slate-500 dark:text-slate-400">Only get alerted for service disruptions that actually lie in your path and travel direction.</span>
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
                  <span className="text-slate-500 dark:text-slate-400">Receive route impact alerts when notifications are enabled.</span>
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create a Route</h3>
                </div>
                <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Enter a Commute Label (e.g. Work)" aria-label="Saved commute label" />
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
                <button
                  type="button"
                  className="saved-commute-customize-toggle"
                  aria-expanded={showNotificationSettings}
                  onClick={() => setShowNotificationSettings(!showNotificationSettings)}
                >
                  <span>Customize Commute Notifications</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showNotificationSettings ? "rotate-180" : ""}`} />
                </button>
                
                {showNotificationSettings ? (
                  <div className="mt-2">
                    <SavedCommuteNotificationRuleEditor
                      rule={newNotificationRule}
                      onChange={setNewNotificationRule}
                      routeStationIds={[]}
                      stationNameFor={stationNameFor}
                      allowReturnLeg={watchReturnTrip}
                      showSectionControls={false}
                    />
                  </div>
                ) : null}

                <div className="flex gap-2.5 mt-2">
                  <button
                    type="button"
                    className="saved-commute-cancel-button flex-1 py-2 px-3 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors"
                    onClick={() => {
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
                    onClick={handleCreateCommute}
                    disabled={saving}
                    aria-busy={saving}
                  >
                    {saving ? (
                      <>
                        <Loader2 size={15} className="saved-commute-loading-icon" aria-hidden="true" />
                        Plotting route
                      </>
                    ) : (
                      "Save commute"
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
                <div className="flex justify-between items-center mb-1 gap-2">
                  <div className="flex flex-col gap-1 min-w-0 ml-1 sm:ml-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-bold text-slate-800 dark:text-slate-100">Your Routes</span>
                      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">({accountCommutes.length})</span>
                    </div>
                    {accountCommutes.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-0.5" data-testid="commute-status-badges">
                        {commuteClearCount > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {commuteClearCount} Clear
                          </span>
                        )}
                        {commuteAffectedCount > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-[10px] font-bold text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            {commuteAffectedCount} Affected
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {accountCommutes.length > 0 && <div className="flex items-center gap-2 shrink-0">
                    <label className="sr-only" htmlFor="saved-commute-sort">Sort saved routes</label>
                    <select id="saved-commute-sort" value={commuteSort} onChange={(event) => setCommuteSort(event.target.value as SavedCommuteSort)} className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-[#12151c] dark:text-slate-200">
                      <option value="attention">Needs attention</option>
                      <option value="recent">Recently added</option>
                      <option value="name">Name</option>
                      <option value="duration">Typical travel time</option>
                    </select>
                    <button type="button" className="saved-commute-add-btn flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer shrink-0" onClick={() => setActiveView("create")}>+ Add Route</button>
                  </div>}
                </div>

                {accountCommutes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center pt-3 pb-10 sm:py-10 text-center">
                    <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 mb-4">No Saved Commutes</p>
                    <button
                      type="button"
                      className="saved-commute-add-btn flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer"
                      onClick={() => setActiveView("create")}
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

                return (
                  <div key={commute.id} className={`commute-card ${commuteTone(commute)} min-w-0 rounded-lg border border-black/10 !bg-slate-50 p-3 dark:border-white/10 dark:!bg-[#12151c]`}>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <h3 className="min-w-0 text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">
                            {toTitleCase(commute.label.replace(/\bto\b/g, "->"))}
                          </h3>
                          <span className={`status-pill ${commuteTone(commute)}`}>{toTitleCase(commuteStatusLabel(commute))}</span>
                          <button type="button" onClick={() => handlePinCommute(commute)} className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-bold ${commute.pinned ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500 dark:text-slate-400"}`} aria-pressed={commute.pinned} aria-label={`${commute.pinned ? "Unpin" : "Pin"} ${commute.label}`}>
                            <Pin size={12} fill={commute.pinned ? "currentColor" : "none"} /> {commute.pinned ? "Pinned" : "Pin"}
                          </button>
                        </div>
                        {(() => {
                          const currentImpactsCount = currentImpactCount(legs);
                          const hasCurrentImpacts = currentImpactsCount > 0;
                          const impactBgColor = hasCurrentImpacts
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60";
                          const impactText = currentImpactsCount === 0
                            ? "No Impacts"
                            : `${currentImpactsCount} Impact${currentImpactsCount === 1 ? "" : "s"}`;
                          return (
                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${impactBgColor}`}>
                              <ExclaimAlertIcon className="w-3.5 h-3.5 shrink-0" />
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
                            return (
                              <button
                                key={leg.id}
                                type="button"
                                role="tab"
                                aria-selected={selectedLeg.id === leg.id}
                                className={isClear ? "leg-btn-clear" : "leg-btn-affected"}
                                onClick={() => setSelectedLegIds((current) => ({ ...current, [commute.id]: leg.id }))}
                              >
                                To {leg.toStationName}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-2">
                        Default Scheduled Route - To {selectedLeg.toStationName}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-white font-medium">
                        <div className="flex items-center gap-1.5">
                          <NumStationsIcon className="w-3.5 h-3.5 text-white shrink-0" />
                          <span>
                            {toTitleCase(`${selectedLeg.path.stationIds.length} Station${selectedLeg.path.stationIds.length === 1 ? "" : "s"}`)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} className="text-white shrink-0" />
                          <span>
                            {selectedLeg.path.status === "available"
                              ? toTitleCase(`About ${Math.max(1, Math.round(selectedLeg.path.estimatedTravelSeconds / 60.0))} Minutes`)
                              : toTitleCase("Route path unavailable")}
                          </span>
                        </div>
                      </div>

                      <div className="saved-commute-time-estimate-heading mt-3 mb-3 justify-center">
                        <strong
                          className={`!text-[0.88rem] inline-block pb-1.5 border-b-2 ${
                            selectedLeg.impact.severity === "clear"
                              ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-400/30"
                              : "text-amber-600 dark:text-amber-400 border-amber-500/30 dark:border-amber-400/30"
                          }`}
                          style={{
                            color: selectedLeg.impact.severity === "clear" ? "var(--ok)" : "var(--warning)",
                          }}
                        >
                          {toTitleCase(selectedLeg.impact.statusLabel)}
                        </strong>
                      </div>

                      <TravelTimeEstimateBlock leg={selectedLeg} />

                      {selectedLeg.impact.matchedImpacts.length > 0 ? (
                        <div className="mt-4">
                          <div className="saved-commute-time-estimate-heading">
                            <strong className="!text-[0.88rem] text-slate-800 dark:text-white">
                              Active Commute Disruptions
                            </strong>
                          </div>
                          <ul className="saved-commute-impact-list !mt-1.5">
                            {selectedLeg.impact.matchedImpacts.slice(0, 3).map((impact) => (
                              <li key={`${impact.kind}-${impact.id}`}>
                                <ImpactIcon kind={impact.kind} className="mt-0.5 shrink-0" />
                                <span className="text-slate-600 dark:text-slate-400 block">
                                  <strong className="block text-slate-800 dark:text-slate-200">
                                    {toTitleCase(impactKindLabel(impact.kind))}
                                  </strong>
                                  <span className="block mt-0.5">
                                    {toTitleCase(impactLineLabel(impact))}{impact.location ? `: ${toTitleCase(impact.location)}` : ""}{impact.displayDirection ? ` (${toTitleCase(impact.displayDirection)})` : ""}
                                  </span>
                                  {impact.ignoredByRule ? (
                                    <em className="saved-commute-impact-filter-note">
                                      Ignored By Route Alert Filters
                                    </em>
                                  ) : null}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <hr className="border-slate-800/10 dark:border-slate-200/10 mt-5 mb-1.5 mx-1" />
                      <div className="saved-commute-rule-summary">
                        <div>
                          <strong>Route Notifications: {notificationRuleStatus}</strong>
                          <ul className="list-disc list-outside pl-3 mt-1 space-y-0.5 text-[0.66rem] font-medium text-slate-600 dark:text-slate-400">
                            {notificationRule.enabled ? (
                              <>
                                <li>{formatDayMask(notificationRule.dayMask)}</li>
                                <li>{formatWindow(notificationRule)}</li>
                                <li>{formatSection(notificationRule, stationNameFor)}</li>
                                <li>{formatEventTypes(notificationRule)}</li>
                              </>
                            ) : (
                              <li>Saved commute notifications are disabled for this route.</li>
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
                            routeStationIds={routeStops}
                            stationNameFor={stationNameFor}
                            allowReturnLeg={commute.watchReturnTrip}
                            showSectionControls={true}
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
                          className="commute-route-map-button"
                          onClick={() => onViewPath(commute, selectedLeg.id)}
                          disabled={!canViewPath}
                          aria-pressed={viewingPath}
                        >
                          <MapPinned size={14} aria-hidden="true" />
                          {viewingPath ? "Viewing path" : "View path on map"}
                        </button>
                        {deletingCommuteId === commute.id ? (
                          <div className="flex items-center gap-1 ml-auto">
                            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mr-1">Are you sure?</span>
                            <button
                              type="button"
                              className="commute-route-delete-confirm-button"
                              onClick={() => {
                                handleDeleteCommute(commute.id);
                                setDeletingCommuteId(null);
                              }}
                              aria-label={`Confirm delete saved commute ${commute.label}`}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              className="commute-route-delete-cancel-button"
                              onClick={() => setDeletingCommuteId(null)}
                              aria-label={`Cancel delete saved commute ${commute.label}`}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="commute-route-delete-button"
                            onClick={() => setDeletingCommuteId(commute.id)}
                            aria-label={`Delete saved commute ${commute.label}`}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      {stopsExpanded ? (
                        <ol id={`commute-stops-${commute.id}`} className="commute-route-stop-list" aria-label={`Stops for ${commute.label}`}>
                          {routeStops.map((stationId, index) => (
                            <li key={`${commute.id}-${stationId}-${index}`}>
                              <span className="commute-route-stop-index">{index + 1}</span>
                              <span>{stationNameFor(stationId)}</span>
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
