"use client";
import { IncidentStationSpan } from "./IncidentStationSpan";
import { regionalLineLabel } from "../app/regional-data";

import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Construction,
  MapPinned,
  Route,
  SquarePen,
} from "lucide-react";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { SavedCommuteNotificationRuleEditor } from "./SavedCommuteNotificationRuleEditor";
import { transitLineBadgeColors, transitLineName } from "./TransitLineBadge";
import { commuteStopSpine } from "../app/commute-stop-spine.ts";
import {
  commuteLegsForCommute,
  commutePathPreviewFromCommute,
  type AccountCommuteImpact,
  type AccountCommuteLeg,
  type AccountCommuteLegId,
  type AccountCommuteTravelTimeEstimate,
  type AccountMatchedImpact,
  type AccountSavedCommute,
  type AccountSavedCommuteNotificationRule,
} from "../app/commute-data.ts";
import {
  formatConfidenceLabel,
  formatEstimateDuration,
  formatEstimateRange,
  formatExtraTimeRange,
  formatTravelTimeHeadline,
} from "../app/commute-duration.ts";
import {
  formatEventTypes,
  formatLegSchedule,
  ruleForCommute,
} from "../app/commute-notification-edit-model.ts";
import type { NetworkId } from "../app/regional-data.ts";

export function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .split(/\s+/)
    .map((word) => {
      if (!word) return "";
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

export function NumStationsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="currentColor">
      <g>
        <path d="M349.917,432.716v-0.635H162.472v0.635h-10.544L89.982,512h45.644l13.705-20.233h213.334L376.367,512h45.659l-61.95-79.284H349.917z M162.558,472.248l13.988-20.648h158.912l13.988,20.648H162.558z" />
        <path d="M256.002,0C112.749,0,71.397,51.982,71.397,91.663v258.601c0,34.895,28.29,63.216,63.224,63.216h242.765c34.942,0,63.217-28.321,63.217-63.216V91.663C440.603,51.982,399.259,0,256.002,0z M189.091,56.987h133.815c8.888,0,16.106,7.21,16.106,16.098c0,8.912-7.218,16.114-16.106,16.114H189.091c-8.889,0-16.098-7.202-16.098-16.114C172.992,64.197,180.201,56.987,189.091,56.987z M160.275,358.439c-11.093,0-20.084-8.991-20.084-20.084c0-11.094,8.991-20.084,20.084-20.084c11.093,0,20.084,8.99,20.084,20.084C180.358,349.448,171.368,358.439,160.275,358.439z M241.943,239.278H134.731v-98.064h107.212V239.278z M351.737,358.439c-11.094,0-20.084-8.991-20.084-20.084c0-11.094,8.99-20.084,20.084-20.084c11.092,0,20.084,8.99,20.084,20.084C371.821,349.448,362.829,358.439,351.737,358.439z M382.047,239.278H270.061v-98.064h111.986V239.278z" />
      </g>
    </svg>
  );
}

export function ExclaimAlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="-0.5 0 25 25" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10.8809 16.15C10.8809 16.0021 10.9101 15.8556 10.967 15.7191C11.024 15.5825 11.1073 15.4586 11.2124 15.3545C11.3175 15.2504 11.4422 15.1681 11.5792 15.1124C11.7163 15.0567 11.8629 15.0287 12.0109 15.03C12.2291 15.034 12.4413 15.1021 12.621 15.226C12.8006 15.3499 12.9399 15.5241 13.0211 15.7266C13.1024 15.9292 13.122 16.1512 13.0778 16.3649C13.0335 16.5786 12.9272 16.7745 12.7722 16.9282C12.6172 17.0818 12.4204 17.1863 12.2063 17.2287C11.9922 17.2711 11.7703 17.2494 11.5685 17.1663C11.3666 17.0833 11.1938 16.9426 11.0715 16.7618C10.9492 16.5811 10.8829 16.3683 10.8809 16.15ZM11.2408 13.42L11.1008 8.20001C11.0875 8.07453 11.1008 7.94766 11.1398 7.82764C11.1787 7.70761 11.2424 7.5971 11.3268 7.5033C11.4112 7.40949 11.5144 7.33449 11.6296 7.28314C11.7449 7.2318 11.8697 7.20526 11.9958 7.20526C12.122 7.20526 12.2468 7.2318 12.3621 7.28314C12.4773 7.33449 12.5805 7.40949 12.6649 7.5033C12.7493 7.5971 12.813 7.70761 12.8519 7.82764C12.8909 7.94766 12.9042 8.07453 12.8909 8.20001L12.7609 13.42C12.7609 13.6215 12.6809 13.8149 12.5383 13.9574C12.3958 14.0999 12.2024 14.18 12.0009 14.18C11.7993 14.18 11.606 14.0999 11.4635 13.9574C11.321 13.8149 11.2408 13.6215 11.2408 13.42Z"
        fill="currentColor"
      />
      <path
        d="M12 21.5C17.1086 21.5 21.25 17.3586 21.25 12.25C21.25 7.14137 17.1086 3 12 3C6.89137 3 2.75 7.14137 2.75 12.25C2.75 17.3586 6.89137 21.5 12 21.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CommuteOriginIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="4.5" />
    </svg>
  );
}

export function CommuteDestinationPinIcon({ className }: { className?: string }) {
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

export function CommuteConnectingDots({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 4 15" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2" r="1.15" />
      <circle cx="2" cy="7.5" r="1.15" />
      <circle cx="2" cy="13" r="1.15" />
    </svg>
  );
}

export function AccountNetworkBadge({ networkId }: { networkId: NetworkId }) {
  return (
    <span className={`account-network-badge ${networkId}`}>
      {networkId === "regional" ? "GO & UP" : "TTC"}
    </span>
  );
}

export function severityPriority(severity: AccountCommuteImpact["severity"]) {
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

export function commuteLegs(commute: AccountSavedCommute) {
  return commuteLegsForCommute(commute);
}

export function commuteWorstSeverity(commute: AccountSavedCommute) {
  return commuteLegs(commute)
    .map((leg) => leg.impact.severity)
    .sort((a, b) => severityPriority(b) - severityPriority(a))[0] ?? "clear";
}

export function commuteTone(commute: AccountSavedCommute) {
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

export function commuteStatusLabel(commute: AccountSavedCommute) {
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

export function currentImpactCount(legs: AccountCommuteLeg[]) {
  return legs
    .flatMap((leg) => leg.impact.matchedImpacts)
    .filter((impact) => impact.status === "current" && !impact.ignoredByRule).length;
}

export function ignoredCurrentImpactCount(legs: AccountCommuteLeg[]) {
  return legs
    .flatMap((leg) => leg.impact.matchedImpacts)
    .filter((impact) => impact.status === "current" && impact.ignoredByRule).length;
}

export function legIsClearByFilters(leg: AccountCommuteLeg) {
  return leg.impact.status === "clear" && ignoredCurrentImpactCount([leg]) > 0;
}

export function ImpactIcon({
  kind,
  activeClosure = false,
  className,
}: {
  kind: AccountMatchedImpact["kind"];
  activeClosure?: boolean;
  className?: string;
}) {
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

export function impactKindLabel(kind: AccountMatchedImpact["kind"], activeClosure = false) {
  switch (kind) {
    case "reduced-speed-zone":
      return "Reduced Speed Zone";
    case "planned-closure":
      return activeClosure ? "Active Closure" : "Planned Advisory";
    case "suspension":
      return "Suspension";
    case "delay":
    default:
      return "Delay";
  }
}

export const IMPACT_KIND_ORDER: AccountMatchedImpact["kind"][] = [
  "suspension",
  "delay",
  "reduced-speed-zone",
  "planned-closure",
];

export function impactKindCountLabel(kind: AccountMatchedImpact["kind"], count: number) {
  const label = count !== 1 && kind === "planned-closure"
    ? "Planned Advisories"
    : `${impactKindLabel(kind)}${count === 1 ? "" : "s"}`;
  return `${count} ${label}`;
}

export function summarizeMatchedImpacts(impacts: AccountMatchedImpact[]) {
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

export function impactLineLabel(impact: AccountMatchedImpact) {
  if (!impact.lineNumber) return "Station";
  return impact.lineId?.startsWith("regional-") ? regionalLineLabel(impact.lineId) : `Line ${impact.lineNumber}`;
}

export type TravelTimeSeverity = "good" | "decent" | "moderate" | "poor" | "severe";

export function travelTimeSeverity(estimate: AccountCommuteTravelTimeEstimate): TravelTimeSeverity {
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

export function fallbackTravelTimeEstimate(leg: AccountCommuteLeg): AccountCommuteTravelTimeEstimate {
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

export function TravelTimeEstimateBlock({ leg }: { leg: AccountCommuteLeg }) {
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
            <em className="saved-commute-time-verdict">
              {formatEstimateRange(estimate.estimatedLowSeconds, estimate.estimatedHighSeconds)}
            </em>
          </span>
          <span>
            <strong>Extra Time</strong>
            <em className="saved-commute-time-verdict">
              {formatExtraTimeRange(estimate.extraLowSeconds, estimate.extraHighSeconds)}
            </em>
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

export interface SavedCommuteCardProps {
  commute: AccountSavedCommute;
  selectedLegId: AccountCommuteLegId;
  onToggleLeg: (commuteId: string, nextLegId: AccountCommuteLegId, currentLegId: AccountCommuteLegId) => void;
  isUserToggled: boolean;
  toggleCount: number;
  onClearSwapAnimation: (commuteId: string) => void;
  stationNameFor: (stationId: string, commuteNetworkId: NetworkId) => string;
  viewedCommuteId?: string | null;
  onViewPath: (commute: AccountSavedCommute, legId?: AccountCommuteLegId) => void;
  onViewImpactOnPath: (commute: AccountSavedCommute, legId: AccountCommuteLegId, impact: AccountMatchedImpact) => void;
  stopsExpanded: boolean;
  onToggleStops: (commuteId: string) => void;
  isDisclosureOpen: boolean;
  onToggleDisclosure: (key: string, isOpen: boolean) => void;
  notificationDraft?: AccountSavedCommuteNotificationRule;
  onNotificationDraftChange: (commuteId: string, rule: AccountSavedCommuteNotificationRule) => void;
  isEditingNotificationRule: boolean;
  onStartEditingNotificationRule: (commute: AccountSavedCommute) => void;
  onCloseEditingNotificationRule: () => void;
  onSaveNotificationRule: (commute: AccountSavedCommute) => void;
  isSavingNotificationRule: boolean;
  notificationRuleError?: string | null;
  onStartEditingRoute: (commute: AccountSavedCommute) => void;
}

export function SavedCommuteCard({
  commute,
  selectedLegId,
  onToggleLeg,
  isUserToggled,
  toggleCount,
  onClearSwapAnimation,
  stationNameFor,
  viewedCommuteId,
  onViewPath,
  onViewImpactOnPath,
  stopsExpanded,
  onToggleStops,
  isDisclosureOpen,
  onToggleDisclosure,
  notificationDraft,
  onNotificationDraftChange,
  isEditingNotificationRule,
  onStartEditingNotificationRule,
  onCloseEditingNotificationRule,
  onSaveNotificationRule,
  isSavingNotificationRule,
  notificationRuleError,
  onStartEditingRoute,
}: SavedCommuteCardProps) {
  const legs = commuteLegs(commute);
  const selectedLeg = legs.find((leg) => leg.id === selectedLegId) ?? legs[0];
  const routeStops = selectedLeg.path.stationIds;
  const canViewPath = selectedLeg.path.status === "available" && selectedLeg.path.segmentIds.length > 0;
  const selectedPreview = commutePathPreviewFromCommute(commute, selectedLeg.id);
  const viewingPath = Boolean(selectedPreview && viewedCommuteId === selectedPreview.id);
  const notificationRule = ruleForCommute(commute);
  const activeNotificationDraft = notificationDraft ?? notificationRule;
  const notificationRuleStatus = notificationRule.enabled ? "On" : "Off";
  const selectedTravelTimeEstimate = selectedLeg.impact.travelTimeEstimate ?? fallbackTravelTimeEstimate(selectedLeg);
  const selectedTravelTimeSeverity = travelTimeSeverity(selectedTravelTimeEstimate);
  const travelTimeHeadline = formatTravelTimeHeadline(selectedTravelTimeEstimate);
  const selectedLegClearByFilters = legIsClearByFilters(selectedLeg);
  const selectedLegImpactSummary = summarizeMatchedImpacts(selectedLeg.impact.matchedImpacts);
  const disclosureKey = `${commute.id}-${selectedLeg.id}`;

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

  const originStationName =
    selectedLeg.fromStationName || commute.originStationName || stationNameFor(commute.originStationId, commute.networkId ?? "ttc");
  const destinationStationName =
    selectedLeg.toStationName || commute.destinationStationName || stationNameFor(commute.destinationStationId, commute.networkId ?? "ttc");

  const renderedMatchedImpacts: ReactNode[] = [];
  for (const impact of selectedLeg.impact.matchedImpacts) {
    renderedMatchedImpacts.push(
      <li key={`${impact.kind}-${impact.id}`} className={impact.ignoredByRule ? "saved-commute-impact-ignored" : undefined}>
        <span className="saved-commute-impact-icon" aria-hidden="true">
          <ImpactIcon
            kind={impact.kind}
            activeClosure={impact.kind === "planned-closure" && impact.status === "current"}
            className="shrink-0"
          />
        </span>
        <div className="saved-commute-impact-copy">
          <div className="saved-commute-impact-details">
            <div className="saved-commute-impact-heading">
              <strong className="text-slate-800 dark:text-slate-200">
                <span className="saved-commute-impact-kind-label">
                  {impact.serviceEffect === "limited-service" ? impact.status === "planned" ? "Planned limited service" : "Limited service" : toTitleCase(impactKindLabel(impact.kind, impact.kind === "planned-closure" && impact.status === "current"))}
                </span>
                {impact.ignoredByRule ? (
                  <em className="saved-commute-impact-filter-note">(Ignored by Route Filter)</em>
                ) : null}
              </strong>
            </div>
            <span className="text-slate-600 dark:text-slate-400">
              {toTitleCase(impactLineLabel(impact))}
              {impact.location ? <>: <IncidentStationSpan location={toTitleCase(impact.location)} /></> : null}
              {impact.displayDirection ? ` (${toTitleCase(impact.displayDirection)})` : ""}
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
      </li>,
    );
  }

  return (
    <div
      id={`commute-card-${commute.id}`}
      data-commute-card-id={commute.id}
      className={`commute-card ${commuteTone(commute)} min-w-0 max-w-full w-full rounded-lg border-2 border-transparent !bg-slate-50 p-3 dark:border-transparent dark:!bg-[#12151c]`}
    >
      <div className="min-w-0 max-w-full w-full">
        <div className="saved-commute-card-header">
          <div className="saved-commute-card-identity">
            <div className="min-w-0 flex-1">
              <h3 className="min-w-0 flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">
                <Route
                  size={15}
                  aria-hidden="true"
                  className="saved-commute-title-icon shrink-0 text-[#0284c7] dark:text-logo-blue"
                />
                <span>{commute.label}</span>
              </h3>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <AccountNetworkBadge networkId={commute.networkId ?? "ttc"} />
                <span className={`status-pill ${commuteTone(commute)}`}>{toTitleCase(commuteStatusLabel(commute))}</span>
              </div>
            </div>
          </div>
          <div className={`saved-commute-current-impact-badge rounded-full font-bold uppercase tracking-wider shrink-0 ${impactBgColor}`}>
            {hasCurrentImpacts || ignoredImpactsCount > 0 ? (
              <ExclaimAlertIcon className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />
            )}
            <span>{impactText}</span>
          </div>
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
                      onClearSwapAnimation(commute.id);
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
                      onClearSwapAnimation(commute.id);
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
                  onClick={() => onToggleLeg(commute.id, leg.id, selectedLeg.id)}
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
                  onToggleDisclosure(disclosureKey, false);
                }, 220);
              }
            }}
            onToggle={(event) => {
              onToggleDisclosure(disclosureKey, event.currentTarget.open);
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
            onClick={() => (isEditingNotificationRule ? onCloseEditingNotificationRule() : onStartEditingNotificationRule(commute))}
            aria-expanded={isEditingNotificationRule}
          >
            {isEditingNotificationRule ? "Close" : "Edit Alerts"}
          </button>
        </div>

        {isEditingNotificationRule ? (
          <div className="saved-commute-rule-editor">
            <SavedCommuteNotificationRuleEditor
              rule={activeNotificationDraft}
              onChange={(rule) => onNotificationDraftChange(commute.id, rule)}
              allowReturnLeg={commute.watchReturnTrip}
              networkId={commute.networkId ?? "ttc"}
            />
            {notificationRuleError ? (
              <p className="text-xs font-semibold text-red-600 dark:text-red-300">{notificationRuleError}</p>
            ) : null}
            <div className="saved-commute-rule-actions">
              <button
                type="button"
                onClick={() => onSaveNotificationRule(commute)}
                disabled={isSavingNotificationRule}
                aria-busy={isSavingNotificationRule}
              >
                {isSavingNotificationRule ? "Saving" : "Save Alerts"}
              </button>
              <button type="button" onClick={onCloseEditingNotificationRule}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="commute-route-actions">
          <button
            type="button"
            className="commute-route-stop-toggle commute-route-edit-button"
            onClick={() => onStartEditingRoute(commute)}
            aria-label={`Edit commute ${commute.label}`}
          >
            <SquarePen size={16} aria-hidden="true" />
            <span className="commute-action-label-full">Edit Route</span>
            <span className="commute-action-label-short" aria-hidden="true">Edit</span>
          </button>
          <button
            type="button"
            className="commute-route-stop-toggle"
            onClick={() => onToggleStops(commute.id)}
            aria-expanded={stopsExpanded}
            aria-controls={`commute-stops-${commute.id}`}
            disabled={routeStops.length === 0}
            aria-label={stopsExpanded ? `Hide stops for ${commute.label}` : `View ${routeStops.length} stops for ${commute.label}`}
          >
            <span className="commute-action-label-full">{stopsExpanded ? "Hide Stops" : `View ${routeStops.length} Stops`}</span>
            <span className="commute-action-label-short" aria-hidden="true">{stopsExpanded ? "Hide stops" : `${routeStops.length} stops`}</span>
            <ChevronDown size={16} aria-hidden="true" className={`transition-transform duration-200 ${stopsExpanded ? "rotate-180" : ""}`} />
          </button>
          <button
            type="button"
            className="saved-commute-map-action commute-route-map-button"
            onClick={() => onViewPath(commute, selectedLeg.id)}
            disabled={!canViewPath}
            aria-pressed={viewingPath}
            aria-label={viewingPath ? `Viewing on map for ${commute.label}` : `View on map for ${commute.label}`}
          >
            <MapPinned size={14} aria-hidden="true" />
            <span className="commute-action-label-full">{viewingPath ? "Viewing on Map" : "View on Map"}</span>
            <span className="commute-action-label-short" aria-hidden="true">{viewingPath ? "Viewing on Map" : "View on Map"}</span>
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
                {selectedLeg.path.transferStationIds.includes(stationId) ? <strong>Transfer</strong> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
