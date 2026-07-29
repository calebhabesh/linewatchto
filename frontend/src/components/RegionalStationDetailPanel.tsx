"use client";

import { AlertCircle, AlertTriangle, BadgeInfo, ChevronDown, Clock3, Construction, ExternalLink, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { REGIONAL_ROUTE_CARDINAL_DIRECTIONS, REGIONAL_ROUTE_DEFINITIONS } from "../app/regional-data";
import {
  emptyRegionalArrivalSnapshot,
  formatRegionalArrivalClockTime,
  getRegionalStationArrivals,
  groupRegionalStationArrivals,
  regionalArrivalMinuteLabel,
  type RegionalArrivalSnapshot,
} from "../app/regional-arrivals";
import type { StationSummary } from "../app/station-data";
import { STATION_LINE_DEFINITIONS, STATION_LINE_STATION_IDS } from "../app/station-data";
import type { AccessibilityOutageDetail } from "../app/accessibility-outage-data";
import { formatImpactTimestamp } from "../app/impact-time";
import { normalizeDashboardSourceLabel } from "../app/dashboard-source-label";
import { StationDetailHeader } from "./StationDetailHeader";
import { TransitLineBadge, transitLineBadgeColors } from "./TransitLineBadge";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";

type Props = {
  station: StationSummary;
  onClose: () => void;
  onSelectImpact: (selection: NonNullable<ImpactSelection>) => void;
  authenticated: boolean;
  saved: boolean;
  savePending: boolean;
  onToggleSaved: (stationId: string) => void;
  onRequestSignIn: () => void;
  accessibilityOutages: AccessibilityOutageDetail[];
  accessibilityFresh: boolean;
};

type RegionalStationImpact = {
  kind: ImpactKind;
  id: string;
  title: string;
  description: string;
  source: string;
  updatedAt?: string | null;
  updatedAgo?: string | null;
  classification: string;
  tone: "active" | "delay" | "planned" | "reduced-speed-zone";
};

function stationImpactCardClassName(tone: RegionalStationImpact["tone"]) {
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

function stationImpactButtonClassName(tone: RegionalStationImpact["tone"]) {
  const base = "ml-auto inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold leading-none text-slate-900 dark:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:scale-95";
  if (tone === "active") return `${base} border-red-500/35 bg-red-500/10 hover:bg-red-500/20`;
  if (tone === "planned") return `${base} border-blue-500/35 bg-blue-500/10 hover:bg-blue-500/20`;
  if (tone === "reduced-speed-zone") return `${base} border-[#F59E0B]/35 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20`;
  return `${base} border-[#FEEC41]/35 bg-[#FEEC41]/10 hover:bg-[#FEEC41]/20`;
}

function RegionalStationImpactIcon({ impact }: { impact: RegionalStationImpact }) {
  if (impact.kind === "delay") return <DelayIcon size={26} className="shrink-0 delay-tone" />;
  if (impact.kind === "reduced-speed-zone") return <Construction size={26} className="rsz-tone shrink-0" />;
  if (impact.kind === "planned-closure" && impact.tone !== "active") {
    return <PlannedClosureIcon size={26} className="shrink-0 text-blue-500" />;
  }
  return <AlertTriangle size={26} className="shrink-0 text-red-500" />;
}

export function RegionalStationDetailPanel({
  station,
  onClose,
  onSelectImpact,
  authenticated,
  saved,
  savePending,
  onToggleSaved,
  onRequestSignIn,
  accessibilityOutages,
}: Props) {
  const dashboard = useDashboardData();
  const [isClosing, setIsClosing] = useState(false);
  const [arrivalState, setArrivalState] = useState<{
    stationId: string;
    snapshot: RegionalArrivalSnapshot;
  }>(() => ({ stationId: "", snapshot: emptyRegionalArrivalSnapshot(station.id) }));
  const arrivalsLoading = arrivalState.stationId !== station.id;
  const arrivalSnapshot = arrivalsLoading
    ? emptyRegionalArrivalSnapshot(station.id)
    : arrivalState.snapshot;
  const closeTimeoutRef = useRef<number | null>(null);
  const routes = REGIONAL_ROUTE_DEFINITIONS.filter((route) => station.lineIds.includes(route.id));
  const impacts = useMemo(() => {
    const related = new Map<string, RegionalStationImpact>();
    const add = (kind: ImpactKind, id: string, fallbackTitle: string) => {
      const active = dashboard.activeAlerts.find((item) => item.id === id);
      const delay = dashboard.delays.find((item) => item.id === id);
      const planned = dashboard.plannedClosures.find((item) => item.id === id);
      const reducedSpeedZone = dashboard.reducedSpeedZones.find((item) => item.id === id);
      const card = active ?? delay ?? planned ?? reducedSpeedZone;
      const tone: RegionalStationImpact["tone"] =
        kind === "reduced-speed-zone"
          ? "reduced-speed-zone"
          : kind === "planned-closure"
            ? active ? "active" : "planned"
            : kind === "suspension"
              ? "active"
              : "delay";
      const classification =
        kind === "reduced-speed-zone"
          ? "Reduced Speed Zone"
          : kind === "planned-closure"
            ? active ? "Active Closure" : "Planned Closure"
            : kind === "suspension"
              ? "Active Alert"
              : "Delay";

      related.set(`${kind}:${id}`, {
        kind,
        id,
        title: card?.title ?? fallbackTitle,
        description: card?.description ?? "",
        source: card?.source ?? "Metrolinx Open API",
        updatedAt: card?.updatedAt,
        updatedAgo: card && "updatedAgo" in card ? card.updatedAgo : null,
        classification,
        tone,
      });
    };

    for (const impact of dashboard.stationNodeImpacts.filter((item) => item.stationId === station.id)) {
      add(impact.kind, impact.cardId, impact.title);
    }
    for (const segment of dashboard.networkSegments.filter(
      (item) => item.stationAId === station.id || item.stationBId === station.id,
    )) {
      for (const impact of segment.impacts ?? []) {
        const card =
          dashboard.activeAlerts.find((item) => item.id === impact.cardId)
          ?? dashboard.delays.find((item) => item.id === impact.cardId)
          ?? dashboard.plannedClosures.find((item) => item.id === impact.cardId)
          ?? dashboard.reducedSpeedZones.find((item) => item.id === impact.cardId);
        add(impact.kind, impact.cardId, card?.title ?? `${segment.label} impact`);
      }
    }
    return [...related.values()];
  }, [dashboard, station.id]);
  const arrivalGroups = useMemo(
    () => groupRegionalStationArrivals(arrivalSnapshot.arrivals, station.id),
    [arrivalSnapshot.arrivals, station.id],
  );

  const ttcLines = useMemo(() => {
    return Object.values(STATION_LINE_DEFINITIONS).filter((line) =>
      STATION_LINE_STATION_IDS[line.id]?.includes(station.id)
    );
  }, [station.id]);


  const toggleSaved = () => {
    if (!authenticated) {
      onRequestSignIn();
      return;
    }
    onToggleSaved(station.id);
  };

  useEffect(() => () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getRegionalStationArrivals(station.id, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) {
        setArrivalState({ stationId: station.id, snapshot: result.data });
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [station.id]);

  const handleClose = () => {
    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, 200);
  };

  return (
    <aside
      className={`regional-station-detail station-detail-panel ${isClosing ? "station-detail-closing" : ""} fixed left-0 right-0 bottom-0 z-45 max-h-[calc(var(--visual-viewport-height,100dvh)*0.64)] flex flex-col overflow-hidden rounded-t-lg border border-black/10 bg-white p-4 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#0a0c10] dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-auto md:w-[min(calc(100vw-48px),460px)] md:max-h-[calc(var(--visual-viewport-height,100dvh)-128px)] md:rounded-lg`}
      aria-live="polite"
      aria-label={`${station.name} regional station details`}
    >
      <StationDetailHeader
        stationName={station.name}
        saved={saved}
        savePending={savePending}
        onToggleSaved={toggleSaved}
        onClose={handleClose}
      />

      <div className="station-detail-body-wrapper flex-1 min-h-0 flex flex-col">
        <div
          key={station.id}
          className="station-detail-content-swap flex-1 min-h-0 flex flex-col"
        >
          <div className="flex-1 min-h-0 overflow-y-auto mt-3 pr-4 -mr-4 station-detail-scroll">
            <div className="flex flex-col gap-2" data-station-header-line-details aria-label="Regional rail corridors">
          {Object.entries(
            routes.reduce((acc, route) => {
              const direction = REGIONAL_ROUTE_CARDINAL_DIRECTIONS[route.number as keyof typeof REGIONAL_ROUTE_CARDINAL_DIRECTIONS];
              if (!acc[direction]) acc[direction] = [];
              acc[direction].push(route);
              return acc;
            }, {} as Record<string, typeof routes>)
          ).map(([direction, directionRoutes]) => (
            <div
              key={direction}
              className="flex flex-col gap-3 rounded-md border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex flex-wrap gap-2">
                {directionRoutes.map((route) => (
                  <span
                    key={route.id}
                    className="regional-route-pill inline-flex min-h-8 max-w-full min-w-0 items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-black dark:border-white/10"
                    style={transitLineBadgeColors(route.id)}
                  >
                    <span>{route.number}</span>
                    <span className="min-w-0 truncate">{route.name}</span>
                  </span>
                ))}
              </div>
              <p className="break-words text-xs font-semibold text-slate-500 dark:text-slate-400">
                {direction}
              </p>
            </div>
          ))}
          {ttcLines.length > 0 && (
            <div className="flex flex-col gap-3 rounded-md border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-wrap gap-2">
                {ttcLines.map((line) => (
                  <span
                    key={line.id}
                    className="regional-route-pill inline-flex min-h-8 max-w-full min-w-0 items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-black dark:border-white/10"
                    style={transitLineBadgeColors(line.id)}
                  >
                    <span>{line.number}</span>
                    <span className="min-w-0 truncate">{line.name}</span>
                  </span>
                ))}
              </div>
              <p className="break-words text-xs font-semibold text-slate-500 dark:text-slate-400">
                {ttcLines.length === 1 ? "TTC Connection" : "TTC Connections"}
              </p>
            </div>
          )}
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <section
                className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="arrivals"
              >
                <h3 className="flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
                  <Clock3 size={20} className="shrink-0" />
                  <span>Arrivals</span>
                </h3>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {arrivalsLoading
                    ? "Checking Metrolinx arrivals"
                    : arrivalSnapshot.availability === "available"
                      ? arrivalSnapshot.source
                      : "Regional realtime unavailable"}
                </p>
                {arrivalsLoading ? (
                  <div className="mt-3 flex min-h-20 items-center justify-center rounded-md border border-black/10 bg-white/60 dark:border-white/10 dark:bg-black/10">
                    <LoaderCircle size={22} className="animate-spin text-slate-500" aria-label="Loading regional arrivals" />
                  </div>
                ) : arrivalSnapshot.availability === "available" && arrivalGroups.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-3" aria-label="Upcoming regional train arrivals">
                    {arrivalGroups.map((group) => (
                      <article
                        key={group.key}
                        data-regional-arrival-direction={group.directionLabel}
                        className="rounded-md border border-black/10 bg-white/80 p-3 text-sm shadow-sm dark:border-white/10 dark:bg-[#12151c]/80"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <TransitLineBadge
                            lineId={group.lineId}
                            lineNumber={group.lineNumber}
                            lineName={group.lineName}
                            size={28}
                            className="shrink-0"
                          />
                          <div className="flex min-w-0 flex-col leading-tight">
                            <strong className="min-w-0 break-words font-black text-slate-900 dark:text-white">
                              {group.directionLabel}
                            </strong>
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              {group.destinationLabel}
                            </span>
                          </div>
                          <span className="ml-auto inline-flex h-5 shrink-0 items-center rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                            Live
                          </span>
                        </div>

                        <div className="mt-3 flex flex-col gap-3">
                          {group.platforms.map((platform) => (
                            <div key={platform.key} data-regional-arrival-platform={platform.key}>
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  {platform.label}
                                </h4>
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                  {platform.arrivals.some((arrival) => arrival.delayMinutes > 0)
                                    ? "Delayed estimate"
                                    : "On schedule"}
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                {platform.arrivals.map((arrival) => {
                                  const due = arrival.minutes <= 0;
                                  return (
                                    <div
                                      key={`${arrival.tripNumber}:${arrival.predictedAt}`}
                                      className={[
                                        "flex min-h-[66px] flex-col items-center justify-center rounded-md border px-2 py-2 text-center",
                                        due
                                          ? "border-red-400/80 bg-red-900/85 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.25)]"
                                          : "border-black/10 bg-slate-950/[0.03] text-slate-900 dark:border-white/10 dark:bg-[#0f1117] dark:text-white",
                                      ].join(" ")}
                                    >
                                      <strong className="text-base font-black leading-none">
                                        {regionalArrivalMinuteLabel(arrival.minutes)}
                                      </strong>
                                      <span className={due
                                        ? "mt-1 text-xs font-semibold text-red-100/80"
                                        : "mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400"}
                                      >
                                        {formatRegionalArrivalClockTime(arrival.predictedAt)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-black/10 bg-white/60 px-3 py-4 text-center dark:border-white/10 dark:bg-black/10">
                    <p className="text-sm font-semibold leading-snug text-slate-500 dark:text-slate-400">
                      <span className="block">Arrival Data Unavailable</span>
                      <span className="mt-1 block text-xs font-medium">{arrivalSnapshot.message}</span>
                    </p>
                  </div>
                )}
                {!arrivalsLoading && arrivalSnapshot.availability === "available" ? (
                  <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                    Realtime estimates can change. Confirm departure details with GO Transit or UP Express.
                  </p>
                ) : null}
                <div className="regional-station-official-links mt-3">
                  <a href="https://www.gotransit.com/en/see-schedules" target="_blank" rel="noreferrer">
                    GO Schedules <ExternalLink size={14} />
                  </a>
                  {station.lineIds.includes("regional-up") ? (
                    <a
                      href="https://www.upexpress.com/en/up-express-stations/union-station/departures-and-schedules"
                      target="_blank"
                      rel="noreferrer"
                    >
                      UP Schedules <ExternalLink size={14} />
                    </a>
                  ) : null}
                </div>
              </section>

              <section
                className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="station-impacts"
                aria-label="Station service impacts"
              >
                <h3 className="flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
                  <AlertCircle size={20} className="shrink-0" />
                  <span>Station Impacts</span>
                </h3>
                {impacts.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-2">
                    {impacts.map((impact) => (
                      <div key={`${impact.kind}:${impact.id}`} className={stationImpactCardClassName(impact.tone)}>
                        <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
                          <RegionalStationImpactIcon impact={impact} />
                          <span className="flex items-center leading-none">{impact.classification}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <strong className="block font-bold text-slate-900 dark:text-white">{impact.title}</strong>
                          {impact.description && impact.description !== impact.title ? (
                            <p className="leading-snug text-slate-700 dark:text-slate-200">{impact.description}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {normalizeDashboardSourceLabel(impact.source)}
                            {impact.updatedAt || impact.updatedAgo
                              ? ` / ${impact.updatedAt ? formatImpactTimestamp(impact.updatedAt) : impact.updatedAgo}`
                              : ""}
                          </p>
                          <button
                            type="button"
                            className={stationImpactButtonClassName(impact.tone)}
                            onClick={() => onSelectImpact({ kind: impact.kind, id: impact.id })}
                            aria-label={`Open ${impact.classification} details`}
                          >
                            <BadgeInfo size={16} className="shrink-0" aria-hidden="true" />
                            <span>View Details</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <details
                className="station-accessibility-details rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="accessibility"
                aria-label="Regional accessibility outages"
              >
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
                      {accessibilityOutages.length}
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
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Metrolinx Open API
                    </p>
                    {accessibilityOutages.length > 0 ? (
                      <ul className="grid gap-2">
                        {accessibilityOutages.map((outage) => (
                          <li
                            key={outage.id}
                            className="rounded-md border border-amber-500/30 bg-white/80 p-3 dark:bg-black/10"
                          >
                            <div className="flex items-start gap-2.5">
                              <Image
                                src={`/assets/linewatch/outages/${outage.assetType}.svg`}
                                alt=""
                                width={22}
                                height={22}
                                className="h-[22px] w-[22px] shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-black text-slate-900 dark:text-white">{outage.title}</p>
                                {outage.description ? (
                                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                                    {outage.description}
                                  </p>
                                ) : null}
                                <p className="mt-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                  Updated {formatImpactTimestamp(outage.updatedAt)}
                                </p>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
