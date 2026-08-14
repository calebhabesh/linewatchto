"use client";


import { Fragment, useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowRight, BadgeInfo, Check, ChevronDown, Construction, Train } from "lucide-react";
import Image from "next/image";
import { normalizeDashboardSourceLabel } from "../app/dashboard-source-label";
import { formatImpactTimestamp } from "../app/impact-time";
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
import { isLrtOnlyStation, isSubwayAndLrtStation, type StationArrival, type StationDataResult, type StationDetail, type StationImpact } from "../app/station-data";
import { distinctStationImpacts } from "../app/station-impact-types";
import { useDashboardData } from "../app/DataContext";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import { TransitLineBadge } from "./TransitLineBadge";
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
import { LiveSignalIcon } from "./LiveSignalIcon";
import { StationDetailHeader } from "./StationDetailHeader";
import { ArrivalLinePinButton } from "./ArrivalLinePinButton";
import { useArrivalLinePins } from "../hooks/useArrivalLinePins";
import { ttcStationConnections } from "../app/station-connections";
import { StationConnectionBadges } from "./StationConnectionBadges";
import { SurfaceConnectionsSection } from "./SurfaceConnectionsSection";

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
        selection: { kind: "planned-closure", id: matchingAlert.id },
        tone: "active",
      };
    }

    if (matchingAlert.severity === "suspension") {
      return {
        label: "Active Alert",
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

  const plannedClosure = plannedClosures.find((closure) => closure.id === impact.id);
  if (plannedClosure) {
    return {
      label: "Planned Closure",
      selection: { kind: "planned-closure", id: plannedClosure.id },
      tone: "planned",
    };
  }

  const delay = delays.find((d) => d.id === impact.id);
  if (delay) {
    return {
      label: "Delay",
      selection: { kind: "delay", id: delay.id },
      tone: "delay",
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

function lineBadgeTextColor(lineId: string) {
  return lineId === "line-1" || lineId === "line-6" ? "#000000" : "#ffffff";
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
      <span className="station-access-outage-count">{count}</span>
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
    return "Planned Closure";
  }
  if (impact.severity === "suspension") {
    return "Active Alert";
  }
  return "Delay";
}

function stationImpactCardClassName(tone: StationImpactDetailsTarget["tone"]) {
  const base = "flex flex-col gap-2.5 rounded-lg border border-black/10 bg-slate-50 p-3 text-sm border-l-2 dark:border-white/10 dark:bg-white/5 transition-all";
  if (tone === "active") {
    return `${base} suspension-card-border shadow-[inset_2px_0_6px_-2px_rgba(239,68,68,0.2)]`;
  }
  if (tone === "planned") {
    return `${base} planned-closure-card-border shadow-[inset_2px_0_6px_-2px_rgba(59,130,246,0.2)]`;
  }
  if (tone === "reduced-speed-zone") {
    return `${base} rsz-card-border shadow-[inset_2px_0_6px_-2px_rgba(245,158,11,0.2)]`;
  }
  return `${base} delay-card-border shadow-[inset_2px_0_6px_-2px_rgba(254,236,65,0.18)]`;
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

function arrivalSourceBadgeClassName(label: string) {
  const base = "inline-flex h-[22px] shrink-0 items-center rounded border px-2 text-[10.5px] font-black uppercase tracking-wide leading-none";
  if (label === "Live") {
    return `${base} border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200`;
  }
  if (label === "Scheduled") {
    return `${base} border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300`;
  }
  if (label === "Mixed") {
    return `${base} border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200`;
  }
  if (label === "No live ETA") {
    return `${base} border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300`;
  }
  if (label === "Demo") {
    return `${base} border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-200`;
  }
  return `${base} border-slate-400/30 bg-slate-500/5 text-slate-500 dark:text-slate-400`;
}

function arrivalSourceTitle(arrivals: StationArrival[]) {
  const sources = [...new Set(arrivals.map((arrival) => arrival.source).filter(Boolean))];
  return sources.length > 0 ? `Source: ${sources.join(" / ")}` : "Source unavailable";
}

export function StationDetailPanel({ stationResult, loading, updating, selectedStationName, onClose, onSelectImpact, reducedMotion, authenticated = false, saved = false, savePending = false, onToggleSaved, onRequestSignIn }: Props) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures } = useDashboardData();
  const subwayOperatingState = useSubwayOperatingState();
  const station = stationResult?.data ?? null;
  const { pinnedLineIds, togglePin } = useArrivalLinePins("ttc", station?.id ?? null);
  const [hoveredPinLineId, setHoveredPinLineId] = useState<string | null>(null);
  const source = stationResult?.source;
  const distinctImpacts = station
    ? distinctStationImpacts(station.impacts, { activeAlerts, delays, reducedSpeedZones, plannedClosures })
    : [];
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
  const connections = station ? ttcStationConnections(station.id) : [];

  const accessibilityDetailsRef = useRef<HTMLDetailsElement>(null);

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

  const handleJumpToStationImpact = (impactId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    const impactElement = document.getElementById(`station-impact-${impactId}`);
    if (impactElement) {
      impactElement.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });

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

  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }
  }, []);

  const handleCloseClick = () => {
    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
      setIsClosing(false);
    }, 380);
  };

  return (
    <aside
      className={`station-detail-panel ${isClosing ? "station-detail-closing" : ""} fixed left-0 right-0 bottom-0 z-45 max-h-[calc(var(--visual-viewport-height,100dvh)*0.64)] flex flex-col overflow-hidden rounded-t-lg border border-black/10 bg-white p-4 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#0a0c10] dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-auto md:w-[min(calc(100vw-48px),460px)] md:max-h-[calc(var(--visual-viewport-height,100dvh)-128px)] md:rounded-lg`}
      aria-live="polite"
      aria-label={station ? `${station.name} station details` : "Station details"}
    >
      <StationDetailHeader
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

      <div className={`station-detail-body-wrapper flex-1 min-h-0 flex flex-col transition-all duration-200 ${updating ? "station-detail-body-updating" : ""}`}>
        <div
          key={station?.id ?? "empty"}
          className="station-detail-content-swap flex-1 min-h-0 flex flex-col"
        >
          {station && (isWheelchairAccessible || hasElevator) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5 shrink-0">
              {isWheelchairAccessible && (
                <span className="inline-flex items-center gap-1 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-[4px] border border-black/15 dark:border-white/15 uppercase tracking-wider bg-slate-100 dark:bg-white/5 whitespace-nowrap">
                  <Check size={11} className="text-emerald-600 dark:text-emerald-400 stroke-[3.5] shrink-0" />
                  Wheelchair Accessible
                </span>
              )}
              {hasElevator && (
                <span className="inline-flex items-center gap-1 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-[4px] border border-black/15 dark:border-white/15 uppercase tracking-wider bg-slate-100 dark:bg-white/5 whitespace-nowrap">
                  <Check size={11} className="text-emerald-600 dark:text-emerald-400 stroke-[3.5] stroke-[3.5] shrink-0" />
                  Elevator Access
                </span>
              )}
            </div>
          )}

          {station && hasAccessibilityOutages && (
            <button
              type="button"
              onClick={handleJumpToAccessibility}
              className="mt-2.5 flex w-full items-center justify-between gap-3 shrink-0 rounded-md border border-red-500/15 bg-red-500/5 px-2.5 py-1.5 text-left dark:border-red-500/20 dark:bg-red-500/10 transition-colors hover:bg-red-500/10 dark:hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
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
              <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-red-600 dark:text-red-400 opacity-80 flex items-center gap-1.5">
                Press for Details
                <ArrowRight size={11} strokeWidth={3} className="shrink-0" />
              </span>
            </button>
          )}

          <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto mt-3 pb-3 pr-4 -mr-4 station-detail-scroll station-detail-section-stack">
      {station && <StationConnectionBadges connections={connections} />}
      {station && (
        <div className="flex flex-col gap-2" data-station-header-line-details>
          {station.lines.map((line) => (
            <div
              key={line.id}
              className="grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md border border-black/10 bg-slate-50 px-4 py-3.5 dark:border-white/10 dark:bg-white/5"
            >
              <div className="min-w-0">
                <span
                  className="inline-flex min-h-8 max-w-full min-w-0 items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-black dark:border-white/10"
                  style={{ backgroundColor: line.color, color: lineBadgeTextColor(line.id) }}
                  title={line.platformLabel}
                >
                  {line.number}
                  <span className="min-w-0 truncate">{line.name}</span>
                </span>
                <p className="mt-2 break-words text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {line.platformLabel}
                </p>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-3 pl-2 pr-1">
                {line.wheelchairAccessible && (
                  <span
                    className="flex items-center justify-center p-0.5"
                    title="Wheelchair accessible"
                  >
                    <Image
                      src="/assets/linewatch/wheel-chair-symbol.svg"
                      alt="Wheelchair accessible"
                      width={34}
                      height={34}
                      className="w-[34px] h-[34px] rounded-md drop-shadow-[0_0_1.5px_rgba(0,130,201,0.28)] dark:drop-shadow-[0_0_2px_rgba(0,130,201,0.38)]"
                    />
                  </span>
                )}
                {line.hasElevator && (
                  <span
                    className="flex items-center justify-center"
                    data-facility-warning={hasElevatorOutage ? "elevator" : undefined}
                    title={hasElevatorOutage ? "Elevator available, outage reported" : "Elevator available"}
                  >
                    <Image
                      src="/assets/linewatch/outages/elevator.svg"
                      alt={hasElevatorOutage ? "Elevator available, outage reported" : "Elevator available"}
                      width={37}
                      height={37}
                      className="w-[37px] h-[37px] drop-shadow-[0_0_1.5px_rgba(0,130,201,0.28)] dark:drop-shadow-[0_0_2px_rgba(0,130,201,0.38)]"
                    />
                  </span>
                )}
              </div>
            </div>
          ))}
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
        <div className="flex flex-col gap-3">
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
            const closedTitle = isSubwayAndLrt ? "Subway & LRT Closed" : isLrt ? "LRT Closed" : "Subway Closed";

            if (subwayClosed) {
              return (
                <section
                  className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                  data-arrivals-subway-closed="true"
                  data-station-section="arrivals"
                >
                  <h3 className="flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
                    <Train size={20} className="shrink-0" />
                    <span>{arrivalHeading}</span>
                  </h3>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {formatArrivalSourceSummary(station.arrivals, station.arrivalsSource)}
                  </p>
                  <div className="mt-3 rounded-md border border-black/10 bg-white/60 px-3 py-4 text-center dark:border-white/10 dark:bg-black/10">
                    <p className="text-sm font-semibold leading-snug text-slate-500 dark:text-slate-400">
                      <span className="block">{closedTitle}</span>
                      <span className="block">Arrivals Not Available</span>
                    </p>
                  </div>
                </section>
              );
            }

            const arrivalsDisrupted = station.arrivalContext ? station.arrivalContext.scheduleMayBeDisrupted : false;
            const hasUnavailableArrivals = station.arrivals.some((arrival) => arrival.status === "unavailable");
            const hasLiveArrivals = station.arrivals.some((arrival) => arrival.status === "live");
            const arrivalGroups = sortArrivalGroupsByPinnedLine(hasUnavailableArrivals
              ? []
              : groupStationArrivals(station.arrivals, station.lines, {
                stationId: station.id,
                includeEmptyDirections: hasLiveArrivals,
              }), pinnedLineIds);
            const arrivalDisclaimer = formatArrivalDisclaimer(station.arrivals, station.disclaimer);
            const arrivalSectionClassName = [
              "rounded-lg border p-3 transition-colors",
              arrivalsDisrupted
                ? "border-slate-300 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-300"
                : "border-black/10 bg-slate-50 dark:border-white/10 dark:bg-white/5",
            ].join(" ");

            return (
              <section
                className={arrivalSectionClassName}
                data-arrivals-disrupted={arrivalsDisrupted}
                data-station-section="arrivals"
              >
                {/* Schedule May Be Disrupted */}
                <h3 className="flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
                  <Train size={20} className="shrink-0" />
                  <span>{arrivalHeading}</span>
                </h3>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {formatArrivalSourceSummary(station.arrivals, station.arrivalsSource)}
                </p>
                {arrivalsDisrupted && station.arrivalContext && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-semibold dark:border-amber-500/30 dark:bg-amber-500/10">
                    <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                      <AlertCircle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>Schedule May Be Disrupted:</span>
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
                              />
                              <span className="station-impact-jump-button-label">Press</span>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
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
                            className="flex flex-col gap-2"
                          >
                            <div className="flex items-center justify-between px-1 py-1">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <TransitLineBadge
                                  lineId={section.lineId}
                                  lineNumber={section.lineNumber}
                                  lineName={section.lineName}
                                  size={32}
                                  className="shrink-0"
                                />
                                <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                                  {section.lineName ? `Line ${section.lineNumber} - ${section.lineName}` : `Line ${section.lineNumber}`}
                                </span>
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
                            <div className="flex flex-col gap-2">
                              {section.groups.map((group) => {
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
                                    className={`rounded-md border p-3 text-sm shadow-sm transition-colors duration-150 ${
                                      isPinned || isHoveredPin
                                        ? "border-amber-400/60 bg-amber-400/[0.06] dark:border-amber-400/50 dark:bg-amber-400/[0.08]"
                                        : "border-black/10 bg-white/80 dark:border-white/10 dark:bg-[#12151c]/80"
                                    }`}
                                  >
                                    <div className="flex min-w-0 items-center gap-3">
                                      <TransitLineBadge
                                        lineId={section.lineId}
                                        lineNumber={section.lineNumber}
                                        lineName={section.lineName}
                                        size={27}
                                        className="shrink-0"
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
                                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                {destinationPart}
                                              </span>
                                            </div>
                                          );
                                        }
                                        return (
                                          <strong className="min-w-0 break-words font-black text-slate-900 dark:text-white">
                                            {group.directionLabel}
                                          </strong>
                                        );
                                      })()}
                                      <div className="ml-auto flex shrink-0 items-center gap-2 self-center">
                                        <span
                                          className={arrivalSourceBadgeClassName(groupSourceLabel)}
                                          data-arrival-source={groupSourceLabel.toLowerCase()}
                                          title={groupSourceTitle}
                                          aria-label={groupSourceTitle}
                                        >
                                          {groupSourceLabel}
                                          {groupSourceLabel === "Live" ? (
                                            <LiveSignalIcon className="ml-1 inline-block shrink-0 text-emerald-600 dark:text-emerald-300" size={14} />
                                          ) : null}
                                        </span>
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
                                            ? "whitespace-nowrap text-xs sm:text-lg font-black leading-none tabular-nums"
                                            : "text-base sm:text-lg font-black leading-none";
                                          const arrivalTileClassName = [
                                            "flex min-h-[66px] flex-col items-center justify-center rounded-md border px-2 py-2 text-center transition-colors",
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
                                              <strong className={arrivalLabelClassName}>
                                                {formatArrivalTileLabel(arrival, { detailedCountdown, now: arrivalTick })}
                                              </strong>
                                              {clockTime && (
                                                <span className={due
                                                  ? "mt-1 text-xs font-semibold text-red-100/80"
                                                  : "mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400"}
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
                <p className="mt-2 text-[11px] text-slate-500">{arrivalDisclaimer}</p>
	              </section>
	            );
	          })()}

              <SurfaceConnectionsSection networkId="ttc" stationId={station.id} />

	          <section data-station-section="station-impacts" className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
	            <h3 className="flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
	              <AlertCircle size={20} className="shrink-0" />
	              <span>Station Impacts</span>
	            </h3>
	            {distinctImpacts.length === 0 ? (
	              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No active impacts for this station.</p>
	            ) : (
	              <div className="mt-2 flex flex-col gap-2">
	                {distinctImpacts.map((impact) => {
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
	                })}
	              </div>
	            )}
	          </section>

	          <details ref={accessibilityDetailsRef} data-station-section="accessibility" className="station-accessibility-details rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <summary
              onClick={handleSummaryClick}
              className="station-accessibility-summary flex cursor-pointer list-none items-center gap-2.5 text-lg font-black"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Image
                  src="/assets/linewatch/accessibility-alert.svg"
                  alt=""
                  width={24}
                  height={24}
                  aria-hidden="true"
                  className="shrink-0"
                />
                <span className="min-w-0 truncate">Accessibility Outages</span>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-white/10 dark:text-slate-200">
                  {station.access.outages.length}
                </span>
              </span>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className="station-accessibility-chevron ml-auto shrink-0 text-slate-500 dark:text-slate-300"
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
                      <div key={outage.id} className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
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
                            {outage.cause && (
                              <div className="col-span-2">
                                <dt>CAUSE</dt>
                                <dd>{outage.cause}</dd>
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
