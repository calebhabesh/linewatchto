"use client";

import { FilterSearchRow } from "./FilterSearchRow";

import { Fragment, startTransition, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AlertCircle, ArrowDownToLine, Bookmark, CalendarCheck2, ChevronDown, ChevronRight, FileText, Layers, LoaderCircle, MapPin, Plus, Search, Train, X } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import type { AccountSavedStation } from "../app/saved-station-data";
import type { AccountState } from "../app/account-data";
import { filterAndSortSavedStations, summarizeSavedStationStatuses } from "../app/saved-stations";
import {
  ARRIVAL_COUNTDOWN_TICK_MS,
  formatArrivalClockTime,
  formatArrivalSourceBadgeLabel,
  formatArrivalSourceSummary,
  formatArrivalTileLabel,
  groupStationArrivals,
  isArrivalDue,
  shouldUseDetailedArrivalCountdown,
} from "../app/station-arrivals";
import { getStationDetail, isLrtOnlyStation, isSubwayAndLrtStation, preserveStationDetailOnRefresh, type StationDataResult, type StationDetail, type StationSummary } from "../app/station-data";
import { stationImpactKindsByStation, stationImpactSelection, stationImpactSelectionsByStation } from "../app/station-impact-types";
import { DataProvider, useDashboardData, type DashboardData } from "../app/DataContext";
import { REGIONAL_ROUTE_DEFINITIONS, type NetworkId, type RegionalRouteCode } from "../app/regional-data";
import {
  formatRegionalArrivalCoachCount,
  formatRegionalArrivalClockTime,
  formatRegionalDestinationName,
  getRegionalStationArrivals,
  groupRegionalStationArrivals,
  isRegionalArrivalDue,
  isRegionalArrivalSoon,
  preserveRegionalArrivalsOnRefresh,
  regionalArrivalTimeDisplay,
  shouldShowRegionalArrivalDelay,
  shouldUseDetailedRegionalArrivalCountdown,
  type RegionalArrivalDataResult,
} from "../app/regional-arrivals";
import {
  getAccessibilityOutages,
  type AccessibilityOutageDetail,
  type AccessibilityOutageResponse,
} from "../app/accessibility-outage-data";
import { ToolbarSelectMenu, type ToolbarSelectOption } from "./ImpactListToolbar";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { TransitLineBadge, transitLineBadgeColors } from "./TransitLineBadge";
import { StationImpactTypeBadges } from "./StationImpactTypeBadges";
import { StationOutageBadge } from "./StationOutageBadge";
import { ArrivalLinePinButton } from "./ArrivalLinePinButton";
import { LiveSignalIcon } from "./LiveSignalIcon";
import { AccountAvailabilityNotice } from "./AccountAvailabilityNotice";
import { ArrivalTileSourceIndicator } from "./ArrivalTileSourceIndicator";
import { sortArrivalGroupsByPinnedLine } from "../app/arrival-pins";
import { useArrivalLinePins } from "../hooks/useArrivalLinePins";
import { SurfaceConnectionsSection } from "./SurfaceConnectionsSection";
import { RegionalArrivalDelayBadge } from "./RegionalArrivalDelayBadge";

type Props = {
  accountState?: AccountState;
  savedStations: AccountSavedStation[];
  stationCatalogs: Record<NetworkId, StationSummary[]>;
  dashboards: Record<NetworkId, DashboardData>;
  activeNetwork: NetworkId;
  loading: boolean;
  error: string | null;
  pendingStationIds: Set<string>;
  onSave: (stationId: string, networkId: NetworkId) => Promise<boolean>;
  onRemove: (stationId: string, networkId: NetworkId) => Promise<boolean>;
  onSelectStation: (stationId: string, networkId: NetworkId) => void;
  onSelectImpactDetails: (selection: NonNullable<ImpactSelection>, networkId: NetworkId) => void;
  onSelectAccessibilityOutageDetails: (assetType: "elevator" | "escalator", stationId: string, networkId: NetworkId) => void;
  expandedDisruptionStationIds: Set<string>;
  onDisruptionExpandedChange: (stationId: string, expanded: boolean) => void;
  onRetry: () => void;
  onBack: () => void;
  onClose: () => void;
  onRequestSignIn?: () => void;
  onRequestCreateAccount?: () => void;
  /** Increment to imperatively reset the panel to list mode (e.g. from the toast button). */
  listModeEpoch?: number;
};

type AccountNetworkFilter = "all" | NetworkId;

const ACCOUNT_NETWORK_OPTIONS: Array<{ value: AccountNetworkFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "ttc", label: "TTC" },
  { value: "regional", label: "GO & UP" },
];

function AccountNetworkBadge({ networkId }: { networkId: NetworkId }) {
  return <span className={`account-network-badge ${networkId}`}>{networkId === "regional" ? "GO & UP" : "TTC"}</span>;
}

const LINES = [
  { id: "line-1", number: "1", name: "Yonge-University", color: "#F8C300", text: "#111827" },
  { id: "line-2", number: "2", name: "Bloor-Danforth", color: "#00923F", text: "#ffffff" },
  { id: "line-4", number: "4", name: "Sheppard", color: "#A21A68", text: "#ffffff" },
  { id: "line-5", number: "5", name: "Eglinton Crosstown", color: "#EB8738", text: "#111827" },
  { id: "line-6", number: "6", name: "Finch West", color: "#969594", text: "#111827" },
  ...REGIONAL_ROUTE_DEFINITIONS.map((line) => ({
    id: line.id,
    number: line.number,
    name: line.name,
    color: line.color,
    text: "#ffffff",
  })),
] as const;

const SAVED_STATION_DETAIL_REFRESH_MS = 15_000;

type SavedStationDisruptionKind = ImpactKind | "active-closure" | "elevator" | "escalator";

const SAVED_STATION_OUTAGE_ICON_SRC = {
  elevator: "/assets/linewatch/outages/elevator.svg",
  escalator: "/assets/linewatch/outages/escalator.svg",
} as const;

function disruptionKindLabel(kind: SavedStationDisruptionKind) {
  switch (kind) {
    case "suspension": return "Suspension";
    case "delay": return "Delay";
    case "reduced-speed-zone": return "Reduced Speed Zone";
    case "planned-closure": return "Planned Closure";
    case "active-closure": return "Active Closure";
    case "elevator": return "Elevator Outage";
    case "escalator": return "Escalator Outage";
  }
}

function disruptionKindCountLabel(kind: SavedStationDisruptionKind, count: number) {
  const label = disruptionKindLabel(kind);
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function disruptionKindClassName(kind: SavedStationDisruptionKind) {
  return kind === "active-closure" ? "suspension" : kind;
}

function DisruptionIcon({ kind, size = 13 }: { kind: SavedStationDisruptionKind; size?: number }) {
  if (kind === "elevator" || kind === "escalator") {
    return (
      <span className="saved-station-outage-icon" style={{ width: size, height: size }} aria-hidden="true">
        <Image src={SAVED_STATION_OUTAGE_ICON_SRC[kind]} alt="" width={size} height={size} />
        <span className="saved-station-outage-icon-mark">×</span>
      </span>
    );
  }

  if (kind === "active-closure") {
    return <ImpactTypeIcon kind="suspension" size={size} />;
  }

  return <ImpactTypeIcon kind={kind} size={size} />;
}

function stationImpactContext(
  impactId: string,
  stationName: string,
  dashboard: ReturnType<typeof useDashboardData>,
) {
  const match = dashboard.reducedSpeedZones.find((impact) => impact.id === impactId || impact.sourceAlertIds.includes(impactId))
    ?? dashboard.activeAlerts.find(
      (impact) => impact.id === impactId || impact.relatedPlannedClosureId === impactId,
    )
    ?? dashboard.delays.find((impact) => impact.id === impactId)
    ?? dashboard.plannedClosures.find((impact) => impact.id === impactId);

  if (!match) return `Station: ${stationName}`;
  return `Line ${match.lineNumber}: ${match.location}${match.displayDirection ? ` (${match.displayDirection})` : ""}`;
}

function StationLineBadges({ lineIds }: { lineIds: string[] }) {
  return (
    <span className="my-stations-line-badges" aria-label={lineIds.map((id) => `Line ${id.replace("line-", "")}`).join(", ")}>
      {lineIds.map((id) => {
        const line = LINES.find((candidate) => candidate.id === id);
        if (!line) return null;
        return <TransitLineBadge key={id} lineId={id} lineNumber={line.number} size={28} decorative />;
      })}
    </span>
  );
}

function stationState(station: StationSummary) {
  const counts = station.accessOutageCounts ?? { elevator: 0, escalator: 0 };
  const outageCount = counts.elevator + counts.escalator;
  const impactCount = (station.hasActiveImpact ? 1 : 0)
    + (outageCount > 0 ? outageCount : station.accessStatus === "outage" ? 1 : 0);
  return {
    count: impactCount,
    label: impactCount > 0 ? `${impactCount} Impact${impactCount === 1 ? "" : "s"}` : "No Impacts",
    tone: impactCount > 0 ? "impact" : "clear",
  };
}

function PickerStationConditions({ station, impactKinds }: { station: StationSummary; impactKinds: ImpactKind[] }) {
  const outageCounts = station.accessOutageCounts ?? { elevator: 0, escalator: 0 };
  const hasConditions = impactKinds.length > 0 || outageCounts.elevator > 0 || outageCounts.escalator > 0;

  if (!hasConditions) {
    return null;
  }

  return (
    <span className="my-stations-picker-conditions">
      <StationImpactTypeBadges kinds={impactKinds} />
      {outageCounts.elevator > 0 ? (
        <StationOutageBadge assetType="elevator" count={outageCounts.elevator} />
      ) : null}
      {outageCounts.escalator > 0 ? (
        <StationOutageBadge assetType="escalator" count={outageCounts.escalator} />
      ) : null}
    </span>
  );
}

function formatCondensedArrivalDirection(directionLabel: string) {
  const match = directionLabel.match(/^(Northbound|Southbound|Eastbound|Westbound)\s+to\s+(.+)$/i);
  if (!match) return { direction: directionLabel, destination: null };
  return { direction: match[1], destination: `To ${match[2]}` };
}
function formatArrivalLineHeaderLabel(lineNumber: string, lineName?: string): string {
  if (!lineName) return `Line ${lineNumber}`;
  if (!isNaN(Number(lineNumber))) return `Line ${lineNumber} - ${lineName}`;
  return lineName;
}

function arrivalSourceBadgeClassName(label: string) {
  const base = "inline-flex h-[20px] shrink-0 items-center rounded border px-1.5 text-[9.5px] font-black uppercase tracking-wide leading-none";
  if (label === "Live") {
    return `${base} border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200`;
  }
  if (label === "Scheduled") {
    return "inline-flex h-[18.5px] shrink-0 items-center rounded border px-1.25 text-[8.5px] font-black uppercase tracking-wide leading-none border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300";
  }
  if (label === "Mixed") {
    return "inline-flex h-[18.5px] shrink-0 items-center rounded border px-1.25 text-[8.5px] font-black uppercase tracking-wide leading-none border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200";
  }
  if (label === "No live ETA") {
    return "inline-flex h-[18.5px] shrink-0 items-center rounded border px-1.25 text-[8.5px] font-black uppercase tracking-wide leading-none border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300";
  }
  if (label === "Demo") {
    return `${base} border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-200`;
  }
  return `${base} border-slate-400/30 bg-slate-500/5 text-slate-500 dark:text-slate-400`;
}

function regionalArrivalSourceBadgeClassName(label: string) {
  const base = "inline-flex h-[20px] shrink-0 items-center rounded border px-1.5 text-[9.5px] font-black uppercase tracking-wide leading-none";
  if (label === "Live") {
    return `${base} border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200`;
  }
  if (label === "Scheduled") {
    return "inline-flex h-[18.5px] shrink-0 items-center rounded border px-1.25 text-[8.5px] font-black uppercase tracking-wide leading-none border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300";
  }
  if (label === "Mixed") {
    return "inline-flex h-[18.5px] shrink-0 items-center rounded border px-1.25 text-[8.5px] font-black uppercase tracking-wide leading-none border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200";
  }
  return `${base} border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200`;
}

function SavedStationRow({
  saved,
  detailResult,
  regionalArrivalResult,
  regionalAccessibilityOutages,
  regionalDataLoaded,
  arrivalTick,
  pending,
  onOpen,
  onSelectImpactDetails,
  onSelectAccessibilityOutageDetails,
  disruptionExpanded,
  onDisruptionExpandedChange,
  onRemove,
  routeImpactSelections,
}: {
  saved: AccountSavedStation;
  detailResult?: StationDataResult<StationDetail | null>;
  regionalArrivalResult?: RegionalArrivalDataResult;
  regionalAccessibilityOutages: AccessibilityOutageDetail[];
  regionalDataLoaded: boolean;
  arrivalTick: number;
  pending: boolean;
  onOpen: () => void;
  onSelectImpactDetails: (selection: NonNullable<ImpactSelection>) => void;
  onSelectAccessibilityOutageDetails: (assetType: "elevator" | "escalator", stationId: string) => void;
  disruptionExpanded: boolean;
  onDisruptionExpandedChange: (expanded: boolean) => void;
  onRemove: () => void;
  routeImpactSelections: NonNullable<ImpactSelection>[];
}) {
  const dashboard = useDashboardData();
  const regional = saved.networkId === "regional";
  const { pinnedLineIds, togglePin } = useArrivalLinePins(saved.networkId, saved.station.id);
  const [hoveredPinLineId, setHoveredPinLineId] = useState<string | null>(null);

  const detail = detailResult?.data ?? null;
  const directlyLinkedImpacts = detail?.impacts.filter((impact) =>
    impact.type === "active-alert" || impact.type === "planned-closure"
  ) ?? [];
  const impactCandidates = [
    ...directlyLinkedImpacts.map((impact) => ({ impactId: impact.id, impact, selection: stationImpactSelection(impact.id, dashboard) })),
    ...routeImpactSelections.map((selection) => ({ impactId: selection.id, impact: null, selection })),
  ];
  const classifiedActiveImpacts = Array.from(new Map(impactCandidates.map(({ impactId, impact, selection }) => {
    const kind = (dashboard.activeAlerts.some(
      (alert) => alert.severity === "planned"
        && (alert.id === impactId || alert.relatedPlannedClosureId === impactId || alert.id === selection?.id),
    )
      ? "active-closure"
      : selection?.kind
        ?? (impact?.severity === "planned" ? "planned-closure" : impact?.severity)) as SavedStationDisruptionKind;
    return [selection ? `${selection.kind}|${selection.id}` : impactId, { impactId, kind, selection }] as const;
  })).values());
  const accessOutages = regional
    ? regionalAccessibilityOutages.filter((outage): outage is AccessibilityOutageDetail & { assetType: "elevator" | "escalator" } =>
        outage.assetType === "elevator" || outage.assetType === "escalator")
    : detail?.access.outages ?? [];
  const disruptionCount = classifiedActiveImpacts.length + accessOutages.length;
  const displayedDisruptionCount = detail ? disruptionCount : stationState(saved.station).count;
  const disruptionSummary = (() => {
    const counts = new Map<SavedStationDisruptionKind, number>();
    for (const { kind } of classifiedActiveImpacts) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    for (const outage of accessOutages) counts.set(outage.assetType, (counts.get(outage.assetType) ?? 0) + 1);
    const order: SavedStationDisruptionKind[] = ["suspension", "active-closure", "delay", "reduced-speed-zone", "planned-closure", "elevator", "escalator"];
    return order.flatMap((kind) => counts.has(kind) ? [{ kind, count: counts.get(kind) ?? 0 }] : []);
  })();
  const linesForClassification = detail?.lines ?? saved.station.lineIds;
  const isLrt = isLrtOnlyStation(linesForClassification);
  const isSubwayAndLrt = isSubwayAndLrtStation(linesForClassification);
  const arrivalHeading = isSubwayAndLrt ? "Train & LRT Arrivals" : isLrt ? "LRT Arrivals" : "Train Arrivals";
  const hasUnavailableArrivals = detail?.arrivals.some((arrival) => arrival.status === "unavailable") ?? false;
  const hasLiveArrivals = detail?.arrivals.some((arrival) => arrival.status === "live") ?? false;
  const arrivalGroups = sortArrivalGroupsByPinnedLine(detail && !dashboard.snapshot && !hasUnavailableArrivals
    ? groupStationArrivals(detail.arrivals, detail.lines, {
        stationId: detail.id,
        maxArrivalsPerDirection: 3,
        includeEmptyDirections: hasLiveArrivals,
      })
    : [], pinnedLineIds);
  const regionalArrivalSnapshot = dashboard.snapshot ? undefined : regionalArrivalResult?.data;
  const regionalArrivalGroups = sortArrivalGroupsByPinnedLine(regionalArrivalSnapshot
    ? groupRegionalStationArrivals(regionalArrivalSnapshot.arrivals, saved.station.id)
    : [], pinnedLineIds);
  const regionalInformationReady = regionalDataLoaded && Boolean(regionalArrivalSnapshot);

  const arrivalLineSections: {
    lineId: string;
    lineNumber: string;
    lineName?: string;
    groups: typeof arrivalGroups;
  }[] = [];
  for (const group of arrivalGroups) {
    let section = arrivalLineSections.find((s) => s.lineId === group.lineId);
    if (!section) {
      section = {
        lineId: group.lineId,
        lineNumber: group.lineNumber,
        lineName: group.line?.name,
        groups: [],
      };
      arrivalLineSections.push(section);
    }
    section.groups.push(group);
  }

  const regionalLineSections: {
    lineId: string;
    lineNumber: string;
    lineName?: string;
    groups: typeof regionalArrivalGroups;
  }[] = [];
  for (const group of regionalArrivalGroups) {
    let section = regionalLineSections.find((s) => s.lineId === group.lineId);
    if (!section) {
      section = {
        lineId: group.lineId,
        lineNumber: group.lineNumber,
        lineName: group.lineName,
        groups: [],
      };
      regionalLineSections.push(section);
    }
    section.groups.push(group);
  };

  return (
    <article className={`my-stations-row min-w-0 max-w-full w-full rounded-lg !bg-slate-50 dark:!bg-[#12151c] p-0 saved-station-rich-row ${displayedDisruptionCount > 0 ? "is-affected" : "is-clear"}`}>
      <div className="saved-station-rich-heading">
        <button type="button" className="my-stations-row-main" onClick={onOpen}>
          <span className="my-stations-row-copy">
            <span className="my-stations-row-heading">
              <strong>{saved.station.name}</strong>
              <StationLineBadges lineIds={saved.station.lineIds} />
            </span>
            <span className="my-stations-row-badges">
              <AccountNetworkBadge networkId={saved.networkId} />
            </span>
          </span>
          <span className="saved-station-open-action">
            <span>Open Station</span>
            <ChevronRight size={18} aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          className="my-stations-bookmark saved"
          onClick={onRemove}
          disabled={pending}
          aria-pressed="true"
          aria-label={`Remove ${saved.station.name} from My Stations`}
        >
          <Bookmark size={20} fill="currentColor" aria-hidden="true" />
        </button>
      </div>

      {regional ? !regionalInformationReady ? (
        <div className="saved-station-detail-loading" role="status">
          <LoaderCircle size={15} aria-hidden="true" />
          Loading station information...
        </div>
      ) : (
        <div className="saved-station-rich-content">
          <details
            className={`saved-commute-impact-disclosure saved-station-disruption-disclosure${disruptionCount === 0 ? " is-clear" : ""}`}
            open={disruptionExpanded}
            onToggle={(event) => onDisruptionExpandedChange(event.currentTarget.open)}
          >
            <summary className="saved-commute-impact-summary saved-station-disruption-summary">
              <span className="saved-commute-impact-summary-heading saved-station-disruption-heading saved-station-section-title">
                {disruptionCount > 0 ? <AlertCircle className="saved-commute-impact-summary-icon" size={18} aria-hidden="true" /> : <span className="saved-station-clear-dot" aria-hidden="true" />}
                <strong>{disruptionCount > 0 ? "Active Disruptions" : "No Active Disruptions"}</strong>
                <span className={`desktop-menu-count-badge saved-commute-impact-total saved-station-disruption-total${disruptionCount > 0 ? " is-affected" : ""}`}>{disruptionCount}</span>
              </span>
              {disruptionCount > 0 ? (
                <span className="saved-commute-impact-summary-chips saved-station-disruption-chips">
                  {disruptionSummary.map(({ kind, count }) => (
                    <span key={kind} className={`saved-commute-impact-summary-chip kind-${disruptionKindClassName(kind)}`}>
                      <DisruptionIcon kind={kind} size={16} />
                      {disruptionKindCountLabel(kind, count)}
                    </span>
                  ))}
                </span>
              ) : null}
              <span className="saved-commute-impact-summary-action saved-station-disruption-action">
                <span className="saved-commute-impact-summary-action-collapsed">List View</span>
                <span className="saved-commute-impact-summary-action-expanded">Hide List</span>
                <ChevronDown className="saved-commute-impact-summary-chevron" size={16} aria-hidden="true" />
              </span>
            </summary>
            {disruptionCount > 0 ? (
              <ul className="saved-commute-impact-list saved-station-disruption-list">
                {classifiedActiveImpacts.map(({ impactId, kind, selection }) => (
                  <li key={selection ? `${selection.kind}-${selection.id}` : impactId} className={`kind-${disruptionKindClassName(kind)}`}>
                    <span className="saved-commute-impact-icon" aria-hidden="true"><DisruptionIcon kind={kind} size={15} /></span>
                    <div className="saved-commute-impact-copy">
                      <div className="saved-commute-impact-details">
                        <div className="saved-commute-impact-heading"><strong><span className="saved-commute-impact-kind-label">{disruptionKindLabel(kind)}</span></strong></div>
                        <span>{stationImpactContext(selection?.id ?? impactId, saved.station.name, dashboard)}</span>
                      </div>
                      <div className="saved-commute-impact-action">
                        <button
                          type="button"
                          className="saved-commute-map-action saved-commute-impact-map-button"
                          onClick={() => selection ? onSelectImpactDetails(selection) : onOpen()}
                          aria-label={`View ${saved.station.name} alert details`}
                        >
                          <FileText size={12} aria-hidden="true" /> View Details
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
                {accessOutages.map((outage) => (
                  <li key={outage.id} className={`kind-${disruptionKindClassName(outage.assetType)}`}>
                    <span className="saved-commute-impact-icon" aria-hidden="true"><DisruptionIcon kind={outage.assetType} size={15} /></span>
                    <div className="saved-commute-impact-copy">
                      <div className="saved-commute-impact-details">
                        <div className="saved-commute-impact-heading"><strong><span className="saved-commute-impact-kind-label">{disruptionKindLabel(outage.assetType)}</span></strong></div>
                      </div>
                      <div className="saved-commute-impact-action">
                        <button
                          type="button"
                          className="saved-commute-map-action saved-commute-impact-map-button"
                          onClick={() => onSelectAccessibilityOutageDetails(outage.assetType, saved.station.id)}
                          aria-label={`View ${saved.station.name} ${outage.assetType} outage details`}
                        >
                          <FileText size={12} aria-hidden="true" /> View Details
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="saved-station-disruption-clear-copy">No directly linked service impacts or accessibility outages.</p>}
          </details>

          <section className="saved-station-arrivals" aria-label={`Arrivals at ${saved.station.name}`}>
            <div className="station-arrival-line-divider saved-station-section-divider" aria-hidden="true" />
            <div className="saved-station-arrivals-heading flex flex-col items-start text-left gap-0.5 min-w-0">
              <span className="saved-station-section-title flex items-center justify-start text-left gap-2 min-w-0 font-extrabold text-slate-900 dark:text-white truncate">
                <span className="w-1 h-3.5 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
                <Train size={18} className="shrink-0 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                <strong>Train Arrivals</strong>
              </span>
              <p className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                {regionalArrivalSnapshot?.availability === "available"
                  ? regionalArrivalSnapshot.source
                  : regionalArrivalSnapshot?.availability === "no-service"
                    ? "Published regional schedule"
                    : "Regional arrivals unavailable"}
              </p>
            </div>
            {regionalArrivalSnapshot?.availability === "no-service" ? (
              <p className="saved-station-arrivals-empty">No Scheduled Service</p>
            ) : regionalArrivalSnapshot?.availability !== "available" ? (
              <p className="saved-station-arrivals-empty">Arrival Data Unavailable</p>
            ) : regionalArrivalGroups.length === 0 ? (
              <p className="saved-station-arrivals-empty">No Arrivals Available</p>
            ) : (
              <div className="saved-station-arrival-groups">
                {regionalLineSections.map((section, sectionIndex) => {
                  const showLineDivider = sectionIndex > 0;
                  const isPinned = pinnedLineIds.includes(section.lineId);
                  const isHoveredPin = hoveredPinLineId === section.lineId;
                  const lineBadgeColors = transitLineBadgeColors(section.lineId);
                  const lineColor = lineBadgeColors.backgroundColor;

                  return (
                    <div
                      key={section.lineId}
                      className={`saved-station-arrival-line-section flex flex-col gap-2 rounded-lg px-1 py-1.5 transition-colors duration-200 ${
                        isPinned
                          ? "bg-amber-500/[0.08] dark:bg-amber-400/[0.07]"
                          : isHoveredPin
                            ? "bg-amber-500/[0.03] dark:bg-amber-400/[0.03]"
                            : "bg-transparent"
                      }`}
                      data-arrival-line-section={section.lineId}
                      data-pinned-line={isPinned ? "true" : "false"}
                    >
                      {showLineDivider && (
                        <div className="station-arrival-line-divider saved-station-line-divider" aria-hidden="true" />
                      )}
                      <div className="saved-station-arrival-line-header relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <TransitLineBadge
                            lineId={section.lineId}
                            lineNumber={section.lineNumber}
                            lineName={section.lineName}
                            size={32}
                            className="shrink-0 relative z-10"
                          />
                          <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                            {formatArrivalLineHeaderLabel(section.lineNumber, section.lineName)}
                          </span>
                          {isPinned && (
                            <span
                              className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 shrink-0 select-none animate-in fade-in duration-200"
                              data-pinned-badge
                            >
                              Starred
                            </span>
                          )}
                        </div>
                        <ArrivalLinePinButton
                          compact
                          pinned={isPinned}
                          hovered={isHoveredPin}
                          onHoverChange={(hovered) => setHoveredPinLineId(hovered ? section.lineId : null)}
                          lineLabel={`Line ${section.lineNumber}`}
                          stationName={saved.station.name}
                          onToggle={() => togglePin(section.lineId)}
                        />
                      </div>
                      <div className="flex flex-col gap-2.5">
                        {section.groups.map((group, groupIndex) => {
                          const isFirst = groupIndex === 0;
                          const isLast = groupIndex === section.groups.length - 1;
                          const arrivals = group.platforms
                            .flatMap((platform) => platform.arrivals)
                            .sort((left, right) => left.minutes - right.minutes)
                            .slice(0, 3);
                          const hasLive = arrivals.some((arrival) => arrival.status === "live");
                          const hasScheduled = arrivals.some((arrival) => arrival.status === "scheduled");
                          const sourceLabel = hasLive && hasScheduled ? "Mixed" : hasLive ? "Live" : "Scheduled";

                          return (
                            <article
                              key={group.key}
                              data-regional-arrival-direction={group.directionLabel}
                              data-pinned-line={isPinned ? "true" : "false"}
                              className="relative flex flex-col gap-2 pl-[32px] pt-1 pb-1"
                            >
                              {/* Track spine running continuously behind the platform stop node */}
                              <div
                                aria-hidden="true"
                                className="station-arrival-track-spine"
                                style={{
                                  backgroundColor: lineColor,
                                  left: "16px",
                                  top: isFirst ? "-18px" : "-12px",
                                  bottom: isLast ? "0px" : "-12px",
                                  borderBottomLeftRadius: isLast ? "9999px" : "0",
                                  borderBottomRightRadius: isLast ? "9999px" : "0",
                                }}
                              />

                              <div className="relative flex min-w-0 items-center justify-between gap-3">
                                {/* Platform stop node: absolute to outer row div (no overflow:hidden), left:-16px centers on spine at 32-16=16px from group edge, top:50% vertically centered to the text to the right */}
                                <div
                                  aria-hidden="true"
                                  className="station-arrival-track-node"
                                  style={{
                                    left: "-16px",
                                    top: "50%",
                                    transform: "translate(-50%, -50%)",
                                  }}
                                />
                                <div className="saved-station-arrival-direction min-w-0 flex-1 leading-tight">
                                  <strong className="block truncate text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                                    {group.directionLabel}
                                  </strong>
                                  {group.destinationLabel ? (
                                    <span className="saved-station-arrival-destination flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                      <span className="min-w-0 truncate">{group.destinationLabel}</span>
                                      {group.isTerminating && (
                                        <span className="saved-station-arrival-terminating animate-terminating-blink inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                          <ArrowDownToLine size={9} aria-hidden="true" className="shrink-0" />
                                          Terminating
                                        </span>
                                      )}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="ml-auto flex shrink-0 items-center gap-1.5 self-center">
                                  <span
                                    className={`saved-station-arrival-source ${regionalArrivalSourceBadgeClassName(sourceLabel)}`}
                                    data-arrival-source={sourceLabel.toLowerCase()}
                                  >
                                    {sourceLabel}
                                    {sourceLabel === "Live" ? (
                                      <LiveSignalIcon className="ml-1 inline-block shrink-0 text-emerald-600 dark:text-emerald-300" size={13} />
                                    ) : sourceLabel === "Scheduled" ? (
                                      <CalendarCheck2 className="ml-1 inline-block shrink-0 text-slate-500 dark:text-slate-400 relative -top-px" size={10.5} aria-hidden="true" />
                                    ) : sourceLabel === "Mixed" ? (
                                      <Layers className="ml-1 inline-block shrink-0 text-cyan-600 dark:text-cyan-400 relative -top-px" size={10.5} aria-hidden="true" />
                                    ) : null}
                                  </span>
                                </div>
                              </div>

                              <div className="saved-station-arrival-times mt-1.5 sm:mt-2 grid w-full min-w-0 grid-cols-3 gap-1.5 sm:gap-2">
                                {arrivals.map((arrival, index) => {
                                  const due = isRegionalArrivalDue(arrival, arrivalTick);
                                  const soon = !due && isRegionalArrivalSoon(arrival, arrivalTick);
                                  const delayed = shouldShowRegionalArrivalDelay(arrival, arrivalTick);
                                  const detailed = index === 0
                                    && shouldUseDetailedRegionalArrivalCountdown(arrival, arrivalTick);
                                  const timeDisplay = regionalArrivalTimeDisplay(arrival, arrivalTick, { detailedCountdown: detailed });
                                  const scheduledClockTime = formatRegionalArrivalClockTime(
                                    arrival.scheduledAt || arrival.predictedAt,
                                    arrivalTick,
                                  );
                                  const destinationName = formatRegionalDestinationName(
                                    arrival.direction,
                                    group.lineNumber as RegionalRouteCode,
                                  );
                                  const showTileDestination = Boolean(
                                    destinationName
                                    && !group.isTerminating
                                    && `To ${destinationName}`.toLowerCase() !== group.destinationLabel.trim().toLowerCase(),
                                  );
                                  const coachCountLabel = formatRegionalArrivalCoachCount(arrival);
                                  const arrivalTileClassName = [
                                    "relative flex flex-col items-center justify-center rounded-md border px-1.5 pt-3.5 text-center transition-colors",
                                    coachCountLabel
                                      ? showTileDestination
                                        ? "min-h-[82px] sm:min-h-[88px] pb-6"
                                        : "min-h-[78px] sm:min-h-[84px] pb-6"
                                      : showTileDestination
                                        ? "min-h-[66px] sm:min-h-[72px] pb-2"
                                        : "min-h-[64px] sm:min-h-[68px] pb-2",
                                    due
                                      ? "border-red-400/80 bg-red-900/85 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.25)] is-due"
                                      : delayed
                                        ? "border-orange-400/60 bg-orange-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(251,146,60,0.12)] dark:border-orange-400/45 dark:bg-orange-400/10 dark:text-white is-delayed"
                                        : soon
                                          ? "border-emerald-400/35 bg-emerald-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(52,211,153,0.12)] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-white is-soon"
                                          : "border-transparent bg-slate-950/[0.03] text-slate-900 dark:border-transparent dark:bg-[#0a0c10] dark:text-white shadow-xs",
                                  ].join(" ");

                                  return (
                                    <div
                                      key={`${arrival.tripNumber}:${arrival.predictedAt}`}
                                      data-arrival-due={due ? "true" : "false"}
                                      className={arrivalTileClassName}
                                    >
                                      <ArrivalTileSourceIndicator status={arrival.status} isDue={due} isCompact />
                                      <RegionalArrivalDelayBadge arrival={arrival} now={arrivalTick} isDue={due} isCompact />
                                      <strong
                                        className={detailed
                                          ? "mt-1.5 whitespace-nowrap text-[13px] sm:text-sm font-black leading-none tracking-tight tabular-nums"
                                          : "mt-1.5 text-sm sm:text-base font-black leading-none tracking-tight"}
                                      >
                                        {timeDisplay.primary}
                                      </strong>
                                      <span className="mt-0.5 flex items-center justify-center gap-1 text-[9px] sm:text-[10px] font-semibold tabular-nums">
                                        {delayed && scheduledClockTime ? (
                                          <span className={due
                                            ? "whitespace-nowrap text-red-100/55 line-through decoration-current"
                                            : "whitespace-nowrap text-slate-500/75 line-through decoration-current dark:text-slate-500"}
                                          >
                                            {scheduledClockTime}
                                          </span>
                                        ) : null}
                                        <span className={[
                                          "whitespace-nowrap",
                                          due
                                            ? "text-red-100/80"
                                            : soon
                                              ? "text-emerald-700 dark:text-emerald-300"
                                              : "text-slate-500 dark:text-slate-400"
                                        ].join(" ")}>
                                          {timeDisplay.secondary}
                                        </span>
                                      </span>
                                      {showTileDestination ? (
                                        <span
                                          className={
                                            due
                                              ? "mt-0.5 max-w-full truncate px-0.5 text-[9px] sm:text-[10px] font-bold tracking-tight text-red-100/90"
                                              : soon
                                                ? "mt-0.5 max-w-full truncate px-0.5 text-[9px] sm:text-[10px] font-bold tracking-tight text-emerald-800 dark:text-emerald-200"
                                                : "mt-0.5 max-w-full truncate px-0.5 text-[9px] sm:text-[10px] font-bold tracking-tight text-slate-600 dark:text-slate-300"
                                          }
                                          title={`To ${destinationName}`}
                                        >
                                          To {destinationName}
                                        </span>
                                      ) : null}
                                      {coachCountLabel ? (
                                        <span
                                          data-regional-arrival-coach-count
                                          className="absolute bottom-1.5 right-1.5 whitespace-nowrap text-[8px] sm:text-[9px] font-extrabold leading-none tracking-tight opacity-75"
                                        >
                                          {coachCountLabel}
                                        </span>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <div className="station-arrival-line-divider saved-station-section-divider saved-station-surface-divider" aria-hidden="true" />
          <SurfaceConnectionsSection variant="saved-station" networkId="regional" stationId={saved.station.id} />
        </div>
      ) : !detailResult ? (
        <div className="saved-station-detail-loading" role="status">
          <LoaderCircle size={15} aria-hidden="true" />
          Loading station information...
        </div>
      ) : !detail ? (
        <div className="saved-station-detail-loading">Station information is unavailable.</div>
      ) : (
        <div className="saved-station-rich-content">
          <details
            className={`saved-commute-impact-disclosure saved-station-disruption-disclosure${disruptionCount === 0 ? " is-clear" : ""}`}
            open={disruptionExpanded}
            onToggle={(event) => onDisruptionExpandedChange(event.currentTarget.open)}
          >
            <summary className="saved-commute-impact-summary saved-station-disruption-summary">
              <span className="saved-commute-impact-summary-heading saved-station-disruption-heading saved-station-section-title">
                {disruptionCount > 0 ? <AlertCircle className="saved-commute-impact-summary-icon" size={18} aria-hidden="true" /> : <span className="saved-station-clear-dot" aria-hidden="true" />}
                <strong>{disruptionCount > 0 ? "Active Disruptions" : "No Active Disruptions"}</strong>
                <span className={`desktop-menu-count-badge saved-commute-impact-total saved-station-disruption-total${disruptionCount > 0 ? " is-affected" : ""}`}>{disruptionCount}</span>
              </span>
              {disruptionCount > 0 ? (
                <span className="saved-commute-impact-summary-chips saved-station-disruption-chips">
                  {disruptionSummary.map(({ kind, count }) => (
                    <span key={kind} className={`saved-commute-impact-summary-chip kind-${disruptionKindClassName(kind)}`}>
                      <DisruptionIcon kind={kind} size={16} />
                      {disruptionKindCountLabel(kind, count)}
                    </span>
                  ))}
                </span>
              ) : null}
              <span className="saved-commute-impact-summary-action saved-station-disruption-action">
                <span className="saved-commute-impact-summary-action-collapsed">List View</span>
                <span className="saved-commute-impact-summary-action-expanded">Hide List</span>
                <ChevronDown className="saved-commute-impact-summary-chevron" size={16} aria-hidden="true" />
              </span>
            </summary>
            {disruptionCount > 0 ? (
              <ul className="saved-commute-impact-list saved-station-disruption-list">
                {classifiedActiveImpacts.map(({ impactId, kind, selection }) => (
                  <li key={selection ? `${selection.kind}-${selection.id}` : impactId} className={`kind-${disruptionKindClassName(kind)}`}>
                    <span className="saved-commute-impact-icon" aria-hidden="true"><DisruptionIcon kind={kind} size={15} /></span>
                    <div className="saved-commute-impact-copy">
                      <div className="saved-commute-impact-details">
                        <div className="saved-commute-impact-heading"><strong><span className="saved-commute-impact-kind-label">{disruptionKindLabel(kind)}</span></strong></div>
                        <span>{stationImpactContext(selection?.id ?? impactId, saved.station.name, dashboard)}</span>
                      </div>
                      <div className="saved-commute-impact-action">
                        <button
                          type="button"
                          className="saved-commute-map-action saved-commute-impact-map-button"
                          onClick={() => {
                            if (selection) onSelectImpactDetails(selection);
                            else onOpen();
                          }}
                          aria-label={`View ${saved.station.name} alert details`}
                        >
                          <FileText size={12} aria-hidden="true" /> View Details
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
                {accessOutages.map((outage) => (
                  <li key={outage.id} className={`kind-${disruptionKindClassName(outage.assetType)}`}>
                    <span className="saved-commute-impact-icon" aria-hidden="true"><DisruptionIcon kind={outage.assetType} size={15} /></span>
                    <div className="saved-commute-impact-copy">
                      <div className="saved-commute-impact-details">
                        <div className="saved-commute-impact-heading"><strong><span className="saved-commute-impact-kind-label">{disruptionKindLabel(outage.assetType)}</span></strong></div>
                      </div>
                      <div className="saved-commute-impact-action">
                        <button
                          type="button"
                          className="saved-commute-map-action saved-commute-impact-map-button"
                          onClick={() => onSelectAccessibilityOutageDetails(outage.assetType, saved.station.id)}
                          aria-label={`View ${saved.station.name} ${outage.assetType} outage details`}
                        >
                          <FileText size={12} aria-hidden="true" /> View Details
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="saved-station-disruption-clear-copy">No directly linked service impacts or accessibility outages.</p>}
          </details>

          <section className="saved-station-arrivals" aria-label={`Arrivals at ${saved.station.name}`}>
              <div className="station-arrival-line-divider saved-station-section-divider" aria-hidden="true" />
              <div className="saved-station-arrivals-heading flex flex-col items-start text-left gap-0.5 min-w-0">
                <span className="saved-station-section-title flex items-center justify-start text-left gap-2 min-w-0 font-extrabold text-slate-900 dark:text-white truncate">
                  <span className="w-1 h-3.5 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
                  <Train size={18} className="shrink-0 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                  <strong>{arrivalHeading}</strong>
                </span>
                <p className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                  {formatArrivalSourceSummary(detail.arrivals, detail.arrivalsSource)}
                </p>
              </div>
              {hasUnavailableArrivals ? (
                <p className="saved-station-arrivals-empty">Arrival Data Unavailable</p>
              ) : arrivalGroups.length === 0 ? (
                <p className="saved-station-arrivals-empty">No Arrivals Available</p>
              ) : (
                <div className="saved-station-arrival-groups">
                  {arrivalLineSections.map((section, sectionIndex) => {
                    const showLineDivider = sectionIndex > 0;
                    const isPinned = pinnedLineIds.includes(section.lineId);
                    const isHoveredPin = hoveredPinLineId === section.lineId;
                    const lineBadgeColors = transitLineBadgeColors(section.lineId);
                    const lineColor = lineBadgeColors.backgroundColor;

                    return (
                      <div
                        key={section.lineId}
                        className={`saved-station-arrival-line-section flex flex-col gap-2 rounded-lg px-1 py-1.5 transition-colors duration-200 ${
                          isPinned
                            ? "bg-amber-500/[0.08] dark:bg-amber-400/[0.07]"
                            : isHoveredPin
                              ? "bg-amber-500/[0.03] dark:bg-amber-400/[0.03]"
                              : "bg-transparent"
                        }`}
                        data-arrival-line-section={section.lineId}
                        data-pinned-line={isPinned ? "true" : "false"}
                      >
                        {showLineDivider && (
                          <div className="station-arrival-line-divider saved-station-line-divider" aria-hidden="true" />
                        )}
                        <div className="saved-station-arrival-line-header relative z-10 flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <TransitLineBadge
                              lineId={section.lineId}
                              lineNumber={section.lineNumber}
                              lineName={section.lineName}
                              size={32}
                              className="shrink-0 relative z-10"
                            />
                            <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                              {formatArrivalLineHeaderLabel(section.lineNumber, section.lineName)}
                            </span>
                            {isPinned && (
                              <span
                                className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 shrink-0 select-none animate-in fade-in duration-200"
                                data-pinned-badge
                              >
                                Starred
                              </span>
                            )}
                          </div>
                          <ArrivalLinePinButton
                            compact
                            pinned={isPinned}
                            hovered={isHoveredPin}
                            onHoverChange={(hovered) => setHoveredPinLineId(hovered ? section.lineId : null)}
                            lineLabel={`Line ${section.lineNumber}`}
                            stationName={saved.station.name}
                            onToggle={() => togglePin(section.lineId)}
                          />
                        </div>
                        <div className="flex flex-col gap-2.5">
                          {section.groups.map((group, groupIndex) => {
                            const isFirst = groupIndex === 0;
                            const isLast = groupIndex === section.groups.length - 1;
                            const arrivals = group.arrivals.slice(0, 3);
                            const emptyLiveDirection = hasLiveArrivals && arrivals.length === 0;
                            const sourceLabel = formatArrivalSourceBadgeLabel(arrivals, {
                              emptyLiveDirection,
                            });
                            const direction = formatCondensedArrivalDirection(group.directionLabel);

                            return (
                              <div
                                key={group.key}
                                data-arrival-group={group.key}
                                data-pinned-line={isPinned ? "true" : "false"}
                                className="relative flex flex-col gap-2 pl-[32px] pt-1 pb-1"
                              >
                                {/* Track spine running continuously behind the platform stop node */}
                                <div
                                  aria-hidden="true"
                                  className="station-arrival-track-spine"
                                  style={{
                                    backgroundColor: lineColor,
                                    left: "16px",
                                    top: isFirst ? "-18px" : "-12px",
                                    bottom: isLast ? "0px" : "-12px",
                                    borderBottomLeftRadius: isLast ? "9999px" : "0",
                                    borderBottomRightRadius: isLast ? "9999px" : "0",
                                  }}
                                />

                                <div className="relative flex min-w-0 items-center justify-between gap-3">
                                  {/* Platform stop node: absolute to outer row div (no overflow:hidden), left:-16px centers on spine at 32-16=16px from group edge, top:50% vertically centered to the text to the right */}
                                  <div
                                    aria-hidden="true"
                                    className="station-arrival-track-node"
                                    style={{
                                      left: "-16px",
                                      top: "50%",
                                      transform: "translate(-50%, -50%)",
                                    }}
                                  />
                                  <div className="saved-station-arrival-direction min-w-0 flex-1 overflow-hidden">
                                    <div className="flex flex-col min-w-0 leading-tight">
                                      <strong className="min-w-0 break-words font-black text-slate-900 dark:text-white">
                                        {direction.direction}
                                      </strong>
                                      {direction.destination ? (
                                        <span className="saved-station-arrival-destination flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                          <span className="min-w-0 truncate">{direction.destination}</span>
                                          {group.isTerminating && (
                                            <span className="saved-station-arrival-terminating animate-terminating-blink inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                              <ArrowDownToLine size={9} aria-hidden="true" className="shrink-0" />
                                              Terminating
                                            </span>
                                          )}
                                        </span>
                                      ) : null}
                                    </div>
                                    <span className="sr-only">
                                      <TransitLineBadge
                                        lineId={group.lineId}
                                        lineNumber={group.lineNumber}
                                        lineName={group.line?.name}
                                        size={22}
                                        className="saved-station-arrival-line-badge"
                                      />
                                    </span>
                                  </div>
                                  <div className="ml-auto flex shrink-0 items-center gap-1.5 self-start pt-0.5">
                                    <span
                                      className={`saved-station-arrival-source ${arrivalSourceBadgeClassName(sourceLabel)}`}
                                      data-arrival-source={sourceLabel.toLowerCase()}
                                    >
                                      {sourceLabel}
                                      {sourceLabel === "Live" ? (
                                        <LiveSignalIcon className="ml-1 inline-block shrink-0 text-emerald-600 dark:text-emerald-300" size={13} />
                                      ) : sourceLabel === "Scheduled" ? (
                                        <CalendarCheck2 className="ml-1 inline-block shrink-0 text-slate-500 dark:text-slate-400 relative -top-px" size={10.5} aria-hidden="true" />
                                      ) : sourceLabel === "Mixed" ? (
                                        <Layers className="ml-1 inline-block shrink-0 text-cyan-600 dark:text-cyan-400 relative -top-px" size={10.5} aria-hidden="true" />
                                      ) : null}
                                    </span>
                                  </div>
                                </div>

                                <div className="saved-station-arrival-times mt-1.5 sm:mt-2 grid w-full min-w-0 grid-cols-3 gap-1.5 sm:gap-2">
                                  {arrivals.length > 0
                                    ? arrivals.map((arrival, index) => {
                                        const detailed = index === 0 && shouldUseDetailedArrivalCountdown(arrival, arrivalTick);
                                        const due = isArrivalDue(arrival, arrivalTick);
                                        const clockTime = formatArrivalClockTime(arrival.predictedAt);
                                        const arrivalTileClassName = [
                                          "relative flex min-h-[64px] sm:min-h-[68px] flex-col items-center justify-center rounded-md border px-1.5 pt-3.5 pb-2 text-center transition-colors",
                                          due
                                            ? "border-red-400/80 bg-red-900/85 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.25)] is-due"
                                            : detailed
                                              ? "border-emerald-400/35 bg-emerald-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(52,211,153,0.12)] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-white is-soon is-detailed"
                                              : "border-transparent bg-slate-950/[0.03] text-slate-900 dark:border-transparent dark:bg-[#0a0c10] dark:text-white shadow-xs",
                                        ].join(" ");

                                        return (
                                          <div
                                            key={`${arrival.predictedAt ?? arrival.label}-${index}`}
                                            data-arrival-due={due ? "true" : "false"}
                                            className={arrivalTileClassName}
                                          >
                                            <ArrivalTileSourceIndicator status={arrival.status} isDue={due} isCompact />
                                            <strong
                                              className={detailed && !due
                                                ? "mt-1.5 whitespace-nowrap text-[13px] sm:text-sm font-black leading-none tracking-tight tabular-nums"
                                                : "mt-1.5 text-sm sm:text-base font-black leading-none tracking-tight"}
                                            >
                                              {formatArrivalTileLabel(arrival, { detailedCountdown: detailed, now: arrivalTick })}
                                            </strong>
                                            {clockTime && (
                                              <span
                                                className={
                                                  due
                                                    ? "mt-0.5 text-[10px] font-semibold text-red-100/80"
                                                    : "mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400"
                                                }
                                              >
                                                {clockTime}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })
                                    : (
                                      <div className="col-span-3 flex min-h-[56px] items-center justify-center rounded-md border border-dashed border-slate-300/40 bg-slate-950/[0.02] text-xs font-semibold text-slate-500 dark:border-white/5 dark:bg-[#0f1117]/50 dark:text-slate-400">
                                        <em>—</em>
                                      </div>
                                    )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>
          <div className="station-arrival-line-divider saved-station-section-divider saved-station-surface-divider" aria-hidden="true" />
          <SurfaceConnectionsSection variant="saved-station" networkId="ttc" stationId={saved.station.id} />
          {detailResult.source === "fallback" ? <p className="saved-station-source-note">Showing local demo station data.</p> : null}
        </div>
      )}
    </article>
  );
}

export function MyStationsPanel({
  accountState,
  savedStations,
  stationCatalogs,
  dashboards,
  activeNetwork,
  loading,
  error,
  pendingStationIds,
  onSave,
  onRemove,
  onSelectStation,
  onSelectImpactDetails,
  onSelectAccessibilityOutageDetails,
  expandedDisruptionStationIds,
  onDisruptionExpandedChange,
  onRetry,
  onBack,
  onClose,
  onRequestSignIn,
  onRequestCreateAccount,
  listModeEpoch,
}: Props) {
  const dashboard = useDashboardData();
  const authenticated = accountState ? accountState.authenticated : true;
  const [mode, setMode] = useState<"list" | "add">("list");
  const [navDirection, setNavDirection] = useState<"forward" | "back" | null>(null);
  const [query, setQuery] = useState("");
  const [lineId, setLineId] = useState("all");

  // When the shell signals a return-to-list (e.g. toast "My Stations" button clicked
  // while the panel is already open in add mode), reset without requiring "Done".
  useEffect(() => {
    if (listModeEpoch === undefined || listModeEpoch === 0) return;
    startTransition(() => {
      setMode("list");
      setQuery("");
      setLineId("all");
    });
  }, [listModeEpoch]);
  const [networkFilter, setNetworkFilter] = useState<AccountNetworkFilter>("all");
  const [lastRemoved, setLastRemoved] = useState<{ saved: AccountSavedStation; index: number } | null>(null);
  const [stationDetails, setStationDetails] = useState<Record<string, StationDataResult<StationDetail | null>>>({});
  const [regionalArrivalDetails, setRegionalArrivalDetails] = useState<Record<string, RegionalArrivalDataResult>>({});
  const [regionalAccessibility, setRegionalAccessibility] = useState<AccessibilityOutageResponse | null>(null);
  const [arrivalTick, setArrivalTick] = useState(() => Date.now());
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const savedIds = useMemo(
    () => new Set(savedStations.map((saved) => `${saved.networkId}:${saved.station.id}`)),
    [savedStations],
  );
  const stationImpactKinds = useMemo(
    () => ({
      ttc: stationImpactKindsByStation(dashboards.ttc),
      regional: stationImpactKindsByStation(dashboards.regional),
    }),
    [dashboards.ttc, dashboards.regional],
  );
  const stationImpactSelections = useMemo(
    () => ({
      ttc: stationImpactSelectionsByStation(dashboards.ttc),
      regional: stationImpactSelectionsByStation(dashboards.regional),
    }),
    [dashboards.ttc, dashboards.regional],
  );
  const pickerNetworks = useMemo<NetworkId[]>(
    () => networkFilter === "all" ? ["ttc", "regional"] : [networkFilter],
    [networkFilter],
  );
  const pickerCatalog = useMemo(
    () => pickerNetworks.flatMap((networkId) => stationCatalogs[networkId].map((station) => ({ networkId, station }))),
    [pickerNetworks, stationCatalogs],
  );
  const availableLines = useMemo(
    () => LINES.filter((line) => pickerCatalog.some(({ station }) => station.lineIds.includes(line.id))),
    [pickerCatalog],
  );
  const lineOptions = useMemo<ToolbarSelectOption<string>[]>(() => {
    const networkStations = savedStations.filter((saved) => networkFilter === "all" || saved.networkId === networkFilter);
    const countForLine = (id: string) => mode === "add"
      ? pickerCatalog.filter(({ station }) => (id === "all" || station.lineIds.includes(id))
        && station.name.toLocaleLowerCase("en-CA").includes(query.trim().toLocaleLowerCase("en-CA"))).length
      : filterAndSortSavedStations(networkStations, query, id, "attention").length;
    return [
      { value: "all", label: "All Lines", count: countForLine("all") },
      ...availableLines.filter((line) => mode === "add" || networkStations.some((saved) => saved.station.lineIds.includes(line.id))).map((line) => ({
        value: line.id, label: line.name, lineId: line.id, count: countForLine(line.id),
      })),
    ];
  }, [availableLines, savedStations, networkFilter, query, mode, pickerCatalog]);
  if (lineId !== "all" && !lineOptions.some((option) => option.value === lineId)) {
    setLineId("all");
  }
  const savedStationsWithRouteImpacts = useMemo(
    () => savedStations
      .filter((saved) => networkFilter === "all" || saved.networkId === networkFilter)
      .map((saved) => stationImpactSelections[saved.networkId].has(saved.station.id)
      ? { ...saved, station: { ...saved.station, hasActiveImpact: true } }
      : saved),
    [networkFilter, savedStations, stationImpactSelections],
  );
  const visible = useMemo(
    () => filterAndSortSavedStations(savedStationsWithRouteImpacts, query, lineId, "attention"),
    [savedStationsWithRouteImpacts, query, lineId],
  );
  const { clear: allSavedStationsClearCount, affectedNow: allSavedStationsAffectedCount } = useMemo(
    () => summarizeSavedStationStatuses(savedStations, stationCatalogs, stationImpactSelections),
    [savedStations, stationCatalogs, stationImpactSelections],
  );
  const { clear: visibleSavedStationsClearCount, affectedNow: visibleSavedStationsAffectedCount } = useMemo(
    () => summarizeSavedStationStatuses(visible, stationCatalogs, stationImpactSelections),
    [visible, stationCatalogs, stationImpactSelections],
  );
  const pickerStations = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-CA");
    return pickerCatalog
      .filter(({ station }) => !needle || station.name.toLocaleLowerCase("en-CA").includes(needle))
      .filter(({ station }) => lineId === "all" || station.lineIds.includes(lineId))
      .slice()
      .sort((left, right) => left.station.name.localeCompare(right.station.name, "en-CA"));
  }, [lineId, pickerCatalog, query]);
  const pickerGroups = useMemo(() => {
    if (query.trim()) {
      return pickerNetworks.map((networkId) => ({
        id: `${networkId}-search-results`,
        label: `${networkId === "regional" ? "GO & UP" : "TTC"} Search Results`,
        line: null,
        networkId,
        stations: pickerStations.filter((entry) => entry.networkId === networkId).map((entry) => entry.station),
      })).filter((group) => group.stations.length > 0);
    }

    return pickerNetworks.flatMap((networkId) => availableLines
      .filter((line) => (lineId === "all" || line.id === lineId)
        && stationCatalogs[networkId].some((station) => station.lineIds.includes(line.id)))
      .map((line) => ({
        id: `${networkId}-${line.id}`,
        label: `${networkId === "regional" ? "GO & UP" : "TTC"} · ${line.name}`,
        line,
        networkId,
        stations: pickerStations
          .filter((entry) => entry.networkId === networkId && entry.station.lineIds.includes(line.id))
          .map((entry) => entry.station),
      })))
      .filter((group) => group.stations.length > 0);
  }, [availableLines, lineId, pickerNetworks, pickerStations, query, stationCatalogs]);
  const compactEmpty = authenticated && mode === "list" && !loading && !error && savedStations.length === 0;

  const visibleTtcStationIds = useMemo(
    () => [...new Set(visible.filter((saved) => saved.networkId === "ttc").map((saved) => saved.station.id))].join(","),
    [visible],
  );
  const visibleRegionalStationIds = useMemo(
    () => [...new Set(visible.filter((saved) => saved.networkId === "regional").map((saved) => saved.station.id))].join(","),
    [visible],
  );
  const regionalAccessibilityByStation = useMemo(() => {
    const outagesByStation = new Map<string, Map<string, AccessibilityOutageDetail>>();
    if (!regionalAccessibility?.fresh) return new Map<string, AccessibilityOutageDetail[]>();
    for (const group of regionalAccessibility.groups) {
      for (const station of group.stations) {
        const outages = outagesByStation.get(station.stationId) ?? new Map<string, AccessibilityOutageDetail>();
        for (const outage of station.outages) outages.set(outage.id, outage);
        outagesByStation.set(station.stationId, outages);
      }
    }
    return new Map([...outagesByStation].map(([stationId, outages]) => [stationId, [...outages.values()]]));
  }, [regionalAccessibility]);

  useEffect(() => {
    if (mode !== "list" || !visibleTtcStationIds) return;
    let cancelled = false;
    const stationIds = visibleTtcStationIds.split(",");

    const refresh = async () => {
      const results = await Promise.all(stationIds.map(async (stationId) => [`ttc:${stationId}`, await getStationDetail(stationId)] as const));
      if (!cancelled) {
        setStationDetails((current) => {
          const next = { ...current };
          for (const [key, result] of results) {
            next[key] = preserveStationDetailOnRefresh(current[key], result);
          }
          return next;
        });
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, SAVED_STATION_DETAIL_REFRESH_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [mode, visibleTtcStationIds]);

  useEffect(() => {
    if (mode !== "list" || !visibleRegionalStationIds) return;
    let cancelled = false;
    const stationIds = visibleRegionalStationIds.split(",");

    const refresh = async () => {
      const [arrivalResults, accessibilityResult] = await Promise.all([
        Promise.all(stationIds.map(async (stationId) => [stationId, await getRegionalStationArrivals(stationId)] as const)),
        getAccessibilityOutages(undefined, { networkId: "regional" }),
      ]);
      if (!cancelled) {
        setRegionalArrivalDetails((current) => {
          const next = { ...current };
          for (const [stationId, result] of arrivalResults) {
            next[stationId] = preserveRegionalArrivalsOnRefresh(current[stationId], result);
          }
          return next;
        });
        setRegionalAccessibility(accessibilityResult.data);
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, SAVED_STATION_DETAIL_REFRESH_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [mode, visibleRegionalStationIds]);

  useEffect(() => {
    const interval = window.setInterval(() => setArrivalTick(Date.now()), ARRIVAL_COUNTDOWN_TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  async function remove(saved: AccountSavedStation, index: number) {
    setLastRemoved({ saved, index });
    if (!(await onRemove(saved.station.id, saved.networkId))) {
      setLastRemoved((current) => current?.saved.station.id === saved.station.id ? null : current);
    }
  }

  async function undoRemove() {
    if (!lastRemoved) return;
    const restored = await onSave(lastRemoved.saved.station.id, lastRemoved.saved.networkId);
    if (restored) setLastRemoved(null);
  }

  function leavePicker() {
    setNavDirection("back");
    setMode("list");
    setQuery("");
    setLineId("all");
    window.setTimeout(() => modeButtonRef.current?.focus(), 0);
  }

  if (dashboard.snapshot) return (
    <section className="my-stations-panel panel rounded-lg" aria-label="My Stations">
      <PanelHeader title="My Stations" titleCompact onBack={onBack} onClose={onClose} />
      <div className="p-4 space-y-3">
        <p role="status">Current station impacts and arrivals are unavailable. Reconnect to check your stations.</p>
        {savedStations.map((saved) => <button type="button" className="block font-semibold" key={`${saved.networkId}:${saved.station.id}`} onClick={() => onSelectStation(saved.station.id, saved.networkId)}>{saved.station.name}</button>)}
      </div>
    </section>
  );

  return (
    <section className={`my-stations-panel${compactEmpty ? " my-stations-panel-empty" : ""} panel min-w-0 border border-transparent rounded-lg shadow-xl`} aria-label="My Stations">
      <PanelHeader
        className="my-stations-heading"
        titleGroupClassName="my-stations-title"
        title="My Stations"
        titleCompact
        icon={<MapPin className="my-stations-title-icon w-5 h-5 text-sky-500 shrink-0" aria-hidden="true" />}
        actions={
          authenticated && savedStations.length > 0 ? (
            <div className="flex items-center gap-1.5 shrink-0" data-testid="header-station-status-badges">
              <span
                className={`desktop-menu-count-badge desktop-menu-count-stations-clear my-stations-count flex h-7 ${
                  allSavedStationsClearCount < 10 ? "w-7" : "min-w-[28px] px-1.5"
                } items-center justify-center rounded-full text-sm font-bold`}
                data-single-digit={allSavedStationsClearCount < 10 ? "true" : undefined}
                aria-label={`${allSavedStationsClearCount} clear stations`}
              >
                {allSavedStationsClearCount}
              </span>
              <span
                className={`desktop-menu-count-badge desktop-menu-count-stations-affected my-stations-count flex h-7 ${
                  allSavedStationsAffectedCount < 10 ? "w-7" : "min-w-[28px] px-1.5"
                } items-center justify-center rounded-full text-sm font-bold`}
                data-single-digit={allSavedStationsAffectedCount < 10 ? "true" : undefined}
                aria-label={`${allSavedStationsAffectedCount} affected stations`}
              >
                {allSavedStationsAffectedCount}
              </span>
            </div>
          ) : null
        }
        onBack={() => mode === "add" ? leavePicker() : onBack()}
        backLabel={mode === "add" ? "Back to My Stations" : "Back"}
        onClose={onClose}
        closeLabel="Close My Stations"
      />

      <div key={mode} className="my-stations-body" data-nav-direction={navDirection || undefined}>
        {accountState?.source === "unavailable" ? (
          <div className="my-stations-list min-w-0 pb-3 flex flex-col gap-3">
            <AccountAvailabilityNotice knownAccountLabel={accountState.user?.displayName || accountState.user?.email || null} />
          </div>
        ) : !authenticated ? (
          <div className="my-stations-list min-w-0 pb-3 flex flex-col gap-3">
            <div className="account-feature-preview saved-commute-account-prompt p-4 rounded-lg flex flex-col gap-4 border border-transparent">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1.5">
                  <Bookmark className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
                  Save Favorite Stations
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Save rapid-transit stations for quick access to live arrivals, line disruptions, and elevator or escalator outages.
                </p>
              </div>

              <div className="space-y-3 my-1 border-t border-b border-black/5 dark:border-white/5 py-3">
                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">Personal Station Watchlist</span>
                    <span className="text-slate-500 dark:text-slate-400">Save stations across Lines 1, 2, 4, 5, and 6 for fast monitoring.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">Disruptions & Accessibility Outages</span>
                    <span className="text-slate-500 dark:text-slate-400">View active delays, suspensions, closures, and elevator or escalator outages in one place.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">Live & Scheduled Arrivals</span>
                    <span className="text-slate-500 dark:text-slate-400">Check live subway trip updates and scheduled arrivals for all your saved stops.</span>
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
        ) : (
          <>
            <div className="my-stations-controls">
              <div className="my-stations-controls-top">
                <FilterSearchRow active={Boolean(query || lineId !== "all" || networkFilter !== "all")} onReset={() => {
                  setQuery(""); setLineId("all"); setNetworkFilter("all");
                }}>
                <label className={`impact-list-search my-stations-search${mode === "add" ? " picker-nudge" : ""}`}>
                  <Search size={15} aria-hidden="true" />
                  <span className="sr-only">{mode === "add" ? "Search all stations" : "Search saved stations"}</span>
                  <input
                    type="search"
                    className="submenu-search-input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={mode === "add" ? "Search All Stations..." : "Search saved stations..."}
                  />
                </label>
                </FilterSearchRow>
                <button
                  ref={modeButtonRef}
                  type="button"
                  className={`my-stations-mode-action ${mode === "list" ? "my-stations-add" : "my-stations-done"}`}
                  onClick={() => {
                    if (mode === "add") {
                      leavePicker();
                    } else {
                      setNavDirection("forward");
                      setMode("add");
                      setQuery("");
                      setLineId("all");
                      setNetworkFilter(activeNetwork);
                    }
                  }}
                  aria-label={mode === "list" ? "Add Station" : "Done adding stations"}
                >
                  <span key={mode} className="my-stations-mode-action-content">
                    {mode === "list" ? <Plus size={16} aria-hidden="true" /> : null}
                    {mode === "list" ? (
                      <>
                        <span className="my-stations-add-wide">Add Station</span>
                        <span className="my-stations-add-compact">Add</span>
                      </>
                    ) : <span>Done</span>}
                  </span>
                </button>
              </div>
              <div className="account-network-filter w-full" data-network={networkFilter} data-options-count={ACCOUNT_NETWORK_OPTIONS.length} role="group" aria-label="Filter My Stations by network">
                <div className="account-network-glider" aria-hidden="true" />
                {ACCOUNT_NETWORK_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    data-network={option.value}
                    aria-pressed={networkFilter === option.value}
                    onClick={() => {
                      setNetworkFilter(option.value);
                      setLineId("all");
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="my-stations-selects">
                <ToolbarSelectMenu
                  ariaLabel="Filter stations by line"
                  prefix="Line"
                  value={lineId}
                  options={lineOptions}
                  onChange={setLineId}
                />
                {mode === "list" && visible.length > 0 ? (
                  <div className="flex items-center gap-1.5 ml-auto shrink-0" data-testid="station-status-badges">
                    <span className="toolbar-status-badge toolbar-status-badge--total">
                      {visible.length} Total
                    </span>
                    {visibleSavedStationsClearCount > 0 ? (
                      <span className="toolbar-status-badge toolbar-status-badge--clear">
                        {visibleSavedStationsClearCount} Clear
                      </span>
                    ) : null}
                    {visibleSavedStationsAffectedCount > 0 ? (
                      <span className="toolbar-status-badge toolbar-status-badge--affected">
                        {visibleSavedStationsAffectedCount} Affected
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={`my-stations-list${mode === "add" ? " my-stations-picker-list" : ""}`} aria-label={mode === "add" ? "Add stations" : "Saved stations"}>
              {error ? (
              <div className="my-stations-empty" role="alert">
                <p>Could not load saved stations</p>
                <button type="button" onClick={onRetry}>Retry</button>
              </div>
            ) : loading ? (
              <div className="my-stations-empty" role="status"><p>Loading saved stations...</p></div>
            ) : mode === "add" ? (
              <>
                {pickerGroups.map((group) => (
                  <section className="my-stations-picker-section" key={group.id} aria-labelledby={`station-group-${group.id}`}>
                    <h3
                      id={`station-group-${group.id}`}
                      className={`my-stations-picker-section-heading${group.line ? " has-line-accent" : ""}`}
                      style={group.line ? { borderLeftColor: group.line.color } : undefined}
                    >
                      {group.line ? (
                        <TransitLineBadge lineId={group.line.id} lineNumber={group.line.number} lineName={group.line.name} size={28} className="my-stations-picker-line-number" />
                      ) : null}
                      <span>{group.label}</span>
                      <AccountNetworkBadge networkId={group.networkId} />
                      <span className="my-stations-picker-section-count">{group.stations.length}</span>
                    </h3>
                    <div className="my-stations-picker-section-rows">
                      {group.stations.map((station) => {
                        const saved = savedIds.has(`${group.networkId}:${station.id}`);
                        const pending = pendingStationIds.has(station.id);
                        return (
                          <div className="my-stations-picker-row" key={`${group.id}-${station.id}`}>
                            <span className="my-stations-row-copy">
                              <span className="my-stations-row-heading"><strong>{station.name}</strong><StationLineBadges lineIds={station.lineIds} /></span>
                              <PickerStationConditions station={station} impactKinds={stationImpactKinds[group.networkId].get(station.id) ?? []} />
                            </span>
                            <button
                              type="button"
                              className={`my-stations-picker-action${saved ? " saved" : ""}`}
                              onClick={() => saved ? void onRemove(station.id, group.networkId) : void onSave(station.id, group.networkId)}
                              disabled={pending}
                              aria-pressed={saved}
                              aria-label={saved ? `Remove ${station.name} from My Stations` : `Save ${station.name} to My Stations`}
                            >
                              <Bookmark size={28} fill={saved ? "currentColor" : "none"} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {pickerStations.length === 0 ? <div className="my-stations-empty"><p>No Stations Match</p></div> : null}
              </>
            ) : savedStations.length === 0 ? (
              <>
                <div className="my-stations-empty">
                  <p>No Saved Stations</p>
                </div>
                {lastRemoved ? (
                  <div className="saved-station-inline-undo" role="status">
                    <span>{lastRemoved.saved.station.name} Removed</span>
                    <button type="button" onClick={() => void undoRemove()}>Undo</button>
                    <button type="button" onClick={() => setLastRemoved(null)} aria-label="Dismiss undo"><X size={15} /></button>
                  </div>
                ) : null}
              </>
            ) : visible.length === 0 && !lastRemoved ? (
              <div className="my-stations-empty">
                <p>No Saved Stations Match</p>
                <button type="button" onClick={() => { setQuery(""); setLineId("all"); }}>Clear Filters</button>
              </div>
            ) : (
              <>
                {visible.map((saved, index) => (
                  <div className="saved-station-list-slot" key={`${saved.networkId}:${saved.station.id}`}>
                    {lastRemoved?.index === index ? (
                      <div className="saved-station-inline-undo" role="status">
                        <span>{lastRemoved.saved.station.name} Removed</span>
                        <button type="button" onClick={() => void undoRemove()}>Undo</button>
                        <button type="button" onClick={() => setLastRemoved(null)} aria-label="Dismiss undo"><X size={15} /></button>
                      </div>
                    ) : null}
                    <DataProvider data={dashboards[saved.networkId]}>
                      <SavedStationRow
                        saved={saved}
                        detailResult={stationDetails[`${saved.networkId}:${saved.station.id}`]}
                        regionalArrivalResult={regionalArrivalDetails[saved.station.id]}
                        regionalAccessibilityOutages={regionalAccessibilityByStation.get(saved.station.id) ?? []}
                        regionalDataLoaded={saved.networkId !== "regional" || regionalAccessibility !== null}
                        routeImpactSelections={stationImpactSelections[saved.networkId].get(saved.station.id) ?? []}
                        arrivalTick={arrivalTick}
                        pending={pendingStationIds.has(saved.station.id)}
                        onOpen={() => onSelectStation(saved.station.id, saved.networkId)}
                        onSelectImpactDetails={(selection) => onSelectImpactDetails(selection, saved.networkId)}
                        onSelectAccessibilityOutageDetails={(assetType, stationId) => onSelectAccessibilityOutageDetails(assetType, stationId, saved.networkId)}
                        disruptionExpanded={expandedDisruptionStationIds.has(`${saved.networkId}:${saved.station.id}`)}
                        onDisruptionExpandedChange={(expanded) => onDisruptionExpandedChange(`${saved.networkId}:${saved.station.id}`, expanded)}
                        onRemove={() => void remove(saved, index)}
                      />
                    </DataProvider>
                  </div>
                ))}
                {lastRemoved && lastRemoved.index >= visible.length ? (
                  <div className="saved-station-inline-undo" role="status">
                    <span>{lastRemoved.saved.station.name} Removed</span>
                    <button type="button" onClick={() => void undoRemove()}>Undo</button>
                    <button type="button" onClick={() => setLastRemoved(null)} aria-label="Dismiss undo"><X size={15} /></button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
      </div>
    </section>
  );
}
