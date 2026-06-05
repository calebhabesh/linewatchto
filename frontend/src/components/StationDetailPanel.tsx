"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Calendar, Check, Clock3, Construction, X } from "lucide-react";
import Image from "next/image";
import { formatRelativeImpactTime } from "../app/impact-time";
import type { StationDataResult, StationDetail, StationImpact } from "../app/station-data";
import { useDashboardData } from "../app/DataContext";
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
  selectedStationName?: string;
  onClose: () => void;
  onSelectImpact?: (selection: ImpactSelection) => void;
};

type StationImpactDetailsTarget = {
  label: string;
  selection: NonNullable<ImpactSelection>;
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
    };
  }

  const plannedClosure = plannedClosures.find((closure) => closure.id === impact.id);
  if (plannedClosure) {
    return {
      label: "Planned Closure",
      selection: { kind: "planned-closure", id: plannedClosure.id },
    };
  }

  const matchingAlert = activeAlerts.find((a) => a.id === impact.id);
  if (matchingAlert) {
    if (matchingAlert.severity === "planned") {
      return {
        label: "Planned Closure",
        selection: { kind: "planned-closure", id: matchingAlert.id },
      };
    }

    if (matchingAlert.severity === "suspension") {
      return {
        label: "Active Alert",
        selection: { kind: "suspension", id: matchingAlert.id },
      };
    }

    return {
      label: "Delay",
      selection: { kind: "delay", id: matchingAlert.id },
    };
  }

  const delay = delays.find((d) => d.id === impact.id);
  if (delay) {
    return {
      label: "Delay",
      selection: { kind: "delay", id: delay.id },
    };
  }

  return null;
}

function StationImpactDetailsIcon({ kind }: { kind: ImpactKind }) {
  if (kind === "delay") {
    return <DelayIcon size={14} className="shrink-0 text-amber-500" />;
  }

  if (kind === "reduced-speed-zone") {
    return <Construction size={14} className="shrink-0 text-amber-500" />;
  }

  if (kind === "planned-closure") {
    return <Calendar size={14} className="shrink-0 text-blue-500" />;
  }

  return <AlertTriangle size={14} className="shrink-0 text-red-500" />;
}

export function StationDetailPanel({ stationResult, loading, selectedStationName, onClose, onSelectImpact }: Props) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures } = useDashboardData();
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

  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const panelEl = panelRef.current;
    if (!panelEl) return;

    panelEl.classList.remove("highlight-active-card");
    void panelEl.offsetWidth; // Force reflow
    panelEl.classList.add("highlight-active-card");

    const timeout = window.setTimeout(() => {
      panelEl.classList.remove("highlight-active-card");
    }, 2500);

    return () => {
      window.clearTimeout(timeout);
      panelEl.classList.remove("highlight-active-card");
    };
  }, [station?.id, selectedStationName]);

  return (
    <aside
      ref={panelRef}
      className="station-detail-panel fixed left-0 right-0 bottom-0 z-30 max-h-[64vh] overflow-y-auto rounded-t-lg border border-black/10 bg-white p-4 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#0a0c10] dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-6 md:w-[min(calc(100vw-48px),390px)] md:max-h-none md:rounded-lg"
      aria-live="polite"
      aria-label={station ? `${station.name} station details` : "Station details"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Station
          </span>
          <h2 className="mt-1 break-words text-3xl font-black text-slate-950 dark:text-white">
            {station?.name ?? selectedStationName ?? "Station details"}
          </h2>
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

      {!loading && station && (isWheelchairAccessible || hasElevator) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {isWheelchairAccessible && (
            <span className="inline-flex items-center gap-1 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-[4px] border border-black/15 dark:border-white/15 uppercase tracking-wider bg-slate-100 dark:bg-white/5 whitespace-nowrap">
              <Check size={11} className="text-emerald-600 dark:text-emerald-400 stroke-[3.5] shrink-0" />
              Wheelchair Accessible
            </span>
          )}
          {hasElevator && (
            <span className="inline-flex items-center gap-1 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-[4px] border border-black/15 dark:border-white/15 uppercase tracking-wider bg-slate-100 dark:bg-white/5 whitespace-nowrap">
              <Check size={11} className="text-emerald-600 dark:text-emerald-400 stroke-[3.5] shrink-0" />
              Elevator Access
            </span>
          )}
        </div>
      )}

      {loading && (
        <div className="mt-4 rounded-lg border border-black/10 bg-slate-100 p-3 text-sm font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          Loading station details...
        </div>
      )}

      {!loading && !station && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          Station detail is unavailable for this stop.
        </div>
      )}

      {!loading && station && (
        <div className="mt-4 flex flex-col gap-4">
          {source === "fallback" && (
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-3 text-xs font-semibold text-blue-700 dark:text-blue-300">
              Backend unavailable. Showing local fallback station data.
            </div>
          )}

          <div className="flex flex-col gap-2">
            {station.lines.map((line) => (
              <div
                key={line.id}
                className="relative flex flex-col justify-center rounded-lg border border-black/10 bg-slate-50 p-3 pr-24 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex min-h-8 items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-black dark:border-white/10"
                    style={{ backgroundColor: line.color, color: line.id === "line-1" ? "#000000" : "#ffffff" }}
                    title={line.platformLabel}
                  >
                    {line.number}
                    <span>{line.name}</span>
                  </span>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {line.platformLabel}
                </p>

                <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-3">
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
                      className={`flex items-center justify-center ${
                        hasElevatorOutage ? "opacity-60 grayscale" : ""
                      }`}
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

          <section className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <h3 className="flex items-center gap-2.5 text-lg font-black">
              <Image
                src="/assets/linewatch/accessibility-alert.svg"
                alt=""
                width={24}
                height={24}
                aria-hidden="true"
                className="shrink-0"
              />
              <span>Accessibility Outages</span>
              <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-white/10 dark:text-slate-200">
                {station.access.outages.length}
              </span>
            </h3>
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
          </section>

          <section className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
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
                  return (
                    <div key={impact.id} className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                      <div>
                        <strong className="block text-amber-800 dark:text-amber-200">{impact.title}</strong>
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
                          className="mt-1 self-end inline-flex min-h-9 w-fit max-w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 active:scale-95 dark:border-white/10 dark:bg-[#12151c]/80 dark:text-slate-300 dark:hover:bg-[#12151c] dark:hover:text-white"
                        >
                          <StationImpactDetailsIcon kind={detailsTarget.selection.kind} />
                          <span className="truncate">View Details</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {(() => {
            const arrivalsDisrupted = station.arrivalContext ? station.arrivalContext.scheduleMayBeDisrupted : false;
            const arrivalSectionClassName = [
              "rounded-lg border p-3 transition-colors",
              arrivalsDisrupted
                ? "border-slate-300 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-300"
                : "border-black/10 bg-slate-50 dark:border-white/10 dark:bg-white/5",
            ].join(" ");

            return (
              <section className={arrivalSectionClassName} data-arrivals-disrupted={arrivalsDisrupted}>
                {/* Schedule may be disrupted */}
                <h3 className="flex items-center gap-2 text-sm font-black">
                  <Clock3 size={16} />
                  {station.arrivals.every((arrival) => arrival.status === "demo") ? "Demo Arrivals" : "Arrivals"}
                </h3>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {station.arrivalsSource}
                </p>
                {arrivalsDisrupted && station.arrivalContext && (
                  <div className="mt-2 rounded-md border border-slate-300 bg-slate-200/70 p-2 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
                    <p>{station.arrivalContext.message}</p>
                    <p className="mt-1 font-medium">{station.arrivalContext.reason}</p>
                  </div>
                )}
                <div className="mt-2 flex flex-col gap-2">
                  {station.arrivals.map((arrival, index) => {
                    const arrivalLine = station.lines.find((line) => line.id === arrival.lineId);
                    return (
                      <div key={`${arrival.lineId}-${arrival.direction}-${index}`} className="flex min-h-12 items-center justify-between gap-3 rounded-md bg-white p-2 text-sm dark:bg-[#12151c]">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="inline-flex h-6 min-w-12 shrink-0 items-center justify-center rounded-md px-2 text-[11px] font-black text-black"
                            style={{ backgroundColor: arrivalLine?.color ?? "#cbd5e1" }}
                          >
                            Line {arrivalLine?.number ?? arrival.lineId.replace("line-", "")}
                          </span>
                          <span className="min-w-0 break-words">{arrival.direction}</span>
                        </div>
                        <strong className="shrink-0">{arrival.label}</strong>
                      </div>
                    );
                  })}
                </div>
                {station.arrivals.some(a => a.status === "unavailable") && (
                  <p className="mt-2 text-[11px] text-red-500 font-semibold dark:text-red-400">
                    Arrival predictions are currently unavailable.
                  </p>
                )}
                <p className="mt-2 text-[11px] text-slate-500">{station.disclaimer || "Scheduled arrivals use TTC timetable data and are not live train predictions."}</p>
              </section>
            );
          })()}
        </div>
      )}
    </aside>
  );
}
