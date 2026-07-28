"use client";

import { AlertTriangle, Clock3, ExternalLink, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { REGIONAL_ROUTE_CARDINAL_DIRECTIONS, REGIONAL_ROUTE_DEFINITIONS } from "../app/regional-data";
import {
  emptyRegionalArrivalSnapshot,
  getRegionalStationArrivals,
  regionalArrivalMinuteLabel,
  type RegionalArrivalSnapshot,
} from "../app/regional-arrivals";
import type { StationSummary } from "../app/station-data";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { STATION_LINE_DEFINITIONS, STATION_LINE_STATION_IDS } from "../app/station-data";
import type { AccessibilityOutageDetail } from "../app/accessibility-outage-data";
import { formatImpactTimestamp } from "../app/impact-time";
import { StationDetailHeader } from "./StationDetailHeader";
import { TransitLineBadge } from "./TransitLineBadge";

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
};

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
  accessibilityFresh,
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
    const add = (kind: ImpactKind, id: string, title: string) => {
      related.set(`${kind}:${id}`, { kind, id, title });
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
                  <span key={route.id} className="station-route-identity">
                    <TransitLineBadge
                      lineId={route.id}
                      lineNumber={route.number}
                      lineName={route.name}
                      size={30}
                    />
                    <span className="min-w-0 truncate text-xs font-black">{route.name}</span>
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
                  <span key={line.id} className="station-route-identity">
                    <TransitLineBadge
                      lineId={line.id}
                      lineNumber={line.number}
                      lineName={line.name}
                      size={30}
                    />
                    <span className="min-w-0 truncate text-xs font-black">{line.name}</span>
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
                ) : arrivalSnapshot.availability === "available" && arrivalSnapshot.arrivals.length > 0 ? (
                  <ul className="mt-3 grid gap-2" aria-label="Upcoming regional train arrivals">
                    {arrivalSnapshot.arrivals.map((arrival) => {
                      const route = REGIONAL_ROUTE_DEFINITIONS.find((item) => item.id === arrival.lineId);
                      return (
                        <li
                          key={`${arrival.lineId}:${arrival.tripNumber}:${arrival.predictedAt}`}
                          className="rounded-md border border-black/10 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-black/10"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <TransitLineBadge
                                  lineId={arrival.lineId}
                                  lineNumber={arrival.lineNumber}
                                  lineName={route?.name}
                                  size={24}
                                />
                                <span className="truncate text-sm font-black">{arrival.direction}</span>
                              </div>
                              <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                {arrival.platform ? `Platform ${arrival.platform}` : "Platform not assigned"}
                                {arrival.delayMinutes > 0 ? ` · ${arrival.delayMinutes} min behind schedule` : " · On schedule"}
                              </p>
                            </div>
                            <span className="shrink-0 text-sm font-black text-slate-950 dark:text-white">
                              {regionalArrivalMinuteLabel(arrival.minutes)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
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
                aria-label="Station service impacts"
              >
                <h3 className="flex items-center gap-2 text-sm font-black">
                  <AlertTriangle size={16} />
                  Station Conditions
                </h3>
                {impacts.length > 0 ? (
                  <ul className="mt-3 grid gap-2">
                    {impacts.map((impact) => (
                      <li key={`${impact.kind}:${impact.id}`}>
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-center gap-2 rounded-md border border-black/10 bg-white/80 px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-[#12151c]/80 dark:hover:bg-white/10"
                          onClick={() => onSelectImpact({ kind: impact.kind, id: impact.id })}
                        >
                          <ImpactTypeIcon kind={impact.kind} size={16} />
                          <span>{impact.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {dashboard.dataSource === "backend"
                      ? "No station impacts in the latest Metrolinx alert dataset."
                      : "No station impacts in the regional demo dataset."}
                  </p>
                )}
              </section>

              <section
                className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="accessibility"
                aria-label="Regional accessibility outages"
              >
                <h3 className="flex items-center gap-2 text-sm font-black">
                  <Image
                    src="/assets/linewatch/accessibility-alert.svg"
                    alt=""
                    width={18}
                    height={18}
                    className="h-[18px] w-[18px] shrink-0"
                  />
                  Accessibility Outages
                </h3>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Metrolinx Open API
                </p>
                {accessibilityOutages.length > 0 ? (
                  <ul className="mt-3 grid gap-2">
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
                ) : (
                  <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {accessibilityFresh
                      ? "No active elevator or escalator outages are linked to this station in the latest Metrolinx dataset."
                      : "Regional accessibility outage data is disabled, unavailable, or stale."}
                  </p>
                )}
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Notices describe station facilities and accessible paths; they do not indicate rail service status.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
