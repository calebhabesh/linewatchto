"use client";

import { ArrowLeft, ChevronRight, LoaderCircle, MapPinned, Megaphone } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { SurfaceSearchRoute } from "../app/surface-search";
import { streetcarSchedulePeriodLabel } from "../app/geographic-surface-catalog";
import { surfaceRouteLayer } from "../app/surface-map-selection";
import {
  cachedRouteStops,
  loadRouteStops,
  routeDirections,
  surfaceNoticesForRoute,
  type RouteStopsFile,
} from "../app/surface-route-stops";
import { cachedSurfaceSearchIndex, loadSurfaceSearchIndex } from "../app/surface-search-index";
import { getSurfaceNotices, type SurfaceNoticeDetail } from "../app/surface-notice-data";
import type { PreparedSurfaceIndex } from "../app/surface-search";
import { useMobileDraggableSheet } from "../hooks/useMobileDraggableSheet";
import { MobileSheetDragHandle } from "./MobileSheetDragHandle";
import { StationDetailHeader } from "./StationDetailHeader";
import { surfaceRouteBadgeStyle, surfaceRouteKindLabel } from "./SurfaceSearchResults";
import { ttcRouteBadgeColors } from "../app/ttc-route-badge";
import { searchBackLabel } from "../app/search-return";

/** Where the rider was in the panel, so Back from a stop returns there. */
export type SurfaceRoutePanelPlace = {
  direction: number;
  /** Chosen branch per direction (GTFS direction id → branch index). */
  branches: Record<number, number>;
  scrollTop: number;
};

type Props = {
  route: SurfaceSearchRoute;
  onClose: () => void;
  reducedMotion: boolean;
  /** Opens a stop's departures; the place lets Back return to this list. */
  onOpenStop: (stopCode: string, place: SurfaceRoutePanelPlace) => void;
  onOpenNotice: (notice: SurfaceNoticeDetail) => void;
  /** Draws (or stops drawing) this route on the Map View while the panel is open. */
  onToggleMap: (show: boolean) => void;
  shownOnMap: boolean;
  initialPlace?: SurfaceRoutePanelPlace | null;
  /**
   * Stops near the rider, nearest first, from a Stops Near Me list (U6). The
   * first one on the shown branch is marked Nearest. Location is never
   * requested here.
   */
  nearbyStopCodes?: readonly string[];
  /** Set when the route was opened from search (U7): Back returns to the results. */
  searchBack?: SurfaceSearchBack | null;
};

const NO_STOPS: readonly string[] = [];

type StopsState =
  | { status: "loading" }
  | { status: "ready"; file: RouteStopsFile }
  | { status: "error" };

/**
 * A surface route opened from search (plan 14, U3 and U5), in the stop
 * panel's place: desktop sidebar, phone sheet. It names the route and the
 * published schedule it comes from, its active notices, and its stops by
 * direction, each opening that stop's departures. It never says whether the
 * route is running: View on Map draws it in the neutral selected style only
 * while this panel is open.
 */
export function SurfaceRoutePanel({
  route,
  onClose,
  reducedMotion,
  onOpenStop,
  onOpenNotice,
  onToggleMap,
  shownOnMap,
  initialPlace = null,
  nearbyStopCodes = NO_STOPS,
  searchBack = null,
}: Props) {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { sheetRef, isDragging, isExpanded, dragHandleProps, sheetStyle } = useMobileDraggableSheet();
  const layer = surfaceRouteLayer(route.kind);

  const [stops, setStops] = useState<StopsState>(() => {
    if (!route.drawn) return { status: "error" };
    const cached = cachedRouteStops(layer);
    return cached ? { status: "ready", file: cached } : { status: "loading" };
  });
  const [index, setIndex] = useState<PreparedSurfaceIndex | null>(() => cachedSurfaceSearchIndex(route.network));
  const [notices, setNotices] = useState<SurfaceNoticeDetail[]>([]);
  const [directionId, setDirectionId] = useState<number | null>(initialPlace?.direction ?? null);
  const [branchByDirection, setBranchByDirection] = useState<Record<number, number>>(initialPlace?.branches ?? {});

  useEffect(() => {
    if (!route.drawn || stops.status === "ready") return;
    let active = true;
    loadRouteStops(layer).then(
      (file) => { if (active) setStops({ status: "ready", file }); },
      () => { if (active) setStops({ status: "error" }); },
    );
    return () => { active = false; };
  }, [layer, route.drawn, stops.status]);

  useEffect(() => {
    if (index) return;
    let active = true;
    loadSurfaceSearchIndex(route.network).then((next) => { if (active) setIndex(next); }, () => {
      // Names fall back to stop numbers.
    });
    return () => { active = false; };
  }, [index, route.network]);

  useEffect(() => {
    let active = true;
    void getSurfaceNotices({ networkId: route.network }).then((response) => {
      // Only a fresh list from the server: an old saved one could name cleared notices.
      if (active) setNotices(response.source === "backend" && response.data.fresh ? response.data.notices : []);
    });
    return () => { active = false; };
  }, [route.network]);

  useEffect(() => () => {
    if (closeTimeoutRef.current !== null) window.clearTimeout(closeTimeoutRef.current);
  }, []);

  const stopName = (code: string) => {
    const at = index?.stopByCode.get(code);
    return at === undefined ? null : index!.stops[at].name;
  };
  const directions = stops.status === "ready" ? routeDirections(stops.file.routes[route.route], stopName) : [];
  const direction = directions.find((candidate) => candidate.direction === directionId) ?? directions[0] ?? null;
  const branchIndex = direction ? Math.min(branchByDirection[direction.direction] ?? 0, direction.branches.length - 1) : 0;
  const branch = direction?.branches[branchIndex] ?? null;
  const routeNotices = surfaceNoticesForRoute(notices, route);

  // Back from a stop lands where the rider left the list.
  const restoredScrollRef = useRef(false);
  useLayoutEffect(() => {
    if (restoredScrollRef.current || !branch || !scrollRef.current) return;
    restoredScrollRef.current = true;
    if (initialPlace) scrollRef.current.scrollTop = initialPlace.scrollTop;
  }, [branch, initialPlace]);

  const handleClose = () => {
    setIsClosing(true);
    const duration = reducedMotion ? 0 : window.innerWidth < 768 ? 240 : 180;
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, duration);
  };

  const place = (): SurfaceRoutePanelPlace => ({
    direction: direction?.direction ?? 0,
    branches: branchByDirection,
    scrollTop: scrollRef.current?.scrollTop ?? 0,
  });

  const kind = surfaceRouteKindLabel(route);
  const night = route.period.servicePattern === "weekday-night";
  const period = streetcarSchedulePeriodLabel(route.period);
  const stopBadgeClass = `surface-search-stop-code is-${route.network}`;
  // The rail takes the badge's identity colour; a night badge's is its blue edge.
  const ttcBadge = route.network === "ttc" ? ttcRouteBadgeColors(route.route) : null;
  const railColor = ttcBadge ? ttcBadge.edge ?? ttcBadge.fill : route.color;
  // Every listed nearby stop is at most 1 km away; the first one this branch serves is its nearest.
  const nearestStopCode = branch ? nearbyStopCodes.find((code) => branch.stops.includes(code)) ?? null : null;

  return (
    <aside
      ref={sheetRef}
      style={sheetStyle}
      className={`station-detail-panel surface-stop-panel surface-route-panel ${isClosing ? "station-detail-closing" : ""} ${isDragging ? "station-detail-sheet-dragging" : ""} fixed left-0 right-0 bottom-0 z-45 max-h-[calc(var(--visual-viewport-height,100dvh)*0.64)] flex flex-col overflow-hidden rounded-t-lg bg-[var(--panel)] pt-1.5 pb-4 px-4 text-slate-900 shadow-2xl dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-auto md:w-[min(calc(100vw-48px),460px)] md:max-h-[calc(var(--visual-viewport-height,100dvh)-128px)] md:rounded-none md:p-0 md:bg-transparent md:shadow-none`}
      data-closing={isClosing ? "true" : undefined}
      data-surface-route-panel={`${route.network}:${route.route}`}
      aria-label={`${kind} route ${route.route} ${route.name}`}
      tabIndex={-1}
      data-sheet-expanded={isExpanded ? "true" : undefined}
    >
      <MobileSheetDragHandle dragHandleProps={dragHandleProps} isDragging={isDragging} isExpanded={isExpanded} />
      <StationDetailHeader
        onPointerDown={dragHandleProps.onPointerDown}
        eyebrow={`${kind} Route`}
        stationName={`${route.route} ${route.name}`}
        updating={false}
        onClose={handleClose}
        closeLabel="Close route"
      />
      <div ref={scrollRef} className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto mt-2 md:mt-3.5 pb-3 station-detail-scroll">
        {searchBack ? <SurfaceSearchBackLink back={searchBack} /> : null}
        <div className="surface-route-panel-summary">
          <span className="surface-stop-route-badge" style={surfaceRouteBadgeStyle(route)} aria-hidden="true">{route.route}</span>
          <p>
            {night ? "Weekday night schedule" : "Weekday schedule"}, {period}. Not live service.
          </p>
        </div>

        {route.drawn ? (
          <button
            type="button"
            className="surface-route-map-button"
            aria-pressed={shownOnMap}
            onClick={() => onToggleMap(!shownOnMap)}
          >
            <MapPinned size={17} aria-hidden="true" />
            <span>{shownOnMap ? "Shown on Map" : "View on Map"}</span>
            {shownOnMap ? <small>Hide</small> : null}
          </button>
        ) : (
          <p className="surface-stop-message surface-route-undrawn" role="note">
            Not on the map: no trips of this route are drawn this schedule period, so it has no stop list here.
            Search a stop number for its departures.
          </p>
        )}

        {routeNotices.length > 0 ? (
          <section className="surface-stop-notices surface-route-notices" aria-labelledby="surface-route-notices-heading">
            <h3 id="surface-route-notices-heading">Service Notices</h3>
            <ul>
              {routeNotices.map((notice) => (
                <li key={notice.id}>
                  <button type="button" onClick={() => onOpenNotice(notice)}>
                    <Megaphone size={15} aria-hidden="true" />
                    <span>
                      <strong>{notice.title}</strong>
                      {notice.location ? <span>{notice.location}</span> : null}
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {route.drawn && stops.status === "loading" ? (
          <div className="surface-stop-message" role="status">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            Loading stops
          </div>
        ) : null}
        {route.drawn && stops.status === "error" ? (
          <p className="surface-stop-message" role="status">The stop list is unavailable right now.</p>
        ) : null}

        {direction && branch ? (
          <section className="surface-route-stops" aria-labelledby="surface-route-stops-heading" data-route-direction={direction.direction}>
            <h3 id="surface-route-stops-heading" className="surface-route-stops-heading">Stops</h3>
            {directions.length > 1 ? (
              <div className="surface-route-directions" role="group" aria-label="Direction">
                {directions.map((candidate) => (
                  <button
                    key={candidate.direction}
                    type="button"
                    aria-pressed={candidate.direction === direction.direction}
                    onClick={() => setDirectionId(candidate.direction)}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            ) : null}
            {direction.branches.length > 1 ? (
              <div className="surface-route-branches" role="group" aria-label="Branch">
                {direction.branches.map((candidate, at) => (
                  <button
                    key={`${direction.direction}:${at}`}
                    type="button"
                    aria-pressed={at === branchIndex}
                    onClick={() => setBranchByDirection((current) => ({ ...current, [direction.direction]: at }))}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="surface-route-branch-label">{branch.label}</p>
            )}
            <ol className="surface-route-stop-list" style={{ "--surface-route-color": railColor } as CSSProperties}>
              {branch.stops.map((code, at) => {
                const name = stopName(code) ?? `Stop ${code}`;
                const nearest = code === nearestStopCode && at === branch.stops.indexOf(code);
                return (
                  <li key={`${code}:${at}`} data-nearest={nearest ? "true" : undefined}>
                    <button
                      type="button"
                      data-surface-route-stop={code}
                      aria-label={`Stop ${code}, ${name}${nearest ? ", nearest to you" : ""}: departures`}
                      onClick={() => onOpenStop(code, place())}
                    >
                      <span className="surface-route-stop-dot" aria-hidden="true" />
                      <span className="surface-route-stop-name">
                        {name}
                        {nearest ? <small>Nearest</small> : null}
                      </span>
                      <span className={stopBadgeClass} aria-hidden="true">{code}</span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="surface-route-stops-note">
              Stops in order from the published timetable. Shorter trips may not serve every stop.
            </p>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

/** The way back from a stop opened in a route panel: a stop panel's first row. */
export type SurfaceRouteBack = { route: string; name: string; onBack: () => void };

export function SurfaceRouteBackLink({ back }: { back: SurfaceRouteBack }) {
  return (
    <button
      type="button"
      className="surface-stop-station-link surface-route-back-link"
      onClick={back.onBack}
      aria-label={`Back to route ${back.route} ${back.name}`}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      <span>
        <strong>{back.route} {back.name}</strong>
        <small>Back to all stops on this route</small>
      </span>
    </button>
  );
}

export type SurfaceNoticeBack = { title: string; onBack: () => void };

/** A stop opened by a notice's View (plan 15, L4): back to the notice list where it was. */
export function SurfaceNoticeBackLink({ back }: { back: SurfaceNoticeBack }) {
  return (
    <button
      type="button"
      className="surface-stop-station-link surface-route-back-link surface-notice-back-link"
      onClick={back.onBack}
      aria-label={`Back to notices: ${back.title}`}
      data-notice-back
    >
      <ArrowLeft size={16} aria-hidden="true" />
      <span>
        <strong>Back to Notices</strong>
        <small>{back.title}</small>
      </span>
    </button>
  );
}

export type SurfaceSearchBack = { query: string; onBack: () => void };

/** A stop or route opened from search (plan 14, U7): back to the results, query and scroll kept. */
export function SurfaceSearchBackLink({ back }: { back: SurfaceSearchBack }) {
  const label = searchBackLabel(back.query);
  return (
    <button
      type="button"
      className="surface-stop-station-link surface-route-back-link"
      onClick={back.onBack}
      aria-label={label.ariaLabel}
      data-search-back
    >
      <ArrowLeft size={16} aria-hidden="true" />
      <span>
        <strong>{label.title}</strong>
        <small>{label.detail}</small>
      </span>
    </button>
  );
}
