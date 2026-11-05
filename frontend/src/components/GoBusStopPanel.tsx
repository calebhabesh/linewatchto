"use client";

import { Bus, LoaderCircle } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  getGoBusStopDepartures,
  goBusStopDisclaimer,
  goBusStopGroups,
  goBusStopSourceLine,
  type GoBusStopResult,
} from "../app/go-bus-stop-departures";
import { parseSurfaceRouteDetails, SURFACE_ARRIVAL_COUNTDOWN_TICK_MS } from "../app/surface-arrivals";
import { useMobileDraggableSheet } from "../hooks/useMobileDraggableSheet";
import { MobileSheetDragHandle } from "./MobileSheetDragHandle";
import { StationDetailHeader } from "./StationDetailHeader";
import type { SurfaceNoticeDetail } from "../app/surface-notice-data";
import { surfaceNoticesForStop } from "../app/surface-stop-arrivals";
import { SurfaceStopDisruption, SurfaceStopImpacts, useFreshSurfaceNotices } from "./SurfaceStopImpacts";
import { SurfaceNoticeBackLink, SurfaceRouteBackLink, SurfaceSearchBackLink, type SurfaceNoticeBack, type SurfaceRouteBack, type SurfaceSearchBack } from "./SurfaceRoutePanel";
import { isWellFormedStopCode } from "../app/surface-stop-link";
import { SurfaceRouteCard } from "./SurfaceConnectionsSection";

/** Next Service answers are cached for 30 s on the server; reading faster gains nothing. */
const REFRESH_MS = 30_000;

type Props = {
  stopCode: string;
  /** Name and routes from the map's GO stop file, shown while the departures load. */
  fallbackName?: string | null;
  /** Each route's GO colour, from the corridor catalog. */
  routeColor?: (route: string) => { color: string; textColor: string } | null;
  onClose: () => void;
  reducedMotion: boolean;
  /** Set when the stop was opened from a route panel (plan 14, U5). */
  routeBack?: SurfaceRouteBack | null;
  /** Set when the stop was opened from search (U7); a route's Back comes first. */
  searchBack?: SurfaceSearchBack | null;
  /** Set when the stop was opened by a notice's View (plan 15, L4). */
  noticeBack?: SurfaceNoticeBack | null;
  /** A Stop Impacts card's View Details: its card in the notice list. */
  onOpenNotice?: (notice: SurfaceNoticeDetail) => void;
};

/**
 * One GO bus stop's departures, by GO stop number (plan 13, S6). Shares the
 * TTC stop panel's sheet, header and arrival tiles: each time carries the
 * live or schedule icon, and a stale, failed or switched-off source shows no
 * times.
 */
export function GoBusStopPanel({ stopCode, fallbackName = null, routeColor, onClose, reducedMotion, routeBack = null, searchBack = null, noticeBack = null, onOpenNotice }: Props) {
  const [result, setResult] = useState<GoBusStopResult | null>(null);
  const [loadedStopCode, setLoadedStopCode] = useState<string | null>(null);
  const loading = loadedStopCode !== stopCode;
  const [now, setNow] = useState(() => Date.now());
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const { sheetRef, isDragging, isExpanded, dragHandleProps, sheetStyle } = useMobileDraggableSheet();

  useEffect(() => {
    if (!isWellFormedStopCode(stopCode)) {
      // A stop link whose value cannot be a stop number (U7): say so without asking the server.
      /* eslint-disable react-hooks/set-state-in-effect */
      setResult({ kind: "not-found", stopCode });
      setLoadedStopCode(stopCode);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let active = true;
    let controller: AbortController | null = null;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      getGoBusStopDepartures(stopCode, { signal: controller.signal }).then((next) => {
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
  const name = data?.stopName ?? fallbackName ?? `GO Stop ${stopCode}`;
  const groups = data ? goBusStopGroups(data) : [];
  const departingRoutes = new Set(groups.map((group) => group.route));
  const idleRoutes = data ? data.routes.filter((route) => !departingRoutes.has(route)) : [];
  const notices = useFreshSurfaceNotices("regional");
  // GO Bus notices only: GO/UP rail notices say nothing about a bus stop.
  const stopNotices = data
    ? surfaceNoticesForStop(notices.filter((notice) => notice.routeType === "GO Bus"), { stopId: data.stopCode, routes: data.routes }, now)
    : [];
  const routeBadgeStyle = (route: string) => {
    const colors = routeColor?.(route);
    return colors ? { backgroundColor: colors.color, color: colors.textColor } : undefined;
  };

  return (
    <aside
      ref={sheetRef}
      style={sheetStyle}
      className={`station-detail-panel surface-stop-panel go-bus-stop-panel ${isClosing ? "station-detail-closing" : ""} ${isDragging ? "station-detail-sheet-dragging" : ""} fixed left-0 right-0 bottom-0 z-45 max-h-[calc(var(--visual-viewport-height,100dvh)*0.64)] flex flex-col overflow-hidden rounded-t-lg bg-[var(--panel)] pt-1.5 pb-4 px-4 text-slate-900 shadow-2xl dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-auto md:w-[min(calc(100vw-48px),460px)] md:max-h-[calc(var(--visual-viewport-height,100dvh)-128px)] md:rounded-none md:p-0 md:bg-transparent md:shadow-none`}
      data-closing={isClosing ? "true" : undefined}
      data-go-bus-stop-panel={stopCode}
      aria-label={`GO stop ${stopCode} departures`}
      tabIndex={-1}
      data-sheet-expanded={isExpanded ? "true" : undefined}
    >
      <MobileSheetDragHandle dragHandleProps={dragHandleProps} isDragging={isDragging} isExpanded={isExpanded} />
      <StationDetailHeader
        onPointerDown={dragHandleProps.onPointerDown}
        eyebrow={`GO Stop ${stopCode}`}
        stationName={name}
        updating={loading && Boolean(result)}
        onClose={handleClose}
        closeLabel="Close stop departures"
      />

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto mt-2 md:mt-3.5 pb-3 station-detail-scroll">
        {routeBack ? <SurfaceRouteBackLink back={routeBack} /> : searchBack ? <SurfaceSearchBackLink back={searchBack} /> : noticeBack ? <SurfaceNoticeBackLink back={noticeBack} /> : null}
        <SurfaceStopDisruption notices={stopNotices} stopId={data?.stopCode ?? null} reducedMotion={reducedMotion} />
        {!result ? (
          <div className="surface-stop-message" role="status">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            Loading departures
          </div>
        ) : result.kind === "not-found" ? (
          <p className="surface-stop-message" role="status">
            GO stop {stopCode} is not in the GO bus stop list LineWatchTO has.
          </p>
        ) : result.kind === "error" ? (
          <p className="surface-stop-message" role="status">
            Departures are unavailable right now. LineWatchTO will try again.
          </p>
        ) : data ? (
          <section
            className={`w-full rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5${reducedMotion ? "" : " surface-stop-departures-enter"}`}
            data-station-section="stop-departures"
            data-availability={data.availability}
          >
            <h3 className="station-subsection-header flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
              <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
              <Bus size={20} className="shrink-0" aria-hidden="true" />
              <span>Departures</span>
            </h3>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500" role="status">
              {goBusStopSourceLine(data)}
            </p>
            {groups.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2" aria-label="Departures by route">
                {groups.map((group, index) => {
                  const details = parseSurfaceRouteDetails(group, "regional");
                  const subtitle = ["GO Bus", details.direction, group.bayPlatform ? `Bay ${group.bayPlatform}` : ""]
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
                          networkId="regional"
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
                {data.message ?? "No departures right now."}
              </p>
            )}
            {idleRoutes.length > 0 ? (
              <div className="surface-stop-idle">
                <span>{groups.length === 0 ? "Routes at this stop" : "Also stops here, nothing listed soon"}</span>
                <span className="surface-stop-idle-badges">
                  {idleRoutes.map((route) => (
                    <span key={route} className="surface-stop-route-badge is-small is-bus" style={routeBadgeStyle(route)}>
                      {route}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
            {data.availability === "available" || data.availability === "no-departures" ? (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-800/70 dark:text-amber-200/55">
                {goBusStopDisclaimer(data.horizonMinutes)}
              </p>
            ) : null}
          </section>
        ) : null}
        <SurfaceStopImpacts notices={stopNotices} stopId={data?.stopCode ?? null} routeBadgeStyle={routeBadgeStyle} onOpenNotice={onOpenNotice} />
      </div>
    </aside>
  );
}
