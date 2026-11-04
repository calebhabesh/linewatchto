"use client";

import { ArrowRight, Bus, LoaderCircle, TramFront } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  getSurfaceStopArrivals,
  surfaceNoticesForStop,
  surfaceStopDisclaimer,
  surfaceStopGroups,
  surfaceStopSourceLine,
  type SurfaceStopResult,
} from "../app/surface-stop-arrivals";
import { parseSurfaceRouteDetails, SURFACE_ARRIVAL_COUNTDOWN_TICK_MS } from "../app/surface-arrivals";
import { getSurfaceNotices, type SurfaceNoticeDetail } from "../app/surface-notice-data";
import { useMobileDraggableSheet } from "../hooks/useMobileDraggableSheet";
import { MobileSheetDragHandle } from "./MobileSheetDragHandle";
import { StationDetailHeader } from "./StationDetailHeader";
import { SurfaceRouteBackLink, type SurfaceRouteBack } from "./SurfaceRoutePanel";
import { SurfaceRouteCard } from "./SurfaceConnectionsSection";
import { ttcRouteBadgeStyle } from "../app/ttc-route-badge";

const REFRESH_MS = 15_000;

type Props = {
  stopCode: string;
  /** Name from the map's stop catalog, shown while the departures load. */
  fallbackName?: string | null;
  stationName?: (stationId: string) => string | null;
  onOpenStation?: (stationId: string) => void;
  onClose: () => void;
  reducedMotion: boolean;
  /** Set when the stop was opened from a route panel (plan 14, U5). */
  routeBack?: SurfaceRouteBack | null;
};

/**
 * One TTC surface stop's departures, by stop number (plan 13, S3). Shares the
 * station panel's sheet and header, and the station Train Arrivals tiles: each
 * time carries the live or schedule icon, and a stale or switched-off live
 * source is named in the source line, never shown as current.
 */
export function SurfaceStopPanel({
  stopCode,
  fallbackName = null,
  stationName,
  onOpenStation,
  onClose,
  reducedMotion,
  routeBack = null,
}: Props) {
  const [result, setResult] = useState<SurfaceStopResult | null>(null);
  // The stop whose departures are shown; a different stop is still loading.
  const [loadedStopCode, setLoadedStopCode] = useState<string | null>(null);
  const loading = loadedStopCode !== stopCode;
  const [notices, setNotices] = useState<SurfaceNoticeDetail[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const { sheetRef, isDragging, isExpanded, dragHandleProps, sheetStyle } = useMobileDraggableSheet();

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    // Only the first read shows "Updating": a background refresh swaps the
    // times in place, as the station panel does, instead of blinking the
    // header badge and shifting the panel every 15 seconds.
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      getSurfaceStopArrivals(stopCode, { signal: controller.signal }).then((next) => {
        if (!active) return;
        setResult(next);
        setNow(Date.now());
        setLoadedStopCode(stopCode);
      }, () => {
        // Aborted by the next refresh or by closing.
      });
    };
    load();
    const refresh = window.setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(refresh);
    };
  }, [stopCode]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), SURFACE_ARRIVAL_COUNTDOWN_TICK_MS);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    let active = true;
    void getSurfaceNotices({ networkId: "ttc" }).then((response) => {
      // Only a fresh notice list is shown; an old saved one could name cleared notices.
      if (active) setNotices(response.source === "backend" && response.data.fresh ? response.data.notices : []);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (closeTimeoutRef.current !== null) window.clearTimeout(closeTimeoutRef.current);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    const duration = reducedMotion ? 0 : window.innerWidth < 768 ? 240 : 180;
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, duration);
  };

  const data = result?.kind === "ok" ? result.data : null;
  const name = data?.stopName ?? fallbackName ?? `Stop ${stopCode}`;
  const groups = data ? surfaceStopGroups(data) : [];
  const streetcarStop = Boolean(data?.routes.some((route) => route.mode === "streetcar"));
  const linkedStation = data?.stationId ? stationName?.(data.stationId) ?? null : null;
  // Routes with nothing in the window collapse into one line of badges (night routes by day).
  const idleRoutes = data
    ? [...new Map(data.routes
      .filter((route) => route.departures.length === 0)
      .filter((route) => !data.routes.some((other) => other.route === route.route && other.departures.length > 0))
      .map((route) => [route.route, route])).values()]
    : [];
  const stopNotices = data
    ? surfaceNoticesForStop(notices, { stopId: data.stopId, routes: data.routes.map((route) => route.route) }, now)
    : [];

  return (
    <aside
      ref={sheetRef}
      style={sheetStyle}
      className={`station-detail-panel surface-stop-panel ${isClosing ? "station-detail-closing" : ""} ${isDragging ? "station-detail-sheet-dragging" : ""} fixed left-0 right-0 bottom-0 z-45 max-h-[calc(var(--visual-viewport-height,100dvh)*0.64)] flex flex-col overflow-hidden rounded-t-lg bg-[var(--panel)] pt-1.5 pb-4 px-4 text-slate-900 shadow-2xl dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-auto md:w-[min(calc(100vw-48px),460px)] md:max-h-[calc(var(--visual-viewport-height,100dvh)-128px)] md:rounded-none md:p-0 md:bg-transparent md:shadow-none`}
      data-closing={isClosing ? "true" : undefined}
      data-surface-stop-panel={stopCode}
      aria-label={`Stop ${stopCode} departures`}
      tabIndex={-1}
      data-sheet-expanded={isExpanded ? "true" : undefined}
    >
      <MobileSheetDragHandle dragHandleProps={dragHandleProps} isDragging={isDragging} isExpanded={isExpanded} />
      <StationDetailHeader
        onPointerDown={dragHandleProps.onPointerDown}
        eyebrow={`Stop ${stopCode}`}
        stationName={name}
        updating={loading && Boolean(result)}
        onClose={handleClose}
        closeLabel="Close stop departures"
      />

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto mt-2 md:mt-3.5 pb-3 station-detail-scroll">
        {routeBack ? <SurfaceRouteBackLink back={routeBack} /> : null}
        {data?.stationId && linkedStation && onOpenStation ? (
          <button type="button" className="surface-stop-station-link" onClick={() => onOpenStation(data.stationId as string)}>
            <span>
              <strong>{linkedStation} Station</strong>
              <small>All bays and platforms at this station</small>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : null}

        {!result ? (
          <div className="surface-stop-message" role="status">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            Loading departures
          </div>
        ) : result.kind === "not-found" ? (
          <p className="surface-stop-message" role="status">
            Stop {stopCode} is not in the TTC stop list LineWatchTO has.
          </p>
        ) : result.kind === "error" ? (
          <p className="surface-stop-message" role="status">
            Departures are unavailable right now. LineWatchTO will try again.
          </p>
        ) : data && (data.availability === "not-in-schedule" || data.availability === "unavailable") ? (
          <p className="surface-stop-message" role="status">{data.message}</p>
        ) : data ? (
          <section
            className={`w-full rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5${reducedMotion ? "" : " surface-stop-departures-enter"}`}
            data-station-section="stop-departures"
            data-live-state={data.live.state}
          >
            <h3 className="station-subsection-header flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
              <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
              {streetcarStop ? <TramFront size={20} className="shrink-0" aria-hidden="true" /> : <Bus size={20} className="shrink-0" aria-hidden="true" />}
              <span>Departures</span>
            </h3>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500" role="status">
              {surfaceStopSourceLine(data)}
            </p>
            {groups.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2" aria-label="Departures by route">
                {groups.map((group, index) => {
                  const details = parseSurfaceRouteDetails(group, "ttc");
                  const subtitle = [group.mode === "streetcar" ? "TTC Streetcar" : "TTC Bus", details.direction]
                    .filter(Boolean).join(" · ");
                  return (
                    <Fragment key={group.key}>
                      {index > 0 ? <div className="station-arrival-line-divider my-1" aria-hidden="true" /> : null}
                      <div
                        className={reducedMotion ? undefined : "surface-stop-route-enter"}
                        style={reducedMotion ? undefined : { animationDelay: `${Math.min(index, 5) * 40}ms` }}
                      >
                      <SurfaceRouteCard
                        group={group}
                        networkId="ttc"
                        stationName={name}
                        tick={now}
                        subtitle={subtitle}
                        showDay
                      />
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                {data.availability === "disabled" ? "Departures are turned off." : data.message ?? "No departures right now."}
              </p>
            )}
            {idleRoutes.length > 0 ? (
              <div className="surface-stop-idle">
                <span>
                  {data.availability === "disabled" || groups.length === 0
                    ? "Routes at this stop"
                    : "Also stops here, no departures in the next day"}
                </span>
                <span className="surface-stop-idle-badges">
                  {idleRoutes.map((route) => (
                    <span key={route.route} className={`surface-stop-route-badge is-small is-${route.mode}`} style={ttcRouteBadgeStyle(route.route)} title={route.routeName}>
                      {route.route}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
            {data.availability !== "disabled" ? (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-800/70 dark:text-amber-200/55">
                {surfaceStopDisclaimer(data)}
              </p>
            ) : null}
          </section>
        ) : null}

        {stopNotices.length > 0 ? (
          <section className="surface-stop-notices" aria-labelledby="surface-stop-notices-heading">
            <h3 id="surface-stop-notices-heading">Service Notices</h3>
            <ul>
              {stopNotices.map((notice) => (
                <li key={notice.id}>
                  <strong>{notice.title}</strong>
                  {notice.location ? <span>{notice.location}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

      </div>
    </aside>
  );
}
