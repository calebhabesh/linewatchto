"use client";


import { Fragment } from "react";
import { AlertTriangle, Calendar, Check, ChevronDown, Clock3, Construction, X } from "lucide-react";
import Image from "next/image";
import { formatRelativeImpactTime } from "../app/impact-time";
import {
  formatArrivalClockTime,
  formatArrivalDisclaimer,
  formatArrivalTileLabel,
  groupStationArrivals,
  isArrivalDue,
} from "../app/station-arrivals";
import type { StationDataResult, StationDetail, StationImpact } from "../app/station-data";
import { useDashboardData } from "../app/DataContext";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import type {
  ActiveAlert,
  DelayAlert,
  ImpactKind,
  ImpactSelection,
  PlannedClosure,
  ReducedSpeedZone,
} from "../app/linewatch-data";
import { DelayIcon } from "./DelayIcon";

type Props = {
  stationResult: StationDataResult<StationDetail | null> | null;
  loading: boolean;
  updating?: boolean;
  selectedStationName?: string;
  onClose: () => void;
  onSelectImpact?: (selection: ImpactSelection) => void;
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

  const matchingAlert = activeAlerts.find((a) => a.id === impact.id);
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
      label: "Upcoming Closure",
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
}: {
  kind: ImpactKind;
  tone?: StationImpactDetailsTarget["tone"];
}) {
  if (kind === "delay") {
    return <DelayIcon size={14} className="shrink-0 text-amber-500" />;
  }

  if (kind === "reduced-speed-zone") {
    return <Construction size={14} className="rsz-tone shrink-0" />;
  }

  if (kind === "planned-closure" && tone === "active") {
    return <AlertTriangle size={14} className="shrink-0 text-red-500" />;
  }

  if (kind === "planned-closure") {
    return <Calendar size={14} className="shrink-0 text-blue-500" />;
  }

  return <AlertTriangle size={14} className="shrink-0 text-red-500" />;
}

function lineBadgeTextColor(lineId: string) {
  return lineId === "line-1" || lineId === "line-6" ? "#000000" : "#ffffff";
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

function stationImpactCardClassName(tone: StationImpactDetailsTarget["tone"]) {
  const base = "flex flex-col gap-2 rounded-md border p-3 text-sm";
  if (tone === "active") {
    return `${base} border-red-500/40 bg-red-500/10`;
  }
  if (tone === "planned") {
    return `${base} border-blue-500/30 bg-blue-500/10`;
  }
  if (tone === "reduced-speed-zone") {
    return `${base} border-[var(--impact-rsz-border)] bg-[var(--impact-rsz-soft)]`;
  }
  return `${base} border-amber-500/30 bg-amber-500/10`;
}

function stationImpactTitleClassName(tone: StationImpactDetailsTarget["tone"]) {
  if (tone === "active") {
    return "block text-red-800 dark:text-red-200";
  }
  if (tone === "planned") {
    return "block text-blue-800 dark:text-blue-200";
  }
  if (tone === "reduced-speed-zone") {
    return "rsz-tone block";
  }
  return "block text-amber-800 dark:text-amber-200";
}

export function StationDetailPanel({ stationResult, loading, updating, selectedStationName, onClose, onSelectImpact }: Props) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures } = useDashboardData();
  const subwayOperatingState = useSubwayOperatingState();
  const station = stationResult?.data ?? null;
  const source = stationResult?.source;
  const hasElevatorOutage = station?.access.outages.some(
    (outage) => outage.assetType === "elevator"
  ) ?? false;
  const elevatorOutagesCount = station?.access.outages.filter(
    (outage) => outage.assetType === "elevator"
  ).length ?? 0;
  const escalatorOutagesCount = station?.access.outages.filter(
    (outage) => outage.assetType === "escalator"
  ).length ?? 0;
  const sortedOutages = station?.access.outages
    ? [...station.access.outages].sort((a, b) => {
        if (a.assetType === b.assetType) return 0;
        return a.assetType === "elevator" ? -1 : 1;
      })
    : [];

  const isWheelchairAccessible = station?.lines.some((line) => line.wheelchairAccessible) ?? false;
  const hasElevator = station?.lines.some((line) => line.hasElevator) ?? false;

  return (
    <aside
      className="station-detail-panel fixed left-0 right-0 bottom-0 z-30 max-h-[64vh] overflow-y-auto rounded-t-lg border border-black/10 bg-white p-4 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#0a0c10] dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-auto md:w-[min(calc(100vw-48px),390px)] md:max-h-[calc(100vh-128px)] md:rounded-lg"
      aria-live="polite"
      aria-label={station ? `${station.name} station details` : "Station details"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Station
          </span>
          <h2 className="mt-1 break-words text-3xl font-black text-slate-950 dark:text-white">
            {station?.name ?? selectedStationName ?? "Station details"}
          </h2>
          {updating && (
            <span className="station-detail-updating" role="status">
              Updating
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/10 text-slate-700 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          aria-label="Close station details"
        >
          <X size={20} />
        </button>
      </div>

      <div className={`station-detail-body-wrapper transition-all duration-200 ${updating ? "station-detail-body-updating" : ""}`}>
        <div
          key={station?.id ?? "empty"}
          className="station-detail-content-swap"
        >
          {station && (isWheelchairAccessible || hasElevator) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
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

      {station && (
        <div className="mt-3 flex flex-col gap-2" data-station-header-line-details>
          {station.lines.map((line) => (
            <div
              key={line.id}
              className="grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
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

              <div className="flex shrink-0 items-center justify-end gap-4 pl-2">
                {line.wheelchairAccessible && (
                  <span
                    className="flex items-center justify-center"
                    title="Wheelchair accessible"
                  >
                    <Image
                      src="/assets/linewatch/wheel-chair-symbol.svg"
                      alt="Wheelchair accessible"
                      width={39}
                      height={40}
                      className="rounded-md drop-shadow-[0_0_3px_rgba(0,103,167,0.5)] dark:drop-shadow-[0_0_4px_rgba(0,103,167,0.7)]"
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
                      src="/assets/linewatch/elevator-icon.svg"
                      alt={hasElevatorOutage ? "Elevator available, outage reported" : "Elevator available"}
                      width={40}
                      height={40}
                      className="drop-shadow-[0_0_3px_rgba(0,130,201,0.5)] dark:drop-shadow-[0_0_4px_rgba(0,130,201,0.7)]"
                    />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && !station && (
        <div className="station-detail-loading mt-4 rounded-lg border border-black/10 bg-slate-100 p-3 text-sm font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          Loading station details...
        </div>
      )}

      {!loading && !station && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          Station detail is unavailable for this stop.
        </div>
      )}

      {station && (
        <div className="mt-4 flex flex-col gap-4">
          {source === "fallback" && (
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-3 text-xs font-semibold text-blue-700 dark:text-blue-300">
              Backend unavailable. Showing local fallback station data.
            </div>
          )}

          {(() => {
            const subwayClosed = subwayOperatingState.status === "closed";
            const arrivalHeading = station.arrivals.every((arrival) => arrival.status === "demo")
              ? "Demo Arrivals"
              : "Arrivals";

            if (subwayClosed) {
              return (
                <section
                  className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                  data-arrivals-subway-closed="true"
                  data-station-section="arrivals"
                >
                  <h3 className="flex items-center gap-2 text-sm font-black">
                    <Clock3 size={16} />
                    {arrivalHeading}
                  </h3>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {station.arrivalsSource}
                  </p>
                  <div className="mt-3 rounded-md border border-black/10 bg-white/60 px-3 py-4 text-center dark:border-white/10 dark:bg-black/10">
                    <p className="text-sm font-semibold leading-snug text-slate-500 dark:text-slate-400">
                      <span className="block">Subway Closed</span>
                      <span className="block">Arrivals Not Available</span>
                    </p>
                  </div>
                </section>
              );
            }

            const arrivalsDisrupted = station.arrivalContext ? station.arrivalContext.scheduleMayBeDisrupted : false;
            const hasUnavailableArrivals = station.arrivals.some((arrival) => arrival.status === "unavailable");
            const arrivalGroups = hasUnavailableArrivals ? [] : groupStationArrivals(station.arrivals, station.lines, { stationId: station.id });
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
                <h3 className="flex items-center gap-2 text-sm font-black">
                  <Clock3 size={16} />
                  {arrivalHeading}
                </h3>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {station.arrivalsSource}
                </p>
                {arrivalsDisrupted && station.arrivalContext && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-slate-200/70 p-2 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
                    <span>Schedule May Be Disrupted</span>
                    {station.impacts.length > 0 && (
                      <div className="station-impact-jump-actions">
                        {station.impacts.map((impact) => {
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
                  ) : arrivalGroups.map((group, groupIndex) => {
                    const lineBadgeColor = group.line?.color ?? "#cbd5e1";
                    const showLineDivider = groupIndex > 0 && arrivalGroups[groupIndex - 1]?.lineId !== group.lineId;

                    return (
                      <Fragment key={group.key}>
                        {showLineDivider && (
                          <div
                            aria-hidden="true"
                            className="station-arrival-line-divider"
                            data-arrival-line-divider
                          />
                        )}
                        <div
                          data-arrival-group={group.key}
                          className="rounded-md border border-black/10 bg-white/80 p-3 text-sm shadow-sm dark:border-white/10 dark:bg-[#12151c]/80"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
                              style={{ backgroundColor: lineBadgeColor, color: lineBadgeTextColor(group.lineId) }}
                              title={group.line ? `Line ${group.lineNumber} ${group.line.name}` : `Line ${group.lineNumber}`}
                              aria-label={group.line ? `Line ${group.lineNumber} ${group.line.name}` : `Line ${group.lineNumber}`}
                            >
                              {group.lineNumber}
                            </span>
                            <strong className="min-w-0 break-words font-black text-slate-900 dark:text-white">
                              {group.directionLabel}
                            </strong>
                          </div>
                          {group.arrivals.length === 1 && group.arrivals[0].label.toLowerCase() === "no scheduled service" ? (
                            <p className="mt-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                              No Scheduled Service
                            </p>
                          ) : (
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {group.arrivals.map((arrival, index) => {
                                const due = isArrivalDue(arrival);
                                const clockTime = formatArrivalClockTime(arrival.predictedAt);
                                const arrivalTileClassName = [
                                  "flex min-h-[66px] flex-col items-center justify-center rounded-md border px-2 py-2 text-center transition-colors",
                                  due
                                    ? "border-red-400/80 bg-red-900/85 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.25)]"
                                    : "border-black/10 bg-slate-950/[0.03] text-slate-900 dark:border-white/10 dark:bg-[#0f1117] dark:text-white",
                                ].join(" ");

                                return (
                                  <div
                                    key={`${arrival.lineId}-${arrival.direction}-${arrival.predictedAt ?? arrival.label}-${index}`}
                                    data-arrival-due={due ? "true" : "false"}
                                    className={arrivalTileClassName}
                                  >
                                    <strong className="text-lg font-black leading-none">
                                      {formatArrivalTileLabel(arrival)}
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
                      </Fragment>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">{arrivalDisclaimer}</p>
	              </section>
	            );
	          })()}

	          <section data-station-section="station-impacts" className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
	            <h3 className="flex items-center gap-2 text-sm font-black">
	              <AlertTriangle size={16} />
	              Station Impacts
	            </h3>
	            {station.impacts.length === 0 ? (
	              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No active impacts for this station.</p>
	            ) : (
	              <div className="mt-2 flex flex-col gap-2">
	                {station.impacts.map((impact) => {
	                  const detailsTarget = getStationImpactDetailsTarget(
	                    impact,
	                    activeAlerts,
	                    delays,
	                    reducedSpeedZones,
	                    plannedClosures
	                  );
	                  const impactTone = detailsTarget?.tone ?? fallbackStationImpactTone(impact);

	                  return (
	                    <div
	                      key={impact.id}
	                      id={`station-impact-${impact.id}`}
	                      className={stationImpactCardClassName(impactTone)}
	                    >
	                      <div className="flex flex-col gap-2">
	                        {detailsTarget && (
	                          <span
	                            data-station-impact-classification={detailsTarget.label}
	                            className="w-fit rounded-full border border-current/20 bg-white/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:bg-black/20 dark:text-slate-300"
	                          >
	                            {detailsTarget.label}
	                          </span>
	                        )}
	                        <strong className={stationImpactTitleClassName(impactTone)}>{impact.title}</strong>
	                        <p className="mt-1 text-slate-600 dark:text-slate-300">{impact.summary}</p>
	                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
	                          {impact.source} / {impact.updatedAt
	                            ? formatRelativeImpactTime(impact.updatedAt)
	                            : impact.updatedAgo}
	                        </p>
	                      </div>
	                      {detailsTarget && onSelectImpact && (
	                        <button
	                          type="button"
	                          onClick={() => onSelectImpact(detailsTarget.selection)}
	                          aria-label={`Open ${detailsTarget.label} details`}
	                          className="mt-1 self-start inline-flex min-h-9 w-fit max-w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 active:scale-95 dark:border-white/10 dark:bg-[#12151c]/80 dark:text-slate-300 dark:hover:bg-[#12151c] dark:hover:text-white"
	                        >
	                          <StationImpactDetailsIcon kind={detailsTarget.selection.kind} tone={detailsTarget.tone} />
	                          <span className="truncate">View Details</span>
	                        </button>
	                      )}
	                    </div>
	                  );
	                })}
	              </div>
	            )}
	          </section>

	          <details data-station-section="accessibility" className="station-accessibility-details rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <summary className="station-accessibility-summary flex cursor-pointer list-none items-center gap-2.5 text-lg font-black">
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
            {sortedOutages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-4 items-center">
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
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {station.access.updatedAgo}
            </p>
            {sortedOutages.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
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
                      <strong className="block text-amber-800 dark:text-amber-200">{outage.title}</strong>
                      <p className="mt-1 text-slate-600 dark:text-slate-300 text-xs leading-relaxed">{outage.description}</p>
                      <dl className="impact-metadata-grid">
                        <div>
                          <dt>EST. RESOLUTION</dt>
                          <dd>TBD</dd>
                        </div>
                        <div>
                          <dt>UPDATED</dt>
                          <dd>{formatRelativeImpactTime(outage.updatedAt)}</dd>
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
          </details>

	        </div>
      )}
        </div>
      </div>
    </aside>
  );
}
