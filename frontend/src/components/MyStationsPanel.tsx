"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AlertCircle, Bookmark, ChevronDown, ChevronLeft, ChevronRight, Clock3, FileText, LoaderCircle, Plus, Search, X } from "lucide-react";
import type { AccountSavedStation } from "../app/saved-station-data";
import type { AccountState } from "../app/account-data";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { filterAndSortSavedStations, type SavedStationSort } from "../app/saved-stations";
import {
  formatArrivalSourceBadgeLabel,
  formatArrivalSourceSummary,
  formatArrivalTileLabel,
  groupStationArrivals,
  isArrivalDue,
  shouldUseDetailedArrivalCountdown,
} from "../app/station-arrivals";
import { getStationDetail, type StationDataResult, type StationDetail, type StationSummary } from "../app/station-data";
import { stationImpactKindsByStation, stationImpactSelection, stationImpactSelectionsByStation } from "../app/station-impact-types";
import { DataProvider, useDashboardData, type DashboardData } from "../app/DataContext";
import { REGIONAL_ROUTE_DEFINITIONS, type NetworkId } from "../app/regional-data";
import {
  getRegionalStationArrivals,
  groupRegionalStationArrivals,
  isRegionalArrivalDue,
  isRegionalArrivalSoon,
  regionalArrivalTimeDisplay,
  shouldUseDetailedRegionalArrivalCountdown,
  type RegionalArrivalDataResult,
} from "../app/regional-arrivals";
import {
  getAccessibilityOutages,
  type AccessibilityOutageDetail,
  type AccessibilityOutageResponse,
} from "../app/accessibility-outage-data";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import { ToolbarSelectMenu, type ToolbarSelectOption } from "./ImpactListToolbar";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { TransitLineBadge } from "./TransitLineBadge";
import { StationImpactTypeBadges } from "./StationImpactTypeBadges";
import { StationOutageBadge } from "./StationOutageBadge";

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

const SORT_OPTIONS: Array<{ value: SavedStationSort; label: string }> = [
  { value: "attention", label: "Needs Attention" },
  { value: "name", label: "Name A-Z" },
  { value: "recent", label: "Recently Saved" },
  { value: "oldest", label: "Oldest Saved" },
  { value: "line", label: "Line" },
];

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

function SavedStationRow({
  saved,
  detailResult,
  regionalArrivalResult,
  regionalAccessibilityOutages,
  regionalDataLoaded,
  subwayClosed,
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
  subwayClosed: boolean;
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
  const hasUnavailableArrivals = detail?.arrivals.some((arrival) => arrival.status === "unavailable") ?? false;
  const hasLiveArrivals = detail?.arrivals.some((arrival) => arrival.status === "live") ?? false;
  const arrivalGroups = detail && !hasUnavailableArrivals
    ? groupStationArrivals(detail.arrivals, detail.lines, {
        stationId: detail.id,
        maxArrivalsPerDirection: 2,
        includeEmptyDirections: hasLiveArrivals,
      })
    : [];
  const regionalArrivalSnapshot = regionalArrivalResult?.data;
  const regionalArrivalGroups = regionalArrivalSnapshot
    ? groupRegionalStationArrivals(regionalArrivalSnapshot.arrivals, saved.station.id)
    : [];
  const regionalInformationReady = regionalDataLoaded && Boolean(regionalArrivalSnapshot);

  return (
    <article className={`my-stations-row saved-station-rich-row ${displayedDisruptionCount > 0 ? "is-affected" : "is-clear"}`}>
      <div className="saved-station-rich-heading">
        <button type="button" className="my-stations-row-main" onClick={onOpen}>
          <span className="my-stations-row-copy">
            <span className="my-stations-row-heading">
              <strong>{saved.station.name}</strong>
              <AccountNetworkBadge networkId={saved.networkId} />
              <StationLineBadges lineIds={saved.station.lineIds} />
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
              <span className="saved-commute-impact-summary-heading saved-station-disruption-heading">
                {disruptionCount > 0 ? <AlertCircle className="saved-commute-impact-summary-icon" size={16} aria-hidden="true" /> : <span className="saved-station-clear-dot" aria-hidden="true" />}
                <strong>{disruptionCount > 0 ? "Active Disruptions" : "No Active Disruptions"}</strong>
                <span className="saved-commute-impact-total saved-station-disruption-total">{disruptionCount}</span>
              </span>
              {disruptionCount > 0 ? (
                <span className="saved-commute-impact-summary-chips saved-station-disruption-chips">
                  {disruptionSummary.map(({ kind, count }) => (
                    <span key={kind} className={`saved-commute-impact-summary-chip kind-${disruptionKindClassName(kind)}`}>
                      <DisruptionIcon kind={kind} size={14} />
                      {disruptionKindCountLabel(kind, count)}
                    </span>
                  ))}
                </span>
              ) : null}
              <span className="saved-commute-impact-summary-action saved-station-disruption-action">
                <span className="saved-commute-impact-summary-action-collapsed">List View</span>
                <span className="saved-commute-impact-summary-action-expanded">Hide List</span>
                <ChevronDown className="saved-commute-impact-summary-chevron" size={15} aria-hidden="true" />
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
            <div className="saved-station-arrivals-heading">
              <span><Clock3 size={15} aria-hidden="true" /><strong>Arrivals</strong></span>
              <small>{regionalArrivalSnapshot?.availability === "available"
                ? regionalArrivalSnapshot.source
                : regionalArrivalSnapshot?.availability === "no-service"
                  ? "Published regional schedule"
                  : "Regional arrivals unavailable"}</small>
            </div>
            {regionalArrivalSnapshot?.availability === "no-service" ? (
              <p className="saved-station-arrivals-empty">No Scheduled Service</p>
            ) : regionalArrivalSnapshot?.availability !== "available" ? (
              <p className="saved-station-arrivals-empty">Arrival Data Unavailable</p>
            ) : regionalArrivalGroups.length === 0 ? (
              <p className="saved-station-arrivals-empty">No Arrivals Available</p>
            ) : (
              <div className="saved-station-arrival-groups">
                {regionalArrivalGroups.map((group, groupIndex) => {
                  const showLineDivider = groupIndex > 0 && regionalArrivalGroups[groupIndex - 1]?.lineId !== group.lineId;
                  const arrivals = group.platforms.flatMap((platform) => platform.arrivals).sort((left, right) => left.minutes - right.minutes).slice(0, 2);
                  const hasLive = arrivals.some((arrival) => arrival.status === "live");
                  const hasScheduled = arrivals.some((arrival) => arrival.status === "scheduled");
                  const sourceLabel = hasLive && hasScheduled ? "Mixed" : hasLive ? "Live" : "Scheduled";
                  return (
                    <Fragment key={group.key}>
                      {showLineDivider && (
                        <div className="station-arrival-line-divider my-1" aria-hidden="true" />
                      )}
                      <div className="saved-station-arrival-group">
                        <TransitLineBadge
                          lineId={group.lineId}
                          lineNumber={group.lineNumber}
                          lineName={group.lineName}
                          size={27}
                          className="saved-station-arrival-line-badge"
                        />
                        <span className="saved-station-arrival-direction">
                          <strong>{group.directionLabel}</strong>
                          <span className="saved-station-arrival-destination">{group.destinationLabel}</span>
                        </span>
                        <span className={`saved-station-arrival-source source-${sourceLabel.toLowerCase()}`}>{sourceLabel}</span>
                        <span className="saved-station-arrival-times">
                          {arrivals.map((arrival, index) => {
                            const due = isRegionalArrivalDue(arrival, arrivalTick);
                            const soon = !due && isRegionalArrivalSoon(arrival, arrivalTick);
                            const detailed = index === 0
                              && shouldUseDetailedRegionalArrivalCountdown(arrival, arrivalTick);
                            const timeDisplay = regionalArrivalTimeDisplay(arrival, arrivalTick, { detailedCountdown: detailed });
                            return (
                              <strong
                                className={[detailed ? "is-detailed" : "", soon ? "is-soon" : "", due ? "is-due" : ""].filter(Boolean).join(" ") || undefined}
                                key={`${arrival.tripNumber}:${arrival.predictedAt}`}
                              >
                                {timeDisplay.primary}
                              </strong>
                            );
                          })}
                        </span>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </section>
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
              <span className="saved-commute-impact-summary-heading saved-station-disruption-heading">
                {disruptionCount > 0 ? <AlertCircle className="saved-commute-impact-summary-icon" size={16} aria-hidden="true" /> : <span className="saved-station-clear-dot" aria-hidden="true" />}
                <strong>{disruptionCount > 0 ? "Active Disruptions" : "No Active Disruptions"}</strong>
                <span className="saved-commute-impact-total saved-station-disruption-total">{disruptionCount}</span>
              </span>
              {disruptionCount > 0 ? (
                <span className="saved-commute-impact-summary-chips saved-station-disruption-chips">
                  {disruptionSummary.map(({ kind, count }) => (
                    <span key={kind} className={`saved-commute-impact-summary-chip kind-${disruptionKindClassName(kind)}`}>
                      <DisruptionIcon kind={kind} size={14} />
                      {disruptionKindCountLabel(kind, count)}
                    </span>
                  ))}
                </span>
              ) : null}
              <span className="saved-commute-impact-summary-action saved-station-disruption-action">
                <span className="saved-commute-impact-summary-action-collapsed">List View</span>
                <span className="saved-commute-impact-summary-action-expanded">Hide List</span>
                <ChevronDown className="saved-commute-impact-summary-chevron" size={15} aria-hidden="true" />
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
            <div className="saved-station-arrivals-heading">
              <span><Clock3 size={15} aria-hidden="true" /><strong>Arrivals</strong></span>
              <small>{formatArrivalSourceSummary(detail.arrivals, detail.arrivalsSource)}</small>
            </div>
            {subwayClosed ? (
              <p className="saved-station-arrivals-empty">Subway Closed · Arrivals Not Available</p>
            ) : hasUnavailableArrivals ? (
              <p className="saved-station-arrivals-empty">Arrival Data Unavailable</p>
            ) : arrivalGroups.length === 0 ? (
              <p className="saved-station-arrivals-empty">No Arrivals Available</p>
            ) : (
              <div className="saved-station-arrival-groups">
                {arrivalGroups.map((group, groupIndex) => {
                  const showLineDivider = groupIndex > 0 && arrivalGroups[groupIndex - 1]?.lineId !== group.lineId;
                  const sourceLabel = formatArrivalSourceBadgeLabel(group.arrivals, {
                    emptyLiveDirection: hasLiveArrivals && group.arrivals.length === 0,
                  });
                  const direction = formatCondensedArrivalDirection(group.directionLabel);
                  return (
                    <Fragment key={group.key}>
                      {showLineDivider && (
                        <div className="station-arrival-line-divider my-1" aria-hidden="true" />
                      )}
                      <div className="saved-station-arrival-group">
                        <TransitLineBadge
                          lineId={group.lineId}
                          lineNumber={group.lineNumber}
                          lineName={group.line?.name}
                          size={27}
                          className="saved-station-arrival-line-badge"
                        />
                        <span className="saved-station-arrival-direction">
                          <strong>{direction.direction}</strong>
                          {direction.destination ? <span className="saved-station-arrival-destination">{direction.destination}</span> : null}
                        </span>
                        <span className={`saved-station-arrival-source source-${sourceLabel.toLowerCase().replaceAll(" ", "-")}`}>{sourceLabel}</span>
                        <span className="saved-station-arrival-times">
                          {group.arrivals.length > 0
                            ? group.arrivals.map((arrival, index) => {
                                const detailed = index === 0 && shouldUseDetailedArrivalCountdown(arrival, arrivalTick);
                                const due = isArrivalDue(arrival, arrivalTick);
                                return (
                                  <strong
                                    className={[detailed ? "is-detailed is-soon" : "", due ? "is-due" : ""].filter(Boolean).join(" ") || undefined}
                                    key={`${arrival.predictedAt ?? arrival.label}-${index}`}
                                  >
                                    {formatArrivalTileLabel(arrival, { detailedCountdown: detailed, now: arrivalTick })}
                                  </strong>
                                );
                              })
                            : <em>—</em>}
                        </span>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </section>
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
}: Props) {
  const authenticated = accountState ? accountState.authenticated : true;
  const [mode, setMode] = useState<"list" | "add">("list");
  const [query, setQuery] = useState("");
  const [lineId, setLineId] = useState("all");
  const [networkFilter, setNetworkFilter] = useState<AccountNetworkFilter>("all");
  const [sort, setSort] = useState<SavedStationSort>("attention");
  const [lastRemoved, setLastRemoved] = useState<{ saved: AccountSavedStation; index: number } | null>(null);
  const [stationDetails, setStationDetails] = useState<Record<string, StationDataResult<StationDetail | null>>>({});
  const [regionalArrivalDetails, setRegionalArrivalDetails] = useState<Record<string, RegionalArrivalDataResult>>({});
  const [regionalAccessibility, setRegionalAccessibility] = useState<AccessibilityOutageResponse | null>(null);
  const [arrivalTick, setArrivalTick] = useState(() => Date.now());
  const subwayOperatingState = useSubwayOperatingState();
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
  const lineOptions = useMemo<ToolbarSelectOption<string>[]>(() => [
    { value: "all", label: "All Lines" },
    ...availableLines.map((line) => ({ value: line.id, label: line.name, lineId: line.id })),
  ], [availableLines]);
  const savedStationsWithRouteImpacts = useMemo(
    () => savedStations
      .filter((saved) => networkFilter === "all" || saved.networkId === networkFilter)
      .map((saved) => stationImpactSelections[saved.networkId].has(saved.station.id)
      ? { ...saved, station: { ...saved.station, hasActiveImpact: true } }
      : saved),
    [networkFilter, savedStations, stationImpactSelections],
  );
  const visible = useMemo(
    () => filterAndSortSavedStations(savedStationsWithRouteImpacts, query, lineId, sort),
    [savedStationsWithRouteImpacts, query, lineId, sort],
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
        setStationDetails((current) => ({ ...current, ...Object.fromEntries(results) }));
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
        setRegionalArrivalDetails((current) => ({ ...current, ...Object.fromEntries(arrivalResults) }));
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
    const interval = window.setInterval(() => setArrivalTick(Date.now()), 3_000);
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
    setMode("list");
    setQuery("");
    setLineId("all");
    window.setTimeout(() => modeButtonRef.current?.focus(), 0);
  }

  return (
    <section className={`my-stations-panel${compactEmpty ? " my-stations-panel-empty" : ""} panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl`} aria-label="My Stations">
      <div className="panel-heading my-stations-heading @container border-b border-black/10 dark:border-white/10 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-1 sm:gap-3 min-w-0">
        <div className="my-stations-title flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => mode === "add" ? leavePicker() : onBack()}
            className="p-1 sm:p-2 -ml-1.5 sm:ml-0 mr-1 sm:mr-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            aria-label={mode === "add" ? "Back to My Stations" : "Back"}
          >
            <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
          </button>
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-3 whitespace-nowrap">
            <Bookmark className="my-stations-title-icon w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-sky-500 shrink-0" fill="none" aria-hidden="true" />
            <span>My Stations</span>
          </h2>
        </div>
        <div className="my-stations-heading-actions flex items-center gap-2 sm:gap-3 shrink-0">
          {authenticated ? (
            <span className="my-stations-count" aria-label={`${savedStations.length} saved stations`}>{savedStations.length}</span>
          ) : null}
          <button type="button" className="my-stations-close p-1 sm:p-2 -mr-1.5 sm:mr-0 ml-1 sm:ml-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center" onClick={onClose} aria-label="Close My Stations">
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        </div>
      </div>

      <div key={mode} className="my-stations-body" data-nav-direction={mode === "add" ? "forward" : "back"}>
        {!authenticated ? (
          <div className="account-feature-preview saved-commute-account-prompt p-4 rounded-lg flex flex-col gap-4 border border-black/10 dark:border-white/10">
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
        ) : (
          <>
        <div className="my-stations-controls">
          <div className="my-stations-controls-top">
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
            <button
              ref={modeButtonRef}
              type="button"
              className={`my-stations-mode-action ${mode === "list" ? "my-stations-add" : "my-stations-done"}`}
              onClick={() => {
                if (mode === "add") {
                  leavePicker();
                } else {
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
          <div className="account-network-filter" data-network={networkFilter} data-options-count={ACCOUNT_NETWORK_OPTIONS.length} role="group" aria-label="Filter My Stations by network">
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
            <ToolbarSelectMenu
              ariaLabel="Sort saved stations"
              prefix="Sort"
              value={mode === "add" ? "name" : sort}
              options={SORT_OPTIONS}
              onChange={setSort}
              disabled={mode === "add"}
            />
          </div>
        </div>

        {error ? (
          <div className="my-stations-empty" role="alert">
            <p>Could not load saved stations</p>
            <button type="button" onClick={onRetry}>Retry</button>
          </div>
        ) : loading ? (
          <div className="my-stations-empty" role="status"><p>Loading saved stations...</p></div>
        ) : mode === "add" ? (
          <div className="my-stations-list my-stations-picker-list" aria-label="Add stations">
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
          </div>
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
          <div className="my-stations-list" aria-label="Saved stations">
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
                    subwayClosed={saved.networkId === "ttc" && subwayOperatingState.status === "closed"}
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
          </div>
        )}
      </>
    )}
  </div>
    </section>
  );
}
