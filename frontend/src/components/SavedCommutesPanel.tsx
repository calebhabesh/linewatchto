"use client";

import { commuteStopSpine } from "../app/commute-stop-spine";
import { transitLineBadgeColors, transitLineName } from "./TransitLineBadge";
import type { CSSProperties } from "react";

import { useDashboardData } from "../app/DataContext";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigation, ChevronDown, Loader2, MapPinned, Plus, Route, Search, SquarePen, Trash2, AlertTriangle, Construction, Clock, Bell, Check, CheckCircle2, Info, ArrowUpRight, ArrowDownLeft, Sunrise, Sunset, Sun, SlidersHorizontal, TrainFront } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
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
import { MOBILE_VIEWPORT_QUERY } from "../hooks/useMobilePerformanceMode";
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
import { ToolbarSelectMenu, type ToolbarSelectOption } from "./ImpactListToolbar";
import { AccountAvailabilityNotice } from "./AccountAvailabilityNotice";

const COMMUTE_SORT_OPTIONS: Array<ToolbarSelectOption<SavedCommuteSort>> = [
  { value: "impact", label: "Most Affected" },
  { value: "recent", label: "Recently Saved" },
  { value: "oldest", label: "Oldest Saved" },
  { value: "name", label: "Route Name A–Z" },
];

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

function CommuteOriginIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="4.5" />
    </svg>
  );
}

function CommuteDestinationPinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C8.13401 2 5 5.13401 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13401 15.866 2 12 2ZM12 11.5C10.6193 11.5 9.5 10.3807 9.5 9C9.5 7.61929 10.6193 6.5 12 6.5C13.3807 6.5 14.5 7.61929 14.5 9C14.5 10.3807 13.3807 11.5 12 11.5Z"
      />
    </svg>
  );
}

function CommuteConnectingDots({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 4 15" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2" r="1.15" />
      <circle cx="2" cy="7.5" r="1.15" />
      <circle cx="2" cy="13" r="1.15" />
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
  focusedCommuteId?: string | null;
  onFocusedCommuteIdChange?: (id: string | null) => void;
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
  sortBy?: SavedCommuteSort;
  onSortByChange?: (sort: SavedCommuteSort) => void;
  networkFilter?: AccountNetworkFilter;
  onNetworkFilterChange?: (filter: AccountNetworkFilter) => void;
  selectedLegIds?: Record<string, AccountCommuteLegId>;
  onSelectedLegIdsChange?: (
    updater:
      | Record<string, AccountCommuteLegId>
      | ((prev: Record<string, AccountCommuteLegId>) => Record<string, AccountCommuteLegId>)
  ) => void;
  expandedCommuteId?: string | null;
  onExpandedCommuteIdChange?: (
    updater: string | null | ((prev: string | null) => string | null)
  ) => void;
  expandedImpactDisclosures?: Record<string, boolean>;
  onToggleImpactDisclosure?: (key: string, isOpen: boolean) => void;
  draft?: SavedCommuteDraft | null;
  onDraftChange?: (draft: SavedCommuteDraft | null) => void;
}

export type AccountNetworkFilter = "all" | NetworkId;

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
        <strong>
          Typical <b className="saved-commute-time-status-value">{formatEstimateDuration(estimate.baselineSeconds)}</b>
        </strong>
        <em className="saved-commute-time-verdict">
          {estimate.status === "unreliable"
            ? "Major Disruption on Route — Travel Time Not Reliable"
            : "Travel Time Estimate Unavailable"}
        </em>
        <span>
          Confidence: <b className="saved-commute-time-status-value">{formatConfidenceLabel(estimate.confidence)}</b>
        </span>
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

function MonitoredRoutesDisclaimer({
  expanded,
  onToggle,
  contentId,
  message,
}: {
  expanded: boolean;
  onToggle: () => void;
  contentId: string;
  message: string;
}) {
  return (
    <div className="saved-commute-routing-boundary-disclosure">
      <button
        type="button"
        className="saved-commute-routing-boundary-trigger"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
        style={{
          alignItems: "center",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          width: "100%",
        }}
      >
        <span
          className="saved-commute-routing-boundary-label"
          style={{ alignItems: "center", display: "inline-flex" }}
        >
          <Info size={11} aria-hidden="true" />
          <span>Monitored Routes Disclaimer</span>
        </span>
        <ChevronDown className={expanded ? "is-open" : undefined} size={12} aria-hidden="true" />
      </button>
      {expanded ? (
        <p id={contentId}>{message}</p>
      ) : null}
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
  { key: "tripCancellations", label: "Train Cancellations" },
  { key: "plannedClosures", label: "Planned Closures" },
  { key: "serviceRestored", label: "Service Restored" },
  { key: "reducedSpeedZones", label: "Reduced Speed Zones" },
];

function notificationEventOptionsForNetwork(networkId: NetworkId) {
  return networkId === "regional"
    ? NOTIFICATION_EVENT_OPTIONS.filter((eventType) => eventType.key !== "reducedSpeedZones")
    : NOTIFICATION_EVENT_OPTIONS.filter((eventType) => eventType.key !== "tripCancellations");
}

function scopeNotificationRuleToNetwork(
  rule: AccountSavedCommuteNotificationRule,
  networkId: NetworkId,
) {
  const normalized = normalizeSavedCommuteNotificationRule(rule);
  return networkId === "regional" ? {
    ...normalized,
    eventTypes: {
      ...normalized.eventTypes,
      reducedSpeedZones: false,
    },
  } : normalized;
}

type NotificationScheduleKey = "outboundSchedule" | "returnSchedule";
type NotificationScheduleMode = "am-rush" | "pm-rush" | "all-day" | "custom";

function notificationScheduleMode(schedule: AccountSavedCommuteNotificationSchedule): NotificationScheduleMode {
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

function NotificationEventIcon({ eventType }: { eventType: keyof AccountSavedCommuteNotificationRule["eventTypes"] }) {
  switch (eventType) {
    case "suspensions":
      return <AlertTriangle className="notification-event-icon suspension-tone" size={15} aria-hidden="true" />;
    case "delays":
      return <DelayIcon className="notification-event-icon delay-tone" size={15} filled={false} />;
    case "tripCancellations":
      return <TrainFront className="notification-event-icon suspension-tone" size={15} aria-hidden="true" />;
    case "reducedSpeedZones":
      return <Construction className="notification-event-icon rsz-tone" size={15} aria-hidden="true" />;
    case "plannedClosures":
      return <PlannedClosureIcon className="notification-event-icon planned-closure-tone" size={15} />;
    case "serviceRestored":
      return <CheckCircle2 className="notification-event-icon service-restored-tone" size={15} aria-hidden="true" />;
  }
}

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
  if (dayMask === 127) return "Every Day";
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

function formatScheduleSummary(schedule: AccountSavedCommuteNotificationSchedule) {
  if (schedule.dayMask === 127 && schedule.startMinute === null && schedule.endMinute === null) {
    return "Every Day · All Day";
  }
  return `${formatDayMask(schedule.dayMask)} · ${formatWindow(schedule)}`;
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

function formatEventTypes(rule: AccountSavedCommuteNotificationRule, networkId: NetworkId) {
  const availableEventTypes = notificationEventOptionsForNetwork(networkId);
  const labels = availableEventTypes.filter((eventType) => rule.eventTypes[eventType.key]).map((eventType) => eventType.label);
  if (labels.length === availableEventTypes.length) return "All Events";
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
  networkId,
}: {
  rule: AccountSavedCommuteNotificationRule;
  onChange: (rule: AccountSavedCommuteNotificationRule) => void;
  allowReturnLeg: boolean;
  networkId: NetworkId;
}) {
  const [scheduleModes, setScheduleModes] = useState<Record<NotificationScheduleKey, NotificationScheduleMode>>(() => ({
    outboundSchedule: notificationScheduleMode(rule.outboundSchedule),
    returnSchedule: notificationScheduleMode(rule.returnSchedule),
  }));
  const [expandedSchedules, setExpandedSchedules] = useState<Record<NotificationScheduleKey, boolean>>({
    outboundSchedule: true,
    returnSchedule: true,
  });

  function updateRule(patch: Partial<AccountSavedCommuteNotificationRule>) {
    onChange(scopeNotificationRuleToNetwork(normalizeSavedCommuteNotificationRule({
      ...rule,
      ...patch,
      eventTypes: {
        ...rule.eventTypes,
        ...(patch.eventTypes ?? {}),
      },
    }), networkId));
  }

  function updateSchedule(
    key: NotificationScheduleKey,
    patch: Partial<AccountSavedCommuteNotificationSchedule>,
  ) {
    onChange(scopeNotificationRuleToNetwork(normalizeSavedCommuteNotificationRule({
      ...rule,
      [key]: {
        ...rule[key],
        ...patch,
      },
    }), networkId));
  }

  function renderLegSchedule(
    key: NotificationScheduleKey,
    label: string,
    enabled: boolean,
    available: boolean,
  ) {
    const schedule = rule[key];
    const controlsEnabled = rule.enabled && enabled && available;
    const mode = scheduleModes[key];
    const expanded = expandedSchedules[key];

    const setEnabled = (checked: boolean) => {
      updateRule(key === "outboundSchedule" ? { outboundEnabled: checked } : { returnEnabled: checked });
    };
    const setDay = (bit: number) => {
      const nextMask = (schedule.dayMask & bit) !== 0 ? schedule.dayMask & ~bit : schedule.dayMask | bit;
      updateSchedule(key, { dayMask: nextMask });
    };
    const selectMode = (nextMode: NotificationScheduleMode) => {
      setScheduleModes((current) => ({ ...current, [key]: nextMode }));
      if (nextMode === "am-rush") {
        updateSchedule(key, { dayMask: 62, startMinute: 6 * 60 + 30, endMinute: 9 * 60 + 30 });
      } else if (nextMode === "pm-rush") {
        updateSchedule(key, { dayMask: 62, startMinute: 15 * 60, endMinute: 19 * 60 });
      } else if (nextMode === "all-day") {
        updateSchedule(key, { dayMask: 127, startMinute: null, endMinute: null });
      } else {
        updateSchedule(key, {
          dayMask: schedule.dayMask || 62,
          startMinute: schedule.startMinute ?? (key === "outboundSchedule" ? 6 * 60 + 30 : 15 * 60),
          endMinute: schedule.endMinute ?? (key === "outboundSchedule" ? 9 * 60 + 30 : 19 * 60),
        });
      }
    };

    return (
      <section className="saved-commute-schedule" data-enabled={controlsEnabled} key={key}>
        <div className="saved-commute-schedule-header">
          <label className="saved-commute-notification-leg-toggle" aria-disabled={!available}>
            <input
              type="checkbox"
              aria-label={`${label} notifications`}
              checked={enabled && available}
              disabled={!rule.enabled || !available}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </label>
          <button
            type="button"
            className="saved-commute-schedule-disclosure"
            aria-label={`Configure ${label} schedule`}
            aria-expanded={expanded}
            aria-controls={`${key}-notification-controls`}
            onClick={() => setExpandedSchedules((current) => ({ ...current, [key]: !current[key] }))}
          >
            <span className="saved-commute-schedule-copy">
              <span className="saved-commute-route-label">
                {key === "outboundSchedule"
                  ? <ArrowUpRight size={17} aria-hidden="true" />
                  : <ArrowDownLeft size={17} aria-hidden="true" />}
                <span>{label}</span>
              </span>
              <span className="saved-commute-schedule-summary">
                {enabled && available ? formatScheduleSummary(schedule) : "Off"}
              </span>
            </span>
            <ChevronDown className={expanded ? "is-open" : undefined} size={17} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
        {expanded ? (
          <div className="saved-commute-schedule-controls" id={`${key}-notification-controls`}>
            <div className="saved-commute-notification-segmented" role="group" aria-label={`${label} notification window`}>
              {([
                ["am-rush", "AM Rush", Sunrise],
                ["pm-rush", "PM Rush", Sunset],
                ["all-day", "Every Day", Sun],
                ["custom", "Custom", SlidersHorizontal],
              ] as const).map(([value, optionLabel, OptionIcon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  disabled={!controlsEnabled}
                  onClick={() => selectMode(value)}
                >
                  <OptionIcon size={14} aria-hidden="true" />
                  <span>{optionLabel}</span>
                </button>
              ))}
            </div>
            {mode === "custom" ? (
              <div className="saved-commute-custom-schedule">
                <strong>Days</strong>
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
                <div className="saved-commute-time-window">
                  <label>
                    <span>Start</span>
                    <input
                      type="time"
                      aria-label={`${label} start time`}
                      value={minuteToTimeValue(schedule.startMinute)}
                      disabled={!controlsEnabled}
                      onChange={(event) => updateSchedule(key, { startMinute: timeValueToMinute(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>End</span>
                    <input
                      type="time"
                      aria-label={`${label} end time`}
                      value={minuteToTimeValue(schedule.endMinute)}
                      disabled={!controlsEnabled}
                      onChange={(event) => updateSchedule(key, { endMinute: timeValueToMinute(event.target.value) })}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className="saved-commute-notification-rule">
      <div className="saved-commute-schedule-list">
        {renderLegSchedule("outboundSchedule", "Outbound Route", rule.outboundEnabled, true)}
        {renderLegSchedule("returnSchedule", "Return Route", rule.returnEnabled, allowReturnLeg)}
      </div>

      <div className="saved-commute-notification-block saved-commute-event-types">
        <div
          className="station-arrival-line-divider saved-commute-notification-divider"
          aria-hidden="true"
        />
        <span className="saved-commute-notification-section-heading">
          <strong>Notify Me About</strong>
          <em>Select every event type you want to receive.</em>
        </span>
        <div className="saved-commute-notification-checks">
          {notificationEventOptionsForNetwork(networkId).map((eventType) => (
            <label key={eventType.key} data-event-type={eventType.key}>
              <span className="saved-commute-notification-event-label">
                <NotificationEventIcon eventType={eventType.key} />
                <span>{eventType.label}</span>
              </span>
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
            </label>
          ))}
        </div>
      </div>

      <div className="saved-commute-notification-master-row">
        <div className="saved-commute-notification-master-copy">
          <Bell size={16} aria-hidden="true" />
          <span>
            <strong>Route Notifications</strong>
            <em>Get alerts for impacts along this commute.</em>
          </span>
        </div>
        <label className="saved-commute-return-toggle saved-commute-notification-master">
          <div className="saved-commute-switch">
            <input
              type="checkbox"
              checked={rule.enabled}
              aria-label="Route notifications"
              onChange={(event) => updateRule({ enabled: event.target.checked })}
            />
            <span className="saved-commute-slider"></span>
          </div>
        </label>
      </div>

      <details className="saved-commute-notification-help">
        <summary>
          <Info size={13} aria-hidden="true" />
          <span>How Scheduling Works</span>
          <ChevronDown className="saved-commute-notification-help-chevron" size={14} aria-hidden="true" />
        </summary>
        <ul>
          <li>All times use Toronto time (ET).</li>
          <li>If a time window continues past midnight, it counts as part of the day it started.</li>
          <li>If a disruption starts outside your selected hours, you may be notified when your next notification window opens.</li>
          <li>Changing these settings will not send an immediate notification for disruptions that are already active.</li>
        </ul>
      </details>

    </div>
  );
}

export interface SavedCommuteDraft {
  newLabel: string;
  editingCommuteId: string | null;
  originStationId: string;
  destinationStationId: string;
  watchReturnTrip: boolean;
  newNotificationRule: AccountSavedCommuteNotificationRule;
  showNotificationSettings: boolean;
  showRoutingDisclaimer: boolean;
  draftNetworkId: NetworkId;
  commuteError: string | null;
}

export const persistedCommuteDraftStore: { current: SavedCommuteDraft | null } = { current: null };

export function clearPersistedCommuteDraft(): void {
  persistedCommuteDraftStore.current = null;
}

export function setPersistedCommuteDraft(draft: SavedCommuteDraft | null): void {
  persistedCommuteDraftStore.current = draft;
}

export const persistedExpandedImpactDisclosures = new Set<string>();

export function SavedCommutesPanel({
  onBack,
  onClose,
  accountState,
  accountCommutes,
  setAccountCommutes,
  stationCatalogs,
  networkId,
  viewedCommuteId,
  focusedCommuteId: propFocusedCommuteId,
  onFocusedCommuteIdChange,
  onViewPath,
  onViewImpactOnPath,
  onClearViewedPath,
  onRequestSignIn,
  onRequestCreateAccount,
  onOpenNotificationSettings,
  notificationSummary,
  activeView: propActiveView,
  onActiveViewChange,
  sortBy: propSortBy,
  onSortByChange,
  networkFilter: propNetworkFilter,
  onNetworkFilterChange,
  selectedLegIds: propSelectedLegIds,
  onSelectedLegIdsChange,
  expandedCommuteId: propExpandedCommuteId,
  onExpandedCommuteIdChange,
  expandedImpactDisclosures: propExpandedImpactDisclosures,
  onToggleImpactDisclosure,
  draft: propDraft,
  onDraftChange,
}: Props) {
  const dashboard = useDashboardData();
  const lastInteractedCommuteIdRef = useRef<string | null>(null);
  const deleteConfirmationRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [internalExpandedImpactDisclosures, setInternalExpandedImpactDisclosures] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const key of persistedExpandedImpactDisclosures) {
      initial[key] = true;
    }
    return initial;
  });
  const expandedImpactDisclosures = propExpandedImpactDisclosures ?? internalExpandedImpactDisclosures;

  const handleToggleImpactDisclosure = (key: string, isOpen: boolean) => {
    if (isOpen) {
      persistedExpandedImpactDisclosures.add(key);
    } else {
      persistedExpandedImpactDisclosures.delete(key);
    }
    if (onToggleImpactDisclosure) {
      onToggleImpactDisclosure(key, isOpen);
    } else {
      setInternalExpandedImpactDisclosures((prev) => ({ ...prev, [key]: isOpen }));
    }
  };

  const [internalFocusedCommuteId, setInternalFocusedCommuteId] = useState<string | null>(null);
  const focusedCommuteId = propFocusedCommuteId !== undefined ? propFocusedCommuteId : internalFocusedCommuteId;
  const setFocusedCommuteId = (id: string | null) => {
    if (onFocusedCommuteIdChange) {
      onFocusedCommuteIdChange(id);
    } else {
      setInternalFocusedCommuteId(id);
    }
  };

  const handleViewImpactOnPath = (
    commute: AccountSavedCommute,
    legId: AccountCommuteLegId,
    impact: AccountMatchedImpact,
  ) => {
    const key = `${commute.id}-${legId}`;
    persistedExpandedImpactDisclosures.add(key);
    if (onToggleImpactDisclosure) {
      onToggleImpactDisclosure(key, true);
    } else {
      setInternalExpandedImpactDisclosures((prev) => ({ ...prev, [key]: true }));
    }
    lastInteractedCommuteIdRef.current = commute.id;
    setFocusedCommuteId(commute.id);
    onViewImpactOnPath(commute, legId, impact);
  };

  const initialDraft = propDraft ?? persistedCommuteDraftStore.current;
  const [newLabel, setNewLabel] = useState(() => initialDraft?.newLabel ?? "");
  const [editingCommuteId, setEditingCommuteId] = useState<string | null>(() => initialDraft?.editingCommuteId ?? null);
  const [originStationId, setOriginStationId] = useState(() => initialDraft?.originStationId ?? "");
  const [destinationStationId, setDestinationStationId] = useState(() => initialDraft?.destinationStationId ?? "");
  const [saving, setSaving] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(() => initialDraft?.commuteError ?? null);
  const [watchReturnTrip, setWatchReturnTrip] = useState(() => initialDraft?.watchReturnTrip ?? true);
  const [internalExpandedCommuteId, setInternalExpandedCommuteId] = useState<string | null>(null);
  const expandedCommuteId = propExpandedCommuteId !== undefined ? propExpandedCommuteId : internalExpandedCommuteId;
  const setExpandedCommuteId = (
    updater: string | null | ((prev: string | null) => string | null)
  ) => {
    if (onExpandedCommuteIdChange) {
      onExpandedCommuteIdChange(updater);
    } else {
      setInternalExpandedCommuteId(updater);
    }
  };
  const [deletingCommuteId, setDeletingCommuteId] = useState<string | null>(null);
  const [userToggledCommuteIds, setUserToggledCommuteIds] = useState<Record<string, number>>({});
  const swapAnimationTimeoutsRef = useRef<Record<string, number>>({});

  const clearCommuteSwapAnimation = (commuteId?: string) => {
    if (commuteId) {
      if (swapAnimationTimeoutsRef.current[commuteId] !== undefined) {
        window.clearTimeout(swapAnimationTimeoutsRef.current[commuteId]);
        delete swapAnimationTimeoutsRef.current[commuteId];
      }
      setUserToggledCommuteIds((prev) => {
        if (!prev[commuteId]) return prev;
        const next = { ...prev };
        delete next[commuteId];
        return next;
      });
    } else {
      Object.values(swapAnimationTimeoutsRef.current).forEach((timerId) => window.clearTimeout(timerId));
      swapAnimationTimeoutsRef.current = {};
      setUserToggledCommuteIds({});
    }
  };

  const [internalSelectedLegIds, setInternalSelectedLegIds] = useState<Record<string, AccountCommuteLegId>>({});
  const selectedLegIds = propSelectedLegIds ?? internalSelectedLegIds;
  const setSelectedLegIds = (
    updater:
      | Record<string, AccountCommuteLegId>
      | ((prev: Record<string, AccountCommuteLegId>) => Record<string, AccountCommuteLegId>)
  ) => {
    if (onSelectedLegIdsChange) {
      onSelectedLegIdsChange(updater);
    } else {
      setInternalSelectedLegIds(updater);
    }
  };

  const handleToggleLeg = (
    commuteId: string,
    nextLegId: AccountCommuteLegId,
    currentLegId: AccountCommuteLegId,
  ) => {
    if (nextLegId === currentLegId) return;

    setSelectedLegIds((current) => ({ ...current, [commuteId]: nextLegId }));

    if (swapAnimationTimeoutsRef.current[commuteId] !== undefined) {
      window.clearTimeout(swapAnimationTimeoutsRef.current[commuteId]);
      delete swapAnimationTimeoutsRef.current[commuteId];
    }

    setUserToggledCommuteIds((prev) => ({
      ...prev,
      [commuteId]: (prev[commuteId] || 0) + 1,
    }));

    swapAnimationTimeoutsRef.current[commuteId] = window.setTimeout(() => {
      clearCommuteSwapAnimation(commuteId);
    }, 550);
  };

  const [activePicker, setActivePicker] = useState<"origin" | "destination" | null>(null);
  const [activeViewInternal, setActiveViewInternal] = useState<"create" | "saved">("create");
  const activeView = propActiveView ?? activeViewInternal;
  const setActiveView = (view: "create" | "saved") => {
    if (view !== "saved") {
      clearCommuteSwapAnimation();
    }
    setActiveViewInternal(view);
    onActiveViewChange?.(view);
  };

  useEffect(() => {
    return () => {
      Object.values(swapAnimationTimeoutsRef.current).forEach((timerId) => window.clearTimeout(timerId));
      swapAnimationTimeoutsRef.current = {};
    };
  }, []);
  const [newNotificationRule, setNewNotificationRule] = useState<AccountSavedCommuteNotificationRule>(() =>
    initialDraft?.newNotificationRule
      ? cloneNotificationRule(initialDraft.newNotificationRule)
      : cloneNotificationRule(defaultSavedCommuteNotificationRule)
  );
  const [showNotificationSettings, setShowNotificationSettings] = useState(() => initialDraft?.showNotificationSettings ?? false);
  const [showRoutingDisclaimer, setShowRoutingDisclaimer] = useState(() => initialDraft?.showRoutingDisclaimer ?? false);
  const [editingNotificationCommuteId, setEditingNotificationCommuteId] = useState<string | null>(null);
  const [notificationDrafts, setNotificationDrafts] = useState<Record<string, AccountSavedCommuteNotificationRule>>({});
  const [savingNotificationRuleId, setSavingNotificationRuleId] = useState<string | null>(null);
  const [notificationRuleError, setNotificationRuleError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [internalSortBy, setInternalSortBy] = useState<SavedCommuteSort>("impact");
  const sortBy = propSortBy ?? internalSortBy;
  const setSortBy = (nextSort: SavedCommuteSort) => {
    if (onSortByChange) {
      onSortByChange(nextSort);
    } else {
      setInternalSortBy(nextSort);
    }
  };
  const [internalNetworkFilter, setInternalNetworkFilter] = useState<AccountNetworkFilter>("all");
  const networkFilter = propNetworkFilter ?? internalNetworkFilter;
  const setNetworkFilter = (nextFilter: AccountNetworkFilter) => {
    if (onNetworkFilterChange) {
      onNetworkFilterChange(nextFilter);
    } else {
      setInternalNetworkFilter(nextFilter);
    }
  };
  const [draftNetworkId, setDraftNetworkId] = useState<NetworkId>(() => initialDraft?.draftNetworkId ?? networkId);

  useEffect(() => {
    if (activeView === "create") {
      const nextDraft: SavedCommuteDraft = {
        newLabel,
        editingCommuteId,
        originStationId,
        destinationStationId,
        watchReturnTrip,
        newNotificationRule,
        showNotificationSettings,
        showRoutingDisclaimer,
        draftNetworkId,
        commuteError,
      };
      setPersistedCommuteDraft(nextDraft);
      onDraftChange?.(nextDraft);
    }
  }, [
    activeView,
    newLabel,
    editingCommuteId,
    originStationId,
    destinationStationId,
    watchReturnTrip,
    newNotificationRule,
    showNotificationSettings,
    showRoutingDisclaimer,
    draftNetworkId,
    commuteError,
    onDraftChange,
  ]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => {
      setSuccessMessage(null);
    }, 3200);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const stationSummaries = stationCatalogs[draftNetworkId];
  const stationNameFor = useCallback(
    (stationId: string, commuteNetworkId: NetworkId) => {
      return stationCatalogs[commuteNetworkId]?.find((station) => station.id === stationId)?.name ?? stationId;
    },
    [stationCatalogs]
  );

  const visibleCommutes = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    return accountCommutes.filter((commute) => {
      const matchesNetwork = networkFilter === "all" || (commute.networkId ?? "ttc") === networkFilter;
      if (!matchesNetwork) return false;
      if (!trimmedQuery) return true;
      const originName = stationNameFor(commute.originStationId, commute.networkId ?? "ttc").toLowerCase();
      const destName = stationNameFor(commute.destinationStationId, commute.networkId ?? "ttc").toLowerCase();
      return (
        commute.label.toLowerCase().includes(trimmedQuery) ||
        originName.includes(trimmedQuery) ||
        destName.includes(trimmedQuery)
      );
    });
  }, [accountCommutes, networkFilter, query, stationNameFor]);

  const { clear: commuteClearCount, affectedNow: commuteAffectedCount } = useMemo(
    () => summarizeSavedCommuteStatuses(visibleCommutes),
    [visibleCommutes]
  );

  const { clear: allCommuteClearCount, affectedNow: allCommuteAffectedCount } = useMemo(
    () => summarizeSavedCommuteStatuses(accountCommutes),
    [accountCommutes]
  );

  const sortedCommutes = useMemo(
    () => sortSavedCommutes(visibleCommutes, sortBy),
    [visibleCommutes, sortBy]
  );

  useEffect(() => {
    if (activeView !== "saved") return;
    const rawTarget = focusedCommuteId || lastInteractedCommuteIdRef.current || viewedCommuteId;
    if (!rawTarget) return;
    const targetId = rawTarget.replace(/-(outbound|return)$/, "");
    if (!targetId) return;

    let timeoutId: number | undefined;
    let animationFrameId: number | undefined;

    const scrollToCard = () => {
      const card = document.querySelector<HTMLElement>(
        `[data-commute-card-id="${CSS.escape(targetId)}"]`,
      );
      if (!card) return false;

      card.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
      return true;
    };

    if (!scrollToCard()) {
      animationFrameId = window.requestAnimationFrame(() => {
        if (!scrollToCard()) {
          timeoutId = window.setTimeout(scrollToCard, 100);
        }
      });
    } else {
      timeoutId = window.setTimeout(scrollToCard, 80);
    }

    const postAnimationTimeoutId = window.setTimeout(scrollToCard, 280);

    return () => {
      if (animationFrameId !== undefined) window.cancelAnimationFrame(animationFrameId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (postAnimationTimeoutId !== undefined) window.clearTimeout(postAnimationTimeoutId);
    };
  }, [activeView, focusedCommuteId, viewedCommuteId, sortedCommutes]);

  useEffect(() => {
    if (!deletingCommuteId || !window.matchMedia(MOBILE_VIEWPORT_QUERY).matches) return;

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

  const resetRouteDraft = () => {
    setPersistedCommuteDraft(null);
    onDraftChange?.(null);
    setNewLabel("");
    setOriginStationId("");
    setDestinationStationId("");
    setWatchReturnTrip(true);
    setEditingCommuteId(null);
    setDraftNetworkId(networkId);
    setShowRoutingDisclaimer(false);
    setShowNotificationSettings(false);
    setNewNotificationRule(cloneNotificationRule(defaultSavedCommuteNotificationRule));
    setCommuteError(null);
    clearCommuteSwapAnimation();
  };

  const startCreatingCommute = () => {
    resetRouteDraft();
    setDraftNetworkId(networkId);
    setCommuteError(null);
    clearCommuteSwapAnimation();
    setQuery("");
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
            notificationRule: scopeNotificationRuleToNetwork(newNotificationRule, draftNetworkId),
          });
      const targetCommuteId = editingCommuteId ?? saved.id;
      setAccountCommutes(editingCommuteId
        ? accountCommutes.map((commute) => commute.id === saved.id ? saved : commute)
        : [...accountCommutes, saved]);
      resetRouteDraft();
      setNewNotificationRule(cloneNotificationRule(defaultSavedCommuteNotificationRule));
      setSuccessMessage(editingCommuteId ? "Commute Updated Successfully" : "Commute Saved Successfully");
      setToastKey((prev) => prev + 1);
      lastInteractedCommuteIdRef.current = targetCommuteId;
      setFocusedCommuteId(targetCommuteId);
      clearCommuteSwapAnimation();
      setActiveView("saved");
    } catch (error) {
      setCommuteError(error instanceof Error ? error.message : "Could not save that commute.");
    } finally {
      setSaving(false);
    }
  };

  const startEditingCommute = (commute: AccountSavedCommute) => {
    lastInteractedCommuteIdRef.current = commute.id;
    setFocusedCommuteId(commute.id);
    setEditingCommuteId(commute.id);
    setNewLabel(commute.label);
    setOriginStationId(commute.originStationId);
    setDestinationStationId(commute.destinationStationId);
    setWatchReturnTrip(commute.watchReturnTrip);
    setDraftNetworkId(commute.networkId ?? "ttc");
    setShowNotificationSettings(false);
    setShowRoutingDisclaimer(false);
    setCommuteError(null);
    clearCommuteSwapAnimation(commute.id);
    setActiveView("create");
  };

  const handleDeleteCommute = async (id: string) => {
    try {
      await deleteSavedCommute(id);
      setAccountCommutes(accountCommutes.filter((commute) => commute.id !== id));
      if (viewedCommuteId === id) {
        onClearViewedPath(id);
      }
      if (focusedCommuteId === id) {
        setFocusedCommuteId(null);
      }
      if (lastInteractedCommuteIdRef.current === id) {
        lastInteractedCommuteIdRef.current = null;
      }
      clearCommuteSwapAnimation(id);
      setExpandedCommuteId((current) => current === id ? null : current);
    } catch {
      setCommuteError("Could not delete that commute.");
    }
  };

  function startEditingNotificationRule(commute: AccountSavedCommute) {
    lastInteractedCommuteIdRef.current = commute.id;
    setFocusedCommuteId(commute.id);
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
    const draft = scopeNotificationRuleToNetwork(
      notificationDrafts[commute.id] ?? ruleForCommute(commute),
      commute.networkId ?? "ttc",
    );
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

  const renderedSavedCommutes: React.ReactNode[] = [];
  for (const commute of sortedCommutes) {
    const legs = commuteLegs(commute);
    const selectedLegId = selectedLegIds[commute.id] ?? "outbound";
    const selectedLeg = legs.find((leg) => leg.id === selectedLegId) ?? legs[0];
    const stopsExpanded = expandedCommuteId === commute.id;
    const routeStops = selectedLeg.path.stationIds;
    const canViewPath = selectedLeg.path.status === "available" && selectedLeg.path.segmentIds.length > 0;
    const selectedPreview = commutePathPreviewFromCommute(commute, selectedLeg.id);
    const viewingPath = Boolean(selectedPreview && viewedCommuteId === selectedPreview.id);
    const notificationRule = ruleForCommute(commute);
    const notificationDraft = notificationDrafts[commute.id] ?? notificationRule;
    const editingNotificationRule = editingNotificationCommuteId === commute.id;
    const notificationRuleStatus = notificationRule.enabled ? "On" : "Off";
    const selectedTravelTimeEstimate = selectedLeg.impact.travelTimeEstimate ?? fallbackTravelTimeEstimate(selectedLeg);
    const selectedTravelTimeSeverity = travelTimeSeverity(selectedTravelTimeEstimate);
    const travelTimeHeadline = formatTravelTimeHeadline(selectedTravelTimeEstimate);
    const selectedLegClearByFilters = legIsClearByFilters(selectedLeg);
    const selectedLegImpactSummary = summarizeMatchedImpacts(selectedLeg.impact.matchedImpacts);
    const disclosureKey = `${commute.id}-${selectedLeg.id}`;
    const isDisclosureOpen = expandedImpactDisclosures[disclosureKey] ?? persistedExpandedImpactDisclosures.has(disclosureKey);

    const renderedMatchedImpacts: React.ReactNode[] = [];
    for (const impact of selectedLeg.impact.matchedImpacts) {
      renderedMatchedImpacts.push(
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
                onClick={() => handleViewImpactOnPath(commute, selectedLeg.id, impact)}
                aria-label={`View ${impactKindLabel(impact.kind, impact.kind === "planned-closure" && impact.status === "current")} on the map for ${commute.label}`}
              >
                <MapPinned size={12} aria-hidden="true" />
                View on Map
              </button>
            </div>
          </div>
        </li>
      );
    }

    const originStationName = selectedLeg.fromStationName || commute.originStationName || stationNameFor(commute.originStationId, commute.networkId ?? "ttc");
    const destinationStationName = selectedLeg.toStationName || commute.destinationStationName || stationNameFor(commute.destinationStationId, commute.networkId ?? "ttc");
    const toggleCount = userToggledCommuteIds[commute.id] ?? 0;
    const isUserToggled = toggleCount > 0;

    renderedSavedCommutes.push(
      <div
        key={commute.id}
        id={`commute-card-${commute.id}`}
        data-commute-card-id={commute.id}
        className={`commute-card ${commuteTone(commute)} min-w-0 max-w-full w-full rounded-lg border-2 border-transparent !bg-slate-50 p-3 dark:border-transparent dark:!bg-[#12151c]`}
      >
        <div className="min-w-0 max-w-full w-full">
          <div className="saved-commute-card-header">
            <div className="saved-commute-card-identity">
              <div className="min-w-0 flex-1">
                <h3 className="min-w-0 flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">
                  <Route size={15} aria-hidden="true" className="saved-commute-title-icon shrink-0 text-[#0284c7] dark:text-logo-blue" />
                  <span>{commute.label}</span>
                </h3>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <AccountNetworkBadge networkId={commute.networkId ?? "ttc"} />
                  <span className={`status-pill ${commuteTone(commute)}`}>{toTitleCase(commuteStatusLabel(commute))}</span>
                </div>
              </div>
            </div>
            {(() => {
              const currentImpactsCount = currentImpactCount(legs);
              const ignoredImpactsCount = ignoredCurrentImpactCount(legs);
              const hasCurrentImpacts = currentImpactsCount > 0;
              const impactBgColor = hasCurrentImpacts
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-transparent"
                : ignoredImpactsCount > 0
                  ? "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-transparent"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-transparent";
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
          <div className="saved-commute-endpoints">
            <div className="saved-commute-endpoint-row is-origin">
              <div className="saved-commute-endpoint-icon-col" aria-hidden="true">
                <CommuteOriginIcon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300 shrink-0" />
              </div>
              <div className="saved-commute-endpoint-content">
                <span className="saved-commute-endpoint-prefix">Origin:</span>
                <span className="saved-commute-endpoint-station" title={originStationName}>
                  <span
                    key={isUserToggled ? `origin-${selectedLeg.id}-${toggleCount}` : undefined}
                    className={`saved-commute-station-text ${isUserToggled ? "saved-commute-origin-swap" : ""}`}
                    onAnimationEnd={(e) => {
                      if (e.animationName === "commuteOriginSwapIn") {
                        clearCommuteSwapAnimation(commute.id);
                      }
                    }}
                  >
                    {originStationName}
                  </span>
                </span>
              </div>
            </div>
            <div className="saved-commute-endpoint-connector" aria-hidden="true">
              <div className="saved-commute-endpoint-icon-col">
                <CommuteConnectingDots className="w-1 h-3.5 text-slate-500 dark:text-white" />
              </div>
            </div>
            <div className="saved-commute-endpoint-row is-destination">
              <div className="saved-commute-endpoint-icon-col" aria-hidden="true">
                <CommuteDestinationPinIcon className="w-3.5 h-3.5 text-red-500 dark:text-red-400 shrink-0" />
              </div>
              <div className="saved-commute-endpoint-content">
                <span className="saved-commute-endpoint-prefix">Destination:</span>
                <span className="saved-commute-endpoint-station" title={destinationStationName}>
                  <span
                    key={isUserToggled ? `dest-${selectedLeg.id}-${toggleCount}` : undefined}
                    className={`saved-commute-station-text ${isUserToggled ? "saved-commute-dest-swap" : ""}`}
                    onAnimationEnd={(e) => {
                      if (e.animationName === "commuteDestSwapIn") {
                        clearCommuteSwapAnimation(commute.id);
                      }
                    }}
                  >
                    {destinationStationName}
                  </span>
                </span>
              </div>
            </div>
          </div>
          {legs.length > 1 ? (
            <div
              className="commute-leg-toggle"
              role="tablist"
              aria-label={`Route direction for ${commute.label}`}
              data-selected-index={legs.findIndex((l) => l.id === selectedLeg.id) <= 0 ? "0" : "1"}
              data-selected-state={
                selectedLegClearByFilters
                  ? "filtered"
                  : selectedLeg.impact.severity === "clear"
                    ? "clear"
                    : "affected"
              }
            >
              <div className="commute-leg-glider" aria-hidden="true" />
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
                    onClick={() => {
                      handleToggleLeg(commute.id, leg.id, selectedLeg.id);
                    }}
                    title={`To ${leg.toStationName}`}
                  >
                    <span className="truncate min-w-0 max-w-full block">To {leg.toStationName}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="commute-single-leg-container">
              <div
                className="commute-single-leg-banner"
                data-selected-state={
                  selectedLegClearByFilters
                    ? "filtered"
                    : selectedLeg.impact.severity === "clear"
                      ? "clear"
                      : "affected"
                }
              >
                <span>To {selectedLeg.toStationName}</span>
              </div>
            </div>
          )}

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
            <details
              className="saved-commute-impact-disclosure"
              open={isDisclosureOpen}
              onClick={(event) => {
                const summary = (event.target as HTMLElement).closest("summary");
                if (!summary) return;
                const details = event.currentTarget;
                if (details.open) {
                  event.preventDefault();
                  details.classList.add("collapsing");
                  window.setTimeout(() => {
                    details.open = false;
                    details.classList.remove("collapsing");
                    handleToggleImpactDisclosure(disclosureKey, false);
                  }, 220);
                }
              }}
              onToggle={(event) => {
                handleToggleImpactDisclosure(disclosureKey, event.currentTarget.open);
              }}
            >
              <summary className="saved-commute-impact-summary">
                <span className="saved-commute-impact-summary-heading">
                  <ExclaimAlertIcon className="saved-commute-impact-summary-icon" />
                  <strong>Active Commute Disruptions</strong>
                  <span className={`desktop-menu-count-badge saved-commute-impact-total${selectedLeg.impact.matchedImpacts.length > 0 ? " is-affected" : ""}`}>
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
              <div className="saved-commute-impact-content-wrapper">
                <div className="saved-commute-impact-content">
                  <ul className="saved-commute-impact-list">
                    {renderedMatchedImpacts}
                  </ul>
                </div>
              </div>
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
                    <li>{formatEventTypes(notificationRule, commute.networkId ?? "ttc")}</li>
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
                networkId={commute.networkId ?? "ttc"}
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
              className="commute-route-stop-toggle commute-route-edit-button"
              onClick={() => startEditingCommute(commute)}
              aria-label={`Edit commute ${commute.label}`}
            >
              <SquarePen size={16} aria-hidden="true" />
              Edit Route
            </button>
            <button
              type="button"
              className="commute-route-stop-toggle"
              onClick={() => setExpandedCommuteId((current) => current === commute.id ? null : commute.id)}
              aria-expanded={stopsExpanded}
              aria-controls={`commute-stops-${commute.id}`}
              disabled={routeStops.length === 0}
            >
              {stopsExpanded ? "Hide Stops" : `View ${routeStops.length} Stops`}
              <ChevronDown size={16} aria-hidden="true" className={`transition-transform duration-200 ${stopsExpanded ? "rotate-180" : ""}`} />
            </button>
            <button
              type="button"
              className="saved-commute-map-action commute-route-map-button"
              onClick={() => {
                lastInteractedCommuteIdRef.current = commute.id;
                setFocusedCommuteId(commute.id);
                onViewPath(commute, selectedLeg.id);
              }}
              disabled={!canViewPath}
              aria-pressed={viewingPath}
            >
              <MapPinned size={14} aria-hidden="true" />
              {viewingPath ? "Viewing path" : "View path on map"}
            </button>
          </div>
          {stopsExpanded ? (
            <ol id={`commute-stops-${commute.id}`} className="commute-route-stop-list" aria-label={`Stops for ${commute.label}`}>
              {commuteStopSpine(selectedLeg.path).map(({ stationId, incomingLineId, outgoingLineId }, index) => (
                <li
                  key={`${commute.id}-${stationId}-${index}`}
                  className="commute-route-stop"
                  data-incoming-line={incomingLineId ?? undefined}
                  data-outgoing-line={outgoingLineId ?? undefined}
                  style={{
                    "--stop-incoming": incomingLineId ? transitLineBadgeColors(incomingLineId).backgroundColor : "transparent",
                    "--stop-outgoing": outgoingLineId ? transitLineBadgeColors(outgoingLineId).backgroundColor : "transparent",
                  } as CSSProperties}
                >
                  <span className="commute-route-stop-index">{index + 1}</span>
                  <span>
                    <span>{stationNameFor(stationId, commute.networkId ?? "ttc")}</span>
                    <span className="sr-only">
                      {outgoingLineId ? `, continue on ${transitLineName(outgoingLineId) ?? outgoingLineId}` : ""}
                    </span>
                  </span>
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
  }

  if (dashboard.snapshot) return (
    <section className="commute-panel min-w-0 rounded-lg">
      <PanelHeader title="My Commutes" onBack={onBack} onClose={onClose} />
      <div className="p-4 space-y-3">
        <p role="status">Current commute impacts and travel-time estimates are unavailable. Reconnect to check your routes.</p>
        {accountCommutes.map((commute) => <p key={commute.id} className="font-semibold">{commute.label}</p>)}
      </div>
    </section>
  );

  return (
    <section className="commute-panel min-w-0 border border-transparent rounded-lg shadow-xl">
      <PanelHeader
        title="My Commutes"
        icon={<Navigation className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />}
        titleBadge={
          accountState.user?.demo ? (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Demo account
            </span>
          ) : null
        }
        actions={
          accountState.authenticated && accountCommutes.length > 0 ? (
            <div className="flex items-center gap-1.5 shrink-0" data-testid="header-commute-status-badges">
              <span
                className={`desktop-menu-count-badge desktop-menu-count-commutes-clear flex h-7 ${
                  allCommuteClearCount < 10 ? "w-7" : "min-w-[28px] px-1.5"
                } items-center justify-center rounded-full text-sm font-bold`}
                data-single-digit={allCommuteClearCount < 10 ? "true" : undefined}
                aria-label={`${allCommuteClearCount} clear commutes`}
              >
                {allCommuteClearCount}
              </span>
              <span
                className={`desktop-menu-count-badge desktop-menu-count-commutes-affected flex h-7 ${
                  allCommuteAffectedCount < 10 ? "w-7" : "min-w-[28px] px-1.5"
                } items-center justify-center rounded-full text-sm font-bold`}
                data-single-digit={allCommuteAffectedCount < 10 ? "true" : undefined}
                aria-label={`${allCommuteAffectedCount} affected commutes`}
              >
                {allCommuteAffectedCount}
              </span>
            </div>
          ) : null
        }
        onBack={onBack ? () => {
          if (activePicker) {
            setActivePicker(null);
          } else if (activeView === "create") {
            if (editingCommuteId) {
              lastInteractedCommuteIdRef.current = editingCommuteId;
            }
            clearCommuteSwapAnimation();
            resetRouteDraft();
            setActiveView("saved");
            setCommuteError(null);
          } else {
            onBack();
          }
        } : undefined}
        onClose={onClose ? () => {
          if (activePicker) {
            setActivePicker(null);
          } else {
            onClose();
          }
        } : undefined}
      />
      <div key={activeView} className="commute-body flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden" data-nav-direction={activeView === "create" ? "forward" : "back"}>
        {accountState.source === "unavailable" ? (
          <div className="commute-grid min-w-0 pb-3 flex flex-col gap-3">
            <AccountAvailabilityNotice knownAccountLabel={accountState.user?.displayName || accountState.user?.email || null} />
          </div>
        ) : !accountState.authenticated ? (
          <div className="commute-grid min-w-0 pb-3 flex flex-col gap-3">
            <div className="account-feature-preview saved-commute-account-prompt p-4 rounded-lg flex flex-col gap-4 border border-transparent">
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
          </div>
        ) : null}

        {accountState.source === "backend" && accountState.authenticated ? (
          <>
            {activeView === "create" ? (
              <div className="commute-grid min-w-0 pb-3 flex flex-col gap-3">
                <div className="saved-commute-form">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{editingCommuteId ? "Edit Route" : "Create a Route"}</h3>
                {!editingCommuteId ? (
                  <div className="account-network-filter w-full" data-network={draftNetworkId} data-options-count={2} role="group" aria-label="Choose commute network">
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
                  <div className="saved-commute-rule-drawer">
                    <SavedCommuteNotificationRuleEditor
                      rule={newNotificationRule}
                      onChange={setNewNotificationRule}
                      allowReturnLeg={watchReturnTrip}
                      networkId={draftNetworkId}
                    />
                  </div>
                ) : null}

                <div className="flex gap-2.5 mt-2">
                  <button
                    type="button"
                    className="saved-commute-cancel-button flex-1"
                    onClick={() => {
                      if (editingCommuteId) {
                        lastInteractedCommuteIdRef.current = editingCommuteId;
                      }
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

                {editingCommuteId ? (
                  <div className="saved-commute-edit-danger-zone">
                    {deletingCommuteId === editingCommuteId ? (
                      <div className="saved-commute-delete-confirm-box">
                        <span className="saved-commute-delete-confirm-prompt">Delete this commute route?</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="saved-commute-delete-confirm-btn"
                            onClick={() => {
                              handleDeleteCommute(editingCommuteId);
                              setDeletingCommuteId(null);
                              resetRouteDraft();
                              setActiveView("saved");
                            }}
                            aria-label={`Confirm delete commute ${newLabel}`}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="saved-commute-delete-cancel-btn"
                            onClick={() => setDeletingCommuteId(null)}
                            aria-label="Cancel delete commute"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="saved-commute-edit-delete-button"
                        onClick={() => setDeletingCommuteId(editingCommuteId)}
                        aria-label={`Delete commute ${newLabel}`}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        <span>Delete this commute</span>
                      </button>
                    )}
                  </div>
                ) : null}

                <SavedCommuteNotificationSummary
                    onOpenNotificationSettings={onOpenNotificationSettings}
                    notificationSummary={notificationSummary}
                  />
                {!editingCommuteId ? (
                  <MonitoredRoutesDisclaimer
                    expanded={showRoutingDisclaimer}
                    onToggle={() => setShowRoutingDisclaimer((current) => !current)}
                    contentId="create-commute-routing-disclaimer"
                    message="My Commutes monitors the TTC or GO/UP rail routes you select. If you use both systems, save one route for each so you can review both in this list. LineWatchTO evaluates only the selected rail networks, so the monitored routes may not be the fastest or most optimal choices across every travel scenario or account for buses, walking transfers, and alternatives."
                  />
                ) : null}
                </div>
              </div>
            ) : (
              <>
                <div className="my-stations-controls saved-commute-controls">
                  <div className="my-stations-controls-top">
                    <label className="impact-list-search my-stations-search saved-commute-search">
                      <Search size={15} aria-hidden="true" />
                      <span className="sr-only">Search saved commutes</span>
                      <input
                        type="search"
                        className="submenu-search-input"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search saved commutes..."
                      />
                    </label>
                    <button
                      type="button"
                      className="my-stations-mode-action my-stations-add my-commutes-add saved-commute-add-btn"
                      onClick={startCreatingCommute}
                      aria-label="+ Add Commute"
                    >
                      <span className="my-stations-mode-action-content">
                        <Plus size={16} aria-hidden="true" />
                        <span className="my-stations-add-wide">Add Commute</span>
                        <span className="my-stations-add-compact">Add</span>
                      </span>
                    </button>
                  </div>
                  <div className="account-network-filter w-full" data-network={networkFilter} data-options-count={ACCOUNT_NETWORK_OPTIONS.length} role="group" aria-label="Filter My Commutes by network">
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
                  <div className="my-stations-selects saved-commute-selects">
                    <ToolbarSelectMenu
                      ariaLabel="Sort My Commutes"
                      prefix="Sort"
                      value={sortBy}
                      options={COMMUTE_SORT_OPTIONS}
                      onChange={setSortBy}
                      align="left"
                    />
                    {visibleCommutes.length > 0 ? (
                      <div className="flex items-center gap-1.5 ml-auto shrink-0" data-testid="commute-status-badges">
                        <span className="toolbar-status-badge toolbar-status-badge--total">
                          {visibleCommutes.length} Total
                        </span>
                        {commuteClearCount > 0 ? (
                          <span className="toolbar-status-badge toolbar-status-badge--clear">
                            {commuteClearCount} Clear
                          </span>
                        ) : null}
                        {commuteAffectedCount > 0 ? (
                          <span className="toolbar-status-badge toolbar-status-badge--affected">
                            {commuteAffectedCount} Affected
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="commute-grid saved-commute-list-scroll min-w-0 pb-3 flex flex-col gap-3" aria-label="Saved commutes">
                  {visibleCommutes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center pt-3 pb-10 sm:py-10 text-center">
                      <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 mb-4">
                        {accountCommutes.length === 0 ? "No Commutes Yet" : query.trim() ? "No Commutes Match" : "No Commutes Match This Network"}
                      </p>
                      {query.trim() ? (
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                          onClick={() => setQuery("")}
                        >
                          Clear Search
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="saved-commute-add-btn flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer"
                          onClick={startCreatingCommute}
                        >
                          Create Commute
                        </button>
                      )}
                    </div>
                  ) : (
                    renderedSavedCommutes
                  )}
                  <p className="saved-commute-routing-boundary-static" role="note">
                    <Info size={11} aria-hidden="true" />
                    <span>Monitoring the rail routes you selected. They may not be the fastest or most optimal routes in every scenario.</span>
                  </p>
                </div>
              </>
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
