"use client";

import { AlertTriangle, Bookmark, Clock3, ExternalLink, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { REGIONAL_ROUTE_CARDINAL_DIRECTIONS, REGIONAL_ROUTE_DEFINITIONS } from "../app/regional-data";
import type { StationSummary } from "../app/station-data";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { STATION_LINE_DEFINITIONS, STATION_LINE_STATION_IDS } from "../app/station-data";

type Props = {
  station: StationSummary;
  onClose: () => void;
  onSelectImpact: (selection: NonNullable<ImpactSelection>) => void;
  authenticated: boolean;
  saved: boolean;
  savePending: boolean;
  onToggleSaved: (stationId: string) => void;
  onRequestSignIn: () => void;
};

type RegionalStationImpact = {
  kind: ImpactKind;
  id: string;
  title: string;
};

function routeBadgeTextColor(color: string) {
  const normalized = color.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 155 ? "#111827" : "#ffffff";
}

function ttcLineBadgeTextColor(lineId: string) {
  return lineId === "line-1" || lineId === "line-6" ? "#000000" : "#ffffff";
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
}: Props) {
  const dashboard = useDashboardData();
  const [isClosing, setIsClosing] = useState(false);
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
      <header className="flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Station
          </span>
          <h2 className="mt-1 break-words text-3xl font-black text-slate-950 dark:text-white">
            {station.name}
          </h2>
        </div>
        <div className="station-detail-header-actions">
          <div className="station-detail-save-control">
            <button
              type="button"
              onClick={toggleSaved}
              disabled={savePending}
              className={saved ? "saved" : ""}
              aria-pressed={saved}
              aria-label={`${saved ? "Remove" : "Save"} ${station.name} ${saved ? "from" : "to"} My Stations`}
            >
              {savePending
                ? <LoaderCircle size={20} className="station-detail-save-spinner" />
                : <Bookmark size={20} fill={saved ? "currentColor" : "none"} />}
              <span>{saved ? "Saved" : "Save"}</span>
            </button>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="station-detail-close-button h-11 w-11"
            aria-label="Close regional station details"
          >
            <X size={20} />
          </button>
        </div>
      </header>

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
                    className="inline-flex min-h-8 max-w-full min-w-0 items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-black dark:border-white/10"
                    style={{ backgroundColor: route.color, color: routeBadgeTextColor(route.color) }}
                    title={route.name}
                  >
                    <b>{route.number}</b>
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
                    className="inline-flex min-h-8 max-w-full min-w-0 items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-black dark:border-white/10"
                    style={{ backgroundColor: line.color, color: ttcLineBadgeTextColor(line.id) }}
                    title={line.name}
                  >
                    <b>{line.number}</b>
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
                  {dashboard.dataSource === "backend"
                    ? "Live service alerts connected"
                    : "Regional realtime unavailable"}
                </p>
                <div className="mt-3 rounded-md border border-black/10 bg-white/60 px-3 py-4 text-center dark:border-white/10 dark:bg-black/10">
                  <p className="text-sm font-semibold leading-snug text-slate-500 dark:text-slate-400">
                    <span className="block">Arrival Data Unavailable</span>
                    <span className="mt-1 block text-xs font-medium">
                      Station arrivals are not included in the current regional integration.
                    </span>
                  </p>
                </div>
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

              <p className="text-[11px] leading-relaxed text-slate-500">
                Accessibility and platform-condition details are unavailable until their regional data coverage is verified.
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
