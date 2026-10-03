"use client";

import { serviceEffectLabel } from "../app/alert-categories";


import { Fragment, useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowRight, BadgeInfo, Bus, ChevronDown, ConciergeBell, Construction, ExternalLink, FileText, GitMerge, Train } from "lucide-react";
import Image from "next/image";
import { StationSubmenuNavButtons, type StationSubmenuNavItem } from "./StationSubmenuNavButtons";
import { normalizeDashboardSourceLabel } from "../app/dashboard-source-label";
import { formatImpactTimestamp } from "../app/impact-time";
import { suppliedAlertCause } from "../app/alert-cause";
import {
  ArrivalSourceBadge,
  ArrivalTerminatingBadge,
} from "./ArrivalSourceBadge";
import {
  ARRIVAL_COUNTDOWN_TICK_MS,
  formatArrivalClockTime,
  formatArrivalDisclaimer,
  formatArrivalSourceBadgeLabel,
  formatArrivalSourceSummary,
  formatArrivalTileLabel,
  groupStationArrivals,
  isArrivalDue,
  shouldUseDetailedArrivalCountdown,
} from "../app/station-arrivals";
import { sortArrivalGroupsByPinnedLine } from "../app/arrival-pins";
import {
  formatStationNoticeDate,
  isLrtOnlyStation,
  isStationParkingAvailable,
  isStationWashroomAvailable,
  isStationBicycleLockupAvailable,
  isStationBicycleRepairAvailable,
  isStationBikeShareAvailable,
  isStationPpudoAvailable,
  isSubwayAndLrtStation,
  stationNoticeCategoryLabel,
  type StationArrival,
  type StationDataResult,
  type StationDetail,
  type StationImpact,
} from "../app/station-data";
import { distinctStationImpacts, plannedClosuresForStation } from "../app/station-impact-types";
import { useDashboardData } from "../app/DataContext";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import { TransitLineBadge, transitLineBadgeColors } from "./TransitLineBadge";
import type {
  ActiveAlert,
  DelayAlert,
  ImpactKind,
  ImpactSelection,
  PlannedClosure,
  ReducedSpeedZone,
} from "../app/linewatch-data";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { ArrivalTileSourceIndicator } from "./ArrivalTileSourceIndicator";
import { StationDetailHeader } from "./StationDetailHeader";
import { MobileSheetDragHandle } from "./MobileSheetDragHandle";
import { useMobileDraggableSheet } from "../hooks/useMobileDraggableSheet";
import { ArrivalLinePinButton } from "./ArrivalLinePinButton";
import { useArrivalLinePins } from "../hooks/useArrivalLinePins";
import { ttcStationConnections } from "../app/station-connections";
import { StationConnectionBadges } from "./StationConnectionBadges";
import { SurfaceConnectionsSection } from "./SurfaceConnectionsSection";
import { OverlappingCountBadge } from "./OverlappingCountBadge";
import { StationLineDirectionIndicator } from "./StationLineDirectionIndicator";

type Props = {
  stationResult: StationDataResult<StationDetail | null> | null;
  loading: boolean;
  updating?: boolean;
  selectedStationName?: string;
  onClose: () => void;
  onSelectImpact?: (selection: ImpactSelection) => void;
  reducedMotion?: boolean;
  authenticated?: boolean;
  saved?: boolean;
  savePending?: boolean;
  onToggleSaved?: (stationId: string) => void;
  onRequestSignIn?: () => void;
};

type StationImpactDetailsTarget = {
  label: string;
  selection: NonNullable<ImpactSelection>;
  tone: "active" | "delay" | "planned" | "reduced-speed-zone";
};

function getStationImpactDetailsTarget(
  impact: StationImpact,
  activeAlerts: ActiveAlert[],
  delays: DelayAlert[],
  reducedSpeedZones: ReducedSpeedZone[],
  plannedClosures: PlannedClosure[]
): StationImpactDetailsTarget | null {
  const reducedSpeedZone = reducedSpeedZones.find(
    (zone) => zone.id === impact.id || zone.sourceAlertIds?.includes(impact.id)
  );
  if (reducedSpeedZone) {
    return {
      label: "Reduced Speed Zone",
      selection: { kind: "reduced-speed-zone", id: reducedSpeedZone.id },
      tone: "reduced-speed-zone",
    };
  }

  const matchingAlert = activeAlerts.find(
    (alert) => alert.id === impact.id || alert.relatedPlannedClosureId === impact.id
  );
  if (matchingAlert) {
    if (matchingAlert.severity === "planned") {
      return {
        label: "Active Closure",
        selection: { kind: "suspension", id: matchingAlert.id },
        tone: "active",
      };
    }

    if (matchingAlert.severity === "suspension") {
      return {
        label: "Suspension",
        selection: { kind: "suspension", id: matchingAlert.id },
        tone: "active",
      };
    }

    return {
      label: "Delay",
      selection: { kind: "delay", id: matchingAlert.id },
      tone: "delay",
    };
  }

  const delay = delays.find((d) => d.id === impact.id || d.relatedPlannedClosureId === impact.id);
  if (delay) {
    return {
      label: serviceEffectLabel(delay),
      selection: { kind: "delay", id: delay.id },
      tone: "delay",
    };
  }

  const plannedClosure = plannedClosures.find((closure) => closure.id === impact.id);
  if (plannedClosure) {
    return {
      label: serviceEffectLabel(plannedClosure, true),
      selection: { kind: "planned-closure", id: plannedClosure.id },
      tone: "planned",
    };
  }

  return null;
}

function StationImpactDetailsIcon({
  kind,
  tone,
  size = 14,
}: {
  kind: ImpactKind;
  tone?: StationImpactDetailsTarget["tone"];
  size?: number;
}) {
  if (kind === "delay") {
    return <DelayIcon size={size} className="shrink-0 delay-tone" />;
  }

  if (kind === "reduced-speed-zone") {
    return <Construction size={size} className="rsz-tone shrink-0" />;
  }

  if (kind === "planned-closure" && tone === "active") {
    return <AlertTriangle size={size} className="shrink-0 text-red-500" />;
  }

  if (kind === "planned-closure") {
    return <PlannedClosureIcon size={size} className="shrink-0 text-blue-500" />;
  }

  return <AlertTriangle size={size} className="shrink-0 text-red-500" />;
}

type StationAccessOutageAssetType = "elevator" | "escalator";

const STATION_ACCESS_OUTAGE_ICON_SRC: Record<StationAccessOutageAssetType, string> = {
  elevator: "/assets/linewatch/outages/elevator.svg",
  escalator: "/assets/linewatch/outages/escalator.svg",
};

function formatStationOutageLabel(assetType: StationAccessOutageAssetType, count: number) {
  const assetLabel = assetType === "elevator" ? "elevator" : "escalator";
  return `${count} ${assetLabel} ${count === 1 ? "outage" : "outages"}`;
}

function StationAccessOutageBadge({
  assetType,
  count,
  label,
}: {
  assetType: StationAccessOutageAssetType;
  count: number;
  label: string;
}) {
  return (
    <span className="station-access-outage-badge" aria-label={label} title={label}>
      <Image
        src={STATION_ACCESS_OUTAGE_ICON_SRC[assetType]}
        alt=""
        width={30}
        height={30}
        aria-hidden="true"
      />
      <OverlappingCountBadge className="station-access-outage-count" count={count} />
    </span>
  );
}

function stationImpactKind(impact: StationImpact): ImpactKind {
  if (impact.type === "planned-closure" || impact.severity === "planned") {
    return "planned-closure";
  }
  if (impact.severity === "suspension") {
    return "suspension";
  }
  return "delay";
}

function fallbackStationImpactTone(impact: StationImpact): StationImpactDetailsTarget["tone"] {
  if (impact.type === "planned-closure" || impact.severity === "planned") {
    return "planned";
  }
  if (impact.severity === "suspension") {
    return "active";
  }
  return "delay";
}

function fallbackStationImpactLabel(impact: StationImpact): string {
  if (impact.type === "planned-closure" || impact.severity === "planned") {
    return "Planned Advisory";
  }
  if (impact.severity === "suspension") {
    return "Suspension";
  }
  return "Delay";
}

function stationImpactCardClassName(tone: StationImpactDetailsTarget["tone"]) {
  const base = "station-impact-card flex flex-col gap-2.5 rounded-lg p-3 text-sm transition-all";
  if (tone === "active") {
    return `${base} suspension-card-border`;
  }
  if (tone === "planned") {
    return `${base} planned-closure-card-border`;
  }
  if (tone === "reduced-speed-zone") {
    return `${base} rsz-card-border`;
  }
  return `${base} delay-card-border`;
}

function stationImpactTitleClassName() {
  return "block font-bold text-slate-900 dark:text-white";
}

function stationImpactButtonClassName(tone: StationImpactDetailsTarget["tone"]) {
  const base = "ml-auto inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold leading-none text-slate-900 dark:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:scale-95";
  if (tone === "active") {
    return `${base} border-red-500/35 bg-red-500/10 hover:bg-red-500/20 hover:border-red-500/60`;
  }
  if (tone === "planned") {
    return `${base} border-blue-500/35 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/60`;
  }
  if (tone === "reduced-speed-zone") {
    return `${base} border-[#F59E0B]/35 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 hover:border-[#F59E0B]/65`;
  }
  return `${base} border-[#FEEC41]/35 bg-[#FEEC41]/10 hover:bg-[#FEEC41]/20 hover:border-[#FEEC41]/65`;
}

function arrivalSourceTitle(arrivals: StationArrival[]) {
  const sources = [...new Set(arrivals.map((arrival) => arrival.source).filter(Boolean))];
  return sources.length > 0 ? `Source: ${sources.join(" / ")}` : "Source unavailable";
}

export function StationDetailPanel({ stationResult, loading, updating, selectedStationName, onClose, onSelectImpact, reducedMotion, authenticated = false, saved = false, savePending = false, onToggleSaved, onRequestSignIn }: Props) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, networkSegments, snapshot } = useDashboardData();
  const subwayOperatingState = useSubwayOperatingState();
  const rawStation = stationResult?.data ?? null;
  const station = rawStation && snapshot ? { ...rawStation, arrivals: [], impacts: [],
    access: { ...rawStation.access, summary: "Current accessibility status unknown. Reconnect for facility updates.", outages: [] },
  } : rawStation;
  const { pinnedLineIds, togglePin } = useArrivalLinePins("ttc", station?.id ?? null);
  const [hoveredPinLineId, setHoveredPinLineId] = useState<string | null>(null);

  const source = stationResult?.source;
  const stationPlannedClosures = station
    ? plannedClosuresForStation(station.id, plannedClosures, networkSegments)
    : [];
  const distinctImpacts = station
    ? distinctStationImpacts(
      [
        ...station.impacts,
        ...stationPlannedClosures.map((closure): StationImpact => ({
          id: closure.id,
          type: "planned-closure",
          severity: "planned",
          title: closure.title,
          summary: closure.description,
          updatedAgo: closure.updatedAgo ?? null,
          updatedAt: closure.updatedAt,
          source: closure.source,
        })),
      ],
      { activeAlerts, delays, reducedSpeedZones, plannedClosures },
    )
    : [];
  const stationNotices = station?.notices ?? [];
  const hasArrivalCountdownTicker = station?.arrivals.some(
    (arrival) => arrival.status !== "unavailable" && arrival.predictedAt
  ) ?? false;
  const [arrivalTick, setArrivalTick] = useState(() => Date.now());
  const hasElevatorOutage = station?.access.outages.some(
    (outage) => outage.assetType === "elevator"
  ) ?? false;
  const elevatorOutagesCount = station?.access.outages.filter(
    (outage) => outage.assetType === "elevator"
  ).length ?? 0;
  const escalatorOutagesCount = station?.access.outages.filter(
    (outage) => outage.assetType === "escalator"
  ).length ?? 0;
  const hasAccessibilityOutages = elevatorOutagesCount > 0 || escalatorOutagesCount > 0;
  const sortedOutages = station?.access.outages
    ? [...station.access.outages].sort((a, b) => {
        if (a.assetType === b.assetType) return 0;
        return a.assetType === "elevator" ? -1 : 1;
      })
    : [];

  const isWheelchairAccessible = station?.lines.some((line) => line.wheelchairAccessible) ?? false;
  const hasElevator = station?.lines.some((line) => line.hasElevator) ?? false;
  const hasWashroom = station ? (station.hasWashroom ?? isStationWashroomAvailable(station.id)) : false;
  const hasParking = station ? (station.hasParking ?? isStationParkingAvailable(station.id)) : false;
  const hasBicycleLockup = station ? (station.hasBicycleLockup ?? isStationBicycleLockupAvailable(station.id)) : false;
  const hasBicycleRepair = station ? (station.hasBicycleRepair ?? isStationBicycleRepairAvailable(station.id)) : false;
  const hasBikeShare = station ? (station.hasBikeShare ?? isStationBikeShareAvailable(station.id)) : false;
  const hasPpudo = station ? (station.hasPpudo ?? isStationPpudoAvailable(station.id)) : false;
  const hasAnyAmenities = isWheelchairAccessible || hasElevator || hasWashroom || hasParking || hasBicycleLockup || hasBicycleRepair || hasBikeShare || hasPpudo;
  const connections = station ? ttcStationConnections(station.id) : [];

  const accessibilityDetailsRef = useRef<HTMLDetailsElement>(null);
  const noticesDetailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArrivalTick(Date.now());
  }, [station?.id]);

  useEffect(() => {
    if (!hasArrivalCountdownTicker) {
      return;
    }

    const timer = window.setInterval(() => setArrivalTick(Date.now()), ARRIVAL_COUNTDOWN_TICK_MS);
    return () => window.clearInterval(timer);
  }, [hasArrivalCountdownTicker, station?.id]);

  const handleJumpToAccessibility = () => {
    if (accessibilityDetailsRef.current) {
      const detailsElement = accessibilityDetailsRef.current;
      const isAlreadyOpen = detailsElement.open;
      detailsElement.open = true;

      const summary = detailsElement.querySelector("summary");
      summary?.focus();

      const performScroll = () => {
        if (detailsElement) {
          detailsElement.scrollIntoView({
            behavior: reducedMotion ? "auto" : "smooth",
            block: "start",
          });
        }
      };

      if (isAlreadyOpen || reducedMotion) {
        performScroll();
      } else {
        // Wait a short duration to let the details panel transition start
        // so that scrollIntoView calculates the correct scroll destination.
        setTimeout(performScroll, 50);
      }
    }
  };

  const handleJumpToSection = (sectionId: string) => {
    if (sectionId === "accessibility") {
      handleJumpToAccessibility();
      return;
    }
    const target = document.querySelector(`[data-station-section="${sectionId}"]`);
    if (!target) return;

    if (target instanceof HTMLDetailsElement && !target.open) {
      target.open = true;
    }
    const parentDetails = target.closest("details");
    if (parentDetails && !parentDetails.open) {
      parentDetails.open = true;
    }

    target.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const navItems: StationSubmenuNavItem[] = [];
  if (station) {
    if (connections.length > 0) {
      navItems.push({
        id: "connected-network",
        label: connections.length === 1 ? "Connected Network" : "Connected Networks",
        shortLabel: "Networks",
        icon: <GitMerge size={13} aria-hidden="true" />,
      });
    }
    if (hasAnyAmenities) {
      navItems.push({
        id: "services-and-amenities",
        label: "Services & Amenities",
        shortLabel: "Amenities",
        icon: <ConciergeBell size={13} aria-hidden="true" />,
      });
    }
    const isLrt = isLrtOnlyStation(station.lines);
    const isSubwayAndLrt = isSubwayAndLrtStation(station.lines);
    const arrivalsLabel = isSubwayAndLrt
      ? "Train & LRT Arrivals"
      : isLrt
        ? "LRT Arrivals"
        : "Train Arrivals";
    const arrivalsShortLabel = isLrt ? "LRT" : "Trains";

    navItems.push({
      id: "arrivals",
      label: arrivalsLabel,
      shortLabel: arrivalsShortLabel,
      icon: <Train size={13} aria-hidden="true" />,
    });
    navItems.push({
      id: "surface-connections",
      label: "Surface Connections",
      shortLabel: "Buses",
      icon: <Bus size={13} aria-hidden="true" />,
    });
    if (stationNotices.length > 0) {
      navItems.push({
        id: "notices",
        label: "Station Notices",
        shortLabel: "Notices",
        icon: <FileText size={13} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />,
        count: stationNotices.length,
      });
    }
    navItems.push({
      id: "station-impacts",
      label: "Station Impacts",
      shortLabel: "Impacts",
      icon: <AlertCircle size={13} className="text-orange-500 dark:text-orange-400" aria-hidden="true" />,
      count: distinctImpacts.length > 0 ? distinctImpacts.length : undefined,
    });
    navItems.push({
      id: "accessibility",
      label: "Accessibility Outages",
      shortLabel: "Outages",
      icon: (
        <Image
          src="/assets/linewatch/accessibility-alert.svg"
          alt=""
          width={13}
          height={13}
          aria-hidden="true"
          className="shrink-0"
        />
      ),
      count: sortedOutages.length > 0 ? sortedOutages.length : undefined,
    });
  }

  const handleJumpToStationImpact = (impactId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    const impactElement = document.getElementById(`station-impact-${impactId}`);
    if (impactElement) {
      const section = impactElement.closest("details");
      if (section) section.open = true;
      const scroller = impactElement.closest<HTMLElement>(".station-detail-scroll");
      if (scroller) {
        // Scroll only the panel body, leaving its header and section controls
        // fixed. Align the beginning of long cards rather than their midpoint.
        const top = scroller.scrollTop
          + impactElement.getBoundingClientRect().top
          - scroller.getBoundingClientRect().top
          - scroller.clientTop
          - 8;
        scroller.scrollTo({
          top: Math.max(0, top),
          behavior: reducedMotion ? "instant" : "smooth",
        });
      }

      impactElement.classList.remove("station-impact-card-highlight");
      void impactElement.offsetWidth;
      impactElement.classList.add("station-impact-card-highlight");

      window.setTimeout(() => {
        impactElement.classList.remove("station-impact-card-highlight");
      }, 2200);
    }
  };

  const handleSummaryClick = (e: React.MouseEvent<HTMLElement>) => {
    const detailsElement = accessibilityDetailsRef.current;
    if (!detailsElement) return;

    if (detailsElement.open) {
      e.preventDefault();
      detailsElement.classList.add("collapsing");
      setTimeout(() => {
        detailsElement.open = false;
        detailsElement.classList.remove("collapsing");
      }, 150);
    }
  };

  const handleNoticesSummaryClick = (e: React.MouseEvent<HTMLElement>) => {
    const detailsElement = noticesDetailsRef.current;
    if (!detailsElement || !detailsElement.open) return;
    e.preventDefault();
    detailsElement.classList.add("collapsing");
    window.setTimeout(() => {
      detailsElement.open = false;
      detailsElement.classList.remove("collapsing");
    }, reducedMotion ? 0 : 150);
  };

  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const { sheetRef, isDragging, isExpanded, dragHandleProps, sheetStyle } = useMobileDraggableSheet();

  useEffect(() => () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }
  }, []);

  const handleCloseClick = () => {
    setIsClosing(true);
    const duration = reducedMotion ? 0 : (typeof window !== "undefined" && window.innerWidth < 768) ? 240 : 180;
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
      setIsClosing(false);
    }, duration);
  };

  return (
    <aside
      ref={sheetRef}
      style={sheetStyle}
      className={`station-detail-panel ${isClosing ? "station-detail-closing" : ""} ${isDragging ? "station-detail-sheet-dragging" : ""} fixed left-0 right-0 bottom-0 z-45 max-h-[calc(var(--visual-viewport-height,100dvh)*0.64)] flex flex-col overflow-hidden rounded-t-lg bg-[var(--panel)] pt-1.5 pb-4 px-4 text-slate-900 shadow-2xl dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-auto md:w-[min(calc(100vw-48px),460px)] md:max-h-[calc(var(--visual-viewport-height,100dvh)-128px)] md:rounded-none md:p-0 md:bg-transparent md:shadow-none`}
      data-closing={isClosing ? "true" : undefined}
      aria-live="polite"
      aria-label={station ? `${station.name} station details` : "Station details"}
      data-sheet-expanded={isExpanded ? "true" : undefined}
    >
      <MobileSheetDragHandle
        dragHandleProps={dragHandleProps}
        isDragging={isDragging}
        isExpanded={isExpanded}
      />

      <StationDetailHeader
        onPointerDown={dragHandleProps.onPointerDown}
        stationName={station?.name ?? selectedStationName ?? "Station details"}
        updating={updating}
        saved={saved}
        savePending={savePending}
        saveDisabled={!station && loading}
        onToggleSaved={() => {
          if (!authenticated) {
            onRequestSignIn?.();
            return;
          }
          if (station?.id) onToggleSaved?.(station.id);
        }}
        onClose={handleCloseClick}
      />

      <div className={`station-detail-body-wrapper w-full min-w-0 max-w-full flex-1 min-h-0 flex flex-col transition-all duration-200 ${updating ? "station-detail-body-updating" : ""}`}>
        <div
          key={station?.id ?? "empty"}
          className="station-detail-content-swap w-full min-w-0 max-w-full flex-1 min-h-0 flex flex-col"
        >
          {station && (
            <div className="mt-0 sm:-mt-0.5 md:mt-3.5 flex w-full min-w-0 max-w-full flex-col gap-1.5 md:gap-2.5 shrink-0" data-station-header-line-details>
              {station.lines.map((line) => (
                <div key={line.id} className="station-header-line-row flex items-center justify-between gap-2 sm:gap-2.5 min-w-0 md:py-0.5">
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                    <TransitLineBadge
                      lineId={line.id}
                      lineNumber={line.number}
                      lineName={line.name}
                      size={40}
                      className="station-header-line-badge shrink-0"
                    />
                    <span className="station-header-line-name text-[13px] sm:text-sm font-bold text-slate-900 dark:text-white leading-tight min-w-0 whitespace-normal break-words">
                      {line.name}
                    </span>
                  </div>
                  {line.platformLabel ? (
                    <StationLineDirectionIndicator
                      lineId={line.id}
                      platformLabel={line.platformLabel}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {station && (
            <StationSubmenuNavButtons
              items={navItems}
              onJumpToSection={handleJumpToSection}
            />
          )}

          <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto md:mt-3.5 mt-2 pb-3 station-detail-scroll station-detail-section-stack">
            {station && (station.arrivalContext?.scheduleMayBeDisrupted || stationPlannedClosures.length > 0) && (
              <div
                className="station-detail-disruption-card flex w-full flex-wrap items-center justify-start gap-2.5 shrink-0 rounded-md p-2.5 text-xs font-semibold"
                data-station-disruption-warning
              >
                <div className="station-disruption-heading flex items-center gap-2 font-extrabold text-amber-900 dark:text-white">
                  <AlertCircle size={19} className="animate-terminating-blink shrink-0 text-amber-600 dark:text-orange-400" />
                  <span className="station-disruption-heading-text">Schedule May Be Disrupted:</span>
                </div>
                {distinctImpacts.length > 0 && (
                  <div className="station-impact-jump-actions">
                    {distinctImpacts.map((impact) => {
                      const target = getStationImpactDetailsTarget(
                        impact,
                        activeAlerts,
                        delays,
                        reducedSpeedZones,
                        plannedClosures
                      );
                      const targetLabel = target?.label ?? "Station Impact";

                      return (
                        <a
                          key={impact.id}
                          href={`#station-impact-${impact.id}`}
                          onClick={(e) => handleJumpToStationImpact(impact.id, e)}
                          aria-label={`Jump to station impact: ${targetLabel} - ${impact.title}`}
                          title={`Jump to ${targetLabel}: ${impact.title}`}
                          className="station-impact-jump-button"
                        >
                          <StationImpactDetailsIcon
                            kind={target?.selection.kind ?? stationImpactKind(impact)}
                            tone={target?.tone}
                            size={17}
                          />
                          <span className="station-impact-jump-button-label">Press</span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {station && hasAccessibilityOutages && (
              <button
                type="button"
                onClick={handleJumpToAccessibility}
                className="flex w-full items-center justify-between gap-3 shrink-0 rounded-md border border-red-500/15 bg-red-500/5 px-2.5 py-1.5 text-left dark:border-red-500/20 dark:bg-red-500/10 transition-colors hover:bg-red-500/10 dark:hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                data-station-access-outage-summary
                aria-label="Active accessibility outages. Press for details."
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-red-700 dark:text-red-200">
                    Access Outages
                  </span>
                  <div className="h-4 w-[1px] bg-red-500/20" aria-hidden="true" />
                  <span className="flex items-center gap-2">
                    {elevatorOutagesCount > 0 && (
                      <StationAccessOutageBadge
                        assetType="elevator"
                        count={elevatorOutagesCount}
                        label={formatStationOutageLabel("elevator", elevatorOutagesCount)}
                      />
                    )}
                    {escalatorOutagesCount > 0 && (
                      <StationAccessOutageBadge
                        assetType="escalator"
                        count={escalatorOutagesCount}
                        label={formatStationOutageLabel("escalator", escalatorOutagesCount)}
                      />
                    )}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 dark:text-red-300">Details <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" /></span>
              </button>
            )}

            {station && connections.length > 0 && (
              <div data-station-section="connected-network" className="w-full">
                <StationConnectionBadges connections={connections} />
              </div>
            )}

            {station && hasAnyAmenities && (
              <div
                className="flex w-full flex-col gap-3 rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="services-and-amenities"
              >
                <div className="station-subsection-header flex items-center gap-2.5">
                  <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
                  <ConciergeBell size={14} className="shrink-0 text-slate-700 dark:text-white" aria-hidden="true" />
                  <h4 className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Services and Amenities
                  </h4>
                </div>
                <div className="grid grid-cols-3 gap-x-2.5 sm:gap-x-3.5 gap-y-3 sm:gap-y-3.5 items-center pt-0.5 sm:pt-1">
                  {isWheelchairAccessible && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Wheelchair accessible">
                      <Image
                        src="/assets/linewatch/accessible.svg"
                        alt="Wheelchair accessible"
                        width={25}
                        height={25}
                        className="w-[21px] h-[21px] sm:w-[25px] sm:h-[25px] rounded-[3px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,130,201,0.28)] dark:drop-shadow-[0_0_2px_rgba(0,130,201,0.38)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Accessible
                      </span>
                    </div>
                  )}
                  {hasElevator && (
                    <div
                      className="flex items-center gap-1.5 sm:gap-2 min-w-0"
                      data-facility-warning={hasElevatorOutage ? "elevator" : undefined}
                      title={hasElevatorOutage ? "Elevators available, outage reported" : "Elevators available"}
                    >
                      <Image
                        src="/assets/linewatch/outages/elevator.svg"
                        alt={hasElevatorOutage ? "Elevator available, outage reported" : "Elevator available"}
                        width={28}
                        height={28}
                        className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,130,201,0.28)] dark:drop-shadow-[0_0_2px_rgba(0,130,201,0.38)]"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                          Elevators
                        </span>
                        {hasElevatorOutage && (
                          <span className="w-fit rounded bg-amber-500/15 px-1 py-0.2 text-[8.5px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            Outage
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {hasWashroom && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Washrooms available">
                      <Image
                        src="/assets/linewatch/washroom.svg"
                        alt="Washrooms available"
                        width={28}
                        height={28}
                        className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,0,0,0.28)] dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.25)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Washrooms
                      </span>
                    </div>
                  )}
                  {hasParking && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Parking available">
                      <Image
                        src="/assets/linewatch/parking.svg"
                        alt="Parking available"
                        width={30}
                        height={30}
                        className="w-[26px] h-[26px] sm:w-[30px] sm:h-[30px] rounded-full shrink-0 drop-shadow-[0_0_1.5px_rgba(33,178,82,0.28)] dark:drop-shadow-[0_0_2px_rgba(33,178,82,0.38)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Parking
                      </span>
                    </div>
                  )}
                  {hasBicycleLockup && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Bicycle lock-up available">
                      <Image
                        src="/assets/linewatch/bicycle-lockup.svg"
                        alt="Bicycle lock-up available"
                        width={28}
                        height={28}
                        className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,0,0,0.28)] dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.25)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Bike Lock-up
                      </span>
                    </div>
                  )}
                  {hasBicycleRepair && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Bicycle repair stand available">
                      <Image
                        src="/assets/linewatch/bicycle-repair.svg"
                        alt="Bicycle repair stand available"
                        width={28}
                        height={28}
                        className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,0,0,0.28)] dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.25)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Bike Repair
                      </span>
                    </div>
                  )}
                  {hasBikeShare && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Bike Share Toronto available">
                      <Image
                        src="/assets/linewatch/bike-share-toronto.svg"
                        alt="Bike Share Toronto available"
                        width={30}
                        height={30}
                        className="w-[26px] h-[26px] sm:w-[30px] sm:h-[30px] rounded-full shrink-0 drop-shadow-[0_0_1.5px_rgba(0,100,75,0.28)] dark:drop-shadow-[0_0_2px_rgba(0,100,75,0.38)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Bike Share
                      </span>
                    </div>
                  )}
                  {hasPpudo && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Passenger pick-up / drop-off (PPUDO) available">
                      <Image
                        src="/assets/linewatch/passenger-pick-up.svg"
                        alt="Passenger pick-up / drop-off available"
                        width={28}
                        height={28}
                        className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,0,0,0.28)] dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.25)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Passenger Pick-up
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

      {loading && !station && (
        <div className="station-detail-loading rounded-lg border border-black/10 bg-slate-100 p-3 text-sm font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          Loading station details...
        </div>
      )}

      {!loading && !station && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          Station detail is unavailable for this stop.
        </div>
      )}

      {station && (
        <div className="flex w-full flex-col gap-3">
          {source === "fallback" && (
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-3 text-xs font-semibold text-blue-700 dark:text-blue-300">
              Backend unavailable. Showing local fallback station data.
            </div>
          )}

          {(() => {
            const subwayClosed = subwayOperatingState.status === "closed";
            const isLrt = isLrtOnlyStation(station.lines);
            const isSubwayAndLrt = isSubwayAndLrtStation(station.lines);
            const isDemo = station.arrivals.length > 0 && station.arrivals.every((arrival) => arrival.status === "demo");
            const arrivalHeading = isDemo
              ? (isSubwayAndLrt ? "Demo Train & LRT Arrivals" : isLrt ? "Demo LRT Arrivals" : "Demo Train Arrivals")
              : (isSubwayAndLrt ? "Train & LRT Arrivals" : isLrt ? "LRT Arrivals" : "Train Arrivals");

            const arrivalsDisrupted = station.arrivalContext ? station.arrivalContext.scheduleMayBeDisrupted : false;
            const hasUnavailableArrivals = Boolean(snapshot) || station.arrivals.some((arrival) => arrival.status === "unavailable");
            const hasLiveArrivals = station.arrivals.some((arrival) => arrival.status === "live");
            const arrivalGroups = sortArrivalGroupsByPinnedLine(hasUnavailableArrivals
              ? []
              : groupStationArrivals(station.arrivals, station.lines, {
                stationId: station.id,
                includeEmptyDirections: hasLiveArrivals,
              }), pinnedLineIds);
            const arrivalDisclaimer = formatArrivalDisclaimer(station.arrivals, station.disclaimer);
            const arrivalSectionClassName = "w-full rounded-lg border border-black/10 bg-slate-50 p-3 transition-colors dark:border-white/10 dark:bg-white/5";

            return (
              <section
                className={arrivalSectionClassName}
                data-arrivals-disrupted={arrivalsDisrupted}
                data-arrivals-subway-closed={subwayClosed ? "true" : undefined}
                data-station-section="arrivals"
              >
                {/* Schedule May Be Disrupted */}
                <h3 className="station-subsection-header flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
                  <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
                  <Train size={20} className="shrink-0" />
                  <span>{arrivalHeading}</span>
                </h3>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {snapshot ? "Reconnect for current arrival information" : formatArrivalSourceSummary(station.arrivals, station.arrivalsSource)}
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  {hasUnavailableArrivals ? (
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                      Arrival Data Unavailable
                    </p>
                  ) : arrivalGroups.length === 0 ? (
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                      {hasLiveArrivals ? "Refreshing Live Arrivals" : "No Arrivals Available"}
                    </p>
                  ) : (() => {
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

                    return arrivalLineSections.map((section, sectionIndex) => {
                      const showLineDivider = sectionIndex > 0;
                      const isPinned = pinnedLineIds.includes(section.lineId);
                      const isHoveredPin = hoveredPinLineId === section.lineId;
                      const lineBadgeColors = transitLineBadgeColors(section.lineId);
                      const lineColor = lineBadgeColors.backgroundColor;

                      return (
                        <Fragment key={section.lineId}>
                          {showLineDivider && (
                            <div
                              aria-hidden="true"
                              className="station-arrival-line-divider"
                              data-arrival-line-divider
                            />
                          )}
                          <div
                            data-arrival-line-section={section.lineId}
                            data-pinned-line={isPinned ? "true" : "false"}
                            className={`flex flex-col gap-2 rounded-lg px-1 py-1.5 transition-colors duration-200 ${
                              isPinned
                                ? "bg-amber-500/[0.08] dark:bg-amber-400/[0.07]"
                                : "bg-transparent"
                            }`}
                          >
                            <div className="flex items-center justify-between relative z-10">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <TransitLineBadge
                                  lineId={section.lineId}
                                  lineNumber={section.lineNumber}
                                  lineName={section.lineName}
                                  size={32}
                                  className="shrink-0 relative z-10"
                                />
                                <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                                  {section.lineName ? `Line ${section.lineNumber} - ${section.lineName}` : `Line ${section.lineNumber}`}
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
                                pinned={isPinned}
                                hovered={isHoveredPin}
                                onHoverChange={(hovered) => setHoveredPinLineId(hovered ? section.lineId : null)}
                                lineLabel={`Line ${section.lineNumber}`}
                                stationName={station.name}
                                onToggle={() => togglePin(section.lineId)}
                              />
                            </div>
                            <div className="flex flex-col gap-2.5">
                              {section.groups.map((group, groupIndex) => {
                                const isFirst = groupIndex === 0;
                                const isLast = groupIndex === section.groups.length - 1;
                                const emptyLiveDirection = hasLiveArrivals && group.arrivals.length === 0;
                                const groupSourceLabel = formatArrivalSourceBadgeLabel(group.arrivals, { emptyLiveDirection });
                                const groupSourceTitle = emptyLiveDirection
                                  ? "Live source checked; no prediction for this direction"
                                  : arrivalSourceTitle(group.arrivals);
                                const groupEmptyMessage = emptyLiveDirection
                                  ? "No live ETA for this direction right now. Live updates may appear at any moment."
                                  : "No Arrivals Available";

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
                                      {(() => {
                                        const match = group.directionLabel.match(/^(Northbound|Southbound|Eastbound|Westbound)\s+to\s+(.+)$/i);
                                        if (match) {
                                          const directionPart = match[1];
                                          const destinationPart = `To ${match[2]}`;
                                          return (
                                            <div className="flex flex-col min-w-0 leading-tight">
                                              <strong className="min-w-0 break-words font-black text-slate-900 dark:text-white">
                                                {directionPart}
                                              </strong>
                                              <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                                {destinationPart}
                                                {group.isTerminating && (
                                                  <ArrivalTerminatingBadge />
                                                )}
                                              </span>
                                            </div>
                                          );
                                        }
                                        return (
                                          <div className="flex flex-col min-w-0 leading-tight">
                                            <strong className="min-w-0 break-words font-black text-slate-900 dark:text-white">
                                              {group.directionLabel}
                                            </strong>
                                            {group.isTerminating && (
                                              <ArrivalTerminatingBadge />
                                            )}
                                          </div>
                                        );
                                      })()}
                                        <div className="ml-auto flex shrink-0 items-center gap-2 self-center">
                                          <ArrivalSourceBadge
                                            label={groupSourceLabel}
                                            title={groupSourceTitle}
                                          />
                                        </div>
                                      </div>
                                    {group.arrivals.length === 0 ? (
                                      <p className="mt-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        {groupEmptyMessage}
                                      </p>
                                    ) : group.arrivals.length === 1 && group.arrivals[0].label.toLowerCase() === "no scheduled service" ? (
                                      <p className="mt-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        No Scheduled Service
                                      </p>
                                    ) : (
                                      <div className="mt-3 grid grid-cols-3 gap-2">
                                        {group.arrivals.map((arrival, index) => {
                                          const detailedCountdown = index === 0 && shouldUseDetailedArrivalCountdown(arrival, arrivalTick);
                                          const due = isArrivalDue(arrival, arrivalTick);
                                          const clockTime = formatArrivalClockTime(arrival.predictedAt);
                                          const arrivalLabelClassName = detailedCountdown && !due
                                            ? "whitespace-nowrap text-base sm:text-lg font-black leading-none tracking-tight tabular-nums"
                                            : "text-base sm:text-lg font-black leading-none";
                                          const arrivalTileClassName = [
                                            "station-arrival-tile relative flex min-h-[74px] sm:min-h-[78px] flex-col items-center justify-center rounded-md border px-1.5 pt-3.5 pb-1.5 text-center transition-colors",
                                            due
                                              ? "border-red-400/80 bg-red-900/85 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.25)]"
                                              : detailedCountdown
                                                ? "border-emerald-400/35 bg-emerald-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(52,211,153,0.12)] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-white"
                                                : "border-black/10 bg-slate-950/[0.03] text-slate-900 dark:border-white/10 dark:bg-[#0f1117] dark:text-white",
                                          ].join(" ");

                                          return (
                                            <div
                                              key={`${arrival.lineId}-${arrival.direction}-${arrival.predictedAt ?? arrival.label}-${index}`}
                                              data-arrival-due={due ? "true" : "false"}
                                              className={arrivalTileClassName}
                                            >
                                              <ArrivalTileSourceIndicator status={arrival.status} isDue={due} />
                                              <strong className={arrivalLabelClassName}>
                                                {formatArrivalTileLabel(arrival, { detailedCountdown, now: arrivalTick })}
                                              </strong>
                                              {clockTime && (
                                                <span className={due
                                                  ? "mt-1.5 text-xs font-semibold text-red-100/80"
                                                  : "mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400"}
                                                >
                                                  {clockTime}
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </Fragment>
                      );
                    });
                  })()}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-amber-800/70 dark:text-amber-200/55">{arrivalDisclaimer}</p>
	              </section>
	            );
	          })()}

              <SurfaceConnectionsSection networkId="ttc" stationId={station.id} />

              {stationNotices.length > 0 && (
                <details
                  ref={noticesDetailsRef}
                  className="station-notices-details w-full rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                  data-station-section="notices"
                  aria-label="TTC station notices"
                >
                  <summary
                    onClick={handleNoticesSummaryClick}
                    className="station-notices-summary flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-black text-slate-900 dark:text-white"
                  >
                    <div className="station-subsection-header flex min-w-0 items-center gap-2.5">
                      <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
                      <FileText size={20} className="shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span className="min-w-0 truncate">Station Notices</span>
                      <span
                        className={`desktop-menu-count-badge ${
                          stationNotices.length > 0 ? "desktop-menu-count-closures" : "desktop-menu-count-slate"
                        } flex h-6 ${
                          stationNotices.length < 10 ? "w-6" : "min-w-[24px] px-1.5"
                        } shrink-0 items-center justify-center rounded-full text-[11px] font-bold`}
                      >
                        {stationNotices.length}
                      </span>
                    </div>
                    <ChevronDown
                      size={18}
                      aria-hidden="true"
                      className="station-notices-chevron shrink-0 text-slate-500 dark:text-slate-300"
                    />
                  </summary>
                  <div className="station-notices-content-wrapper">
                    <div className="station-notices-content pt-3 flex flex-col gap-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Reviewed TTC station information
                      </p>
                      {stationNotices.map((notice) => {
                        const effectiveStart = formatStationNoticeDate(notice.effectiveStart);
                        const effectiveEnd = formatStationNoticeDate(notice.effectiveEnd);
                        const verified = formatStationNoticeDate(notice.lastVerifiedAt);
                        return (
                          <article
                            key={notice.id}
                            className="station-notice-card flex flex-col gap-2.5 rounded-md border border-black/10 bg-white/80 p-3 text-sm shadow-sm dark:border-white/10 dark:bg-[var(--panel)]/80"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">
                                {stationNoticeCategoryLabel(notice.category)}
                              </span>
                              {(effectiveStart || effectiveEnd) && (
                                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                  {effectiveStart && effectiveEnd
                                    ? `${effectiveStart}–${effectiveEnd}`
                                    : effectiveStart
                                      ? `Effective ${effectiveStart}`
                                      : `Until ${effectiveEnd}`}
                                </span>
                              )}
                            </div>
                            <div>
                              <strong className="block font-bold text-slate-900 dark:text-white">{notice.title}</strong>
                              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{notice.summary}</p>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-2 text-[11px] text-slate-500 dark:border-white/5 dark:text-slate-400">
                              <span>{notice.source}</span>
                              {verified && <span>Verified {verified}</span>}
                            </div>
                            <a
                              href={notice.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex w-fit items-center gap-1 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
                            >
                              TTC details <ExternalLink size={12} aria-hidden="true" />
                            </a>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </details>
              )}

	          <details
	            data-station-section="station-impacts"
	            open={distinctImpacts.length > 0}
	            className="station-impacts-details group w-full rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
	          >
	            <summary className="station-impacts-summary flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-black text-slate-900 dark:text-white">
	              <div className="station-subsection-header flex min-w-0 items-center gap-2.5">
	                <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
	                <AlertCircle size={20} className="shrink-0 text-orange-500 dark:text-orange-400" />
	                <span className="truncate">Station Impacts</span>
	                <span
	                  className={`desktop-menu-count-badge ${
	                    distinctImpacts.length > 0 ? "desktop-menu-count-rsz" : "desktop-menu-count-slate"
	                  } flex h-6 ${
	                    distinctImpacts.length < 10 ? "w-6" : "min-w-[24px] px-1.5"
	                  } shrink-0 items-center justify-center rounded-full text-[11px] font-bold`}
	                >
	                  {distinctImpacts.length}
	                </span>
	              </div>
	              <ChevronDown
	                size={18}
	                aria-hidden="true"
	                className="station-impacts-chevron shrink-0 text-slate-500 dark:text-slate-300 transition-transform duration-200"
	              />
	            </summary>
	            <div className="pt-3 flex flex-col gap-2">
	              {distinctImpacts.length === 0 ? (
	                <p className="py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
	                  {snapshot ? "Current station impacts unknown. Reconnect for updates." : "No active impacts for this station."}
	                </p>
	              ) : (
	                distinctImpacts.map((impact) => {
	                  const detailsTarget = getStationImpactDetailsTarget(
	                    impact,
	                    activeAlerts,
	                    delays,
	                    reducedSpeedZones,
	                    plannedClosures
	                  );
	                  const impactTone = detailsTarget?.tone ?? fallbackStationImpactTone(impact);
	                  const classificationLabel = detailsTarget?.label ?? fallbackStationImpactLabel(impact);
	                  const impactKind = detailsTarget?.selection.kind ?? stationImpactKind(impact);

	                  return (
	                    <div
	                      key={impact.id}
	                      id={`station-impact-${impact.id}`}
	                      data-station-impact-tone={impactTone}
	                      className={stationImpactCardClassName(impactTone)}
	                    >
	                      <div className="flex items-center gap-2.5 font-bold text-sm text-slate-900 dark:text-white">
	                        <StationImpactDetailsIcon kind={impactKind} tone={impactTone} size={26} />
	                        <span data-station-impact-classification={classificationLabel} className="leading-none flex items-center">{classificationLabel}</span>
	                      </div>

	                      <div className="flex flex-col gap-1">
	                        <strong className={stationImpactTitleClassName()}>{impact.title}</strong>
	                        {impact.summary && impact.summary !== impact.title && (
	                          <p className="text-slate-700 dark:text-slate-200 leading-snug">{impact.summary}</p>
	                        )}
	                      </div>

	                      <div className="flex flex-wrap items-center justify-between gap-2">
	                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 min-w-0">
	                          {normalizeDashboardSourceLabel(impact.source)} / {impact.updatedAt
	                            ? formatImpactTimestamp(impact.updatedAt)
	                            : impact.updatedAgo}
	                        </p>
	                        {detailsTarget && onSelectImpact && (
	                          <button
	                            type="button"
	                            onClick={() => onSelectImpact(detailsTarget.selection)}
	                            aria-label={`Open ${detailsTarget.label} details`}
	                            className={stationImpactButtonClassName(detailsTarget.tone)}
	                          >
	                            <BadgeInfo size={16} className="shrink-0 text-current" aria-hidden="true" />
	                            <span className="truncate leading-none flex items-center">View Details</span>
	                          </button>
	                        )}
	                      </div>
	                    </div>
	                  );
	                })
	              )}
	            </div>
	          </details>

	          <details ref={accessibilityDetailsRef} data-station-section="accessibility" className="station-accessibility-details w-full rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <summary
              onClick={handleSummaryClick}
              className="station-accessibility-summary flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-black text-slate-900 dark:text-white"
            >
              <div className="station-subsection-header flex min-w-0 items-center gap-2.5">
                <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
                <Image
                  src="/assets/linewatch/accessibility-alert.svg"
                  alt=""
                  width={20}
                  height={20}
                  aria-hidden="true"
                  className="w-5 h-5 shrink-0"
                />
                <span className="min-w-0 truncate">Accessibility Outages</span>
                <span
                  className={`desktop-menu-count-badge ${
                    station.access.outages.length > 0 ? "desktop-menu-count-accessibility" : "desktop-menu-count-slate"
                  } flex h-6 ${
                    station.access.outages.length < 10 ? "w-6" : "min-w-[24px] px-1.5"
                  } shrink-0 items-center justify-center rounded-full text-[11px] font-bold`}
                >
                  {station.access.outages.length}
                </span>
              </div>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className="station-accessibility-chevron shrink-0 text-slate-500 dark:text-slate-300"
              />
            </summary>
            <div className="station-accessibility-content-wrapper">
              <div className="station-accessibility-content pt-3 flex flex-col gap-3">
                {sortedOutages.length > 0 && (
                  <div className="flex flex-wrap gap-4 items-center">
                    {elevatorOutagesCount > 0 && (
                      <div className="relative inline-flex" title={`${elevatorOutagesCount} Elevator Outages`}>
                        <Image
                          src="/assets/linewatch/outages/elevator.svg"
                          alt="Elevator Outages"
                          width={36}
                          height={36}
                          className="rounded"
                        />
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[8px] font-black text-white ring-1 ring-slate-50 dark:ring-[#0a0c10]">
                          {elevatorOutagesCount}
                        </span>
                      </div>
                    )}
                    {escalatorOutagesCount > 0 && (
                      <div className="relative inline-flex" title={`${escalatorOutagesCount} Escalator Outages`}>
                        <Image
                          src="/assets/linewatch/outages/escalator.svg"
                          alt="Escalator Outages"
                          width={36}
                          height={36}
                          className="rounded"
                        />
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[8px] font-black text-white ring-1 ring-slate-50 dark:ring-[#0a0c10]">
                          {escalatorOutagesCount}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {station.access.updatedAgo}
                </p>
                {sortedOutages.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {sortedOutages.map((outage) => (
                      <div key={outage.id} className="station-accessibility-card flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                        {outage.assetType === "elevator" && (
                          <div className="relative shrink-0">
                            <Image
                              src="/assets/linewatch/outages/elevator.svg"
                              alt="Elevator"
                              width={32}
                              height={32}
                              className="rounded"
                            />
                            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-[7px] font-black text-white ring-1 ring-amber-50 dark:ring-[#0a0c10]">
                              ✕
                            </span>
                          </div>
                        )}
                        {outage.assetType === "escalator" && (
                          <div className="relative shrink-0">
                            <Image
                              src="/assets/linewatch/outages/escalator.svg"
                              alt="Escalator"
                              width={32}
                              height={32}
                              className="rounded"
                            />
                            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-[7px] font-black text-white ring-1 ring-amber-50 dark:ring-[#0a0c10]">
                              ✕
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="block font-normal text-amber-800 dark:text-amber-200">{outage.title}</span>
                          <p className="mt-1 text-slate-600 dark:text-slate-300 text-xs leading-relaxed">{outage.description}</p>
                          <dl className="impact-metadata-grid">
                            <div>
                              <dt>EST. RESOLUTION</dt>
                              <dd>TBD</dd>
                            </div>
                            <div>
                              <dt>UPDATED</dt>
                              <dd>{formatImpactTimestamp(outage.updatedAt)}</dd>
                            </div>
                            {suppliedAlertCause(outage.cause) && (
                              <div className="col-span-2">
                                <dt>CAUSE</dt>
                                <dd>{suppliedAlertCause(outage.cause)}</dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </details>

	        </div>
      )}
      </div>
        </div>
      </div>
    </aside>
  );
}
