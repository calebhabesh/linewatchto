"use client";

import { ArrowLeft, ArrowLeftRight, ChevronRight, LoaderCircle, Megaphone, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { SurfaceSearchRoute } from "../app/surface-search";
import { streetcarSchedulePeriodLabel } from "../app/geographic-surface-catalog";
import { surfaceRouteLayer, type SurfaceSelectionRoute } from "../app/surface-map-selection";
import {
  cachedRouteStops,
  loadRouteStops,
  busiestVariantFor,
  expressCounterpart,
  routeDirections,
  routeVariants,
  surfaceNoticesForRoute,
  surfaceNoticeTiming,
  type RouteStopsFile,
  type RouteVariant,
} from "../app/surface-route-stops";
import {
  countDirectionMatches,
  countVariantMatches,
  matchRouteStop,
  routeStopAlternatives,
  routeStopFilterTokens,
  type TextRange,
} from "../app/route-stop-filter";
import { cachedSurfaceSearchIndex, loadSurfaceSearchIndex } from "../app/surface-search-index";
import { getSurfaceNotices, type SurfaceNoticeDetail } from "../app/surface-notice-data";
import { surfaceNoticeCategoryLabel } from "../app/surface-notice-groups";
import { SurfaceCategoryIcon } from "./SurfaceCategoryIcon";
import { SurfaceNoticeStartsChip } from "./SurfaceStopImpacts";
import type { PreparedSurfaceIndex } from "../app/surface-search";
import { useMobileDraggableSheet } from "../hooks/useMobileDraggableSheet";
import { FilterSearchRow } from "./FilterSearchRow";
import { MapPinned } from "./ImpactCardFields";
import { MobileSheetDragHandle } from "./MobileSheetDragHandle";
import { StationDetailHeader } from "./StationDetailHeader";
import { surfaceRouteBadgeStyle, surfaceRouteKindLabel } from "./SurfaceSearchResults";
import { ttcRouteBadgeColors } from "../app/ttc-route-badge";
import { searchBackLabel } from "../app/search-return";

/** Where the rider was in the panel, so Back from a stop returns there. */
export type SurfaceRoutePanelPlace = {
  direction: number;
  /** The chosen branch's id. */
  variant?: string;
  scrollTop: number;
  /** What the rider had typed in Search Stops. */
  filter?: string;
};

type Props = {
  route: SurfaceSearchRoute;
  onClose: () => void;
  reducedMotion: boolean;
  /** Opens a stop's departures; the place lets Back return to this list. */
  onOpenStop: (stopCode: string, place: SurfaceRoutePanelPlace) => void;
  onOpenNotice: (notice: SurfaceNoticeDetail) => void;
  /** Draws (or stops drawing) this route, or one branch of it, on the Map View while the panel is open. */
  onToggleMap: (show: boolean, branch: SurfaceSelectionRoute["branch"]) => void;
  /** Opens a linked route (an express and its regular route) in this panel's place. */
  onOpenRoute: (route: SurfaceSearchRoute) => void;
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

/** A branch's name, with its two ways drawn as an icon the font's arrow is too small for. */
function VariantName({ name }: { name: string }) {
  const [first, ...rest] = name.split(" ↔ ");
  return (
    <span className="surface-route-variant-name">
      {first}
      {rest.map((place) => (
        <span key={place}>
          <ArrowLeftRight size={13} className="surface-route-variant-arrow" aria-hidden="true" />
          <span className="sr-only"> and </span>
          {place}
        </span>
      ))}
    </span>
  );
}

/** Text with the filter's matches marked. */
function MarkedText({ text, ranges }: { text: string; ranges: readonly TextRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={start} className="surface-route-stop-mark">{text.slice(start, end)}</mark>);
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

type StopsState =
  | { status: "loading" }
  | { status: "ready"; file: RouteStopsFile }
  | { status: "error" };

/**
 * A surface route opened from search (plan 14, U3 and U5), in the stop
 * panel's place: desktop sidebar, phone sheet. It names the route and the
 * published schedule it comes from, its active notices, and its stops by
 * direction, each opening that stop's departures. It never says whether the
 * route is running: View on Map draws it in the selection style only
 * while this panel is open.
 */
export function SurfaceRoutePanel({
  route,
  onClose,
  reducedMotion,
  onOpenStop,
  onOpenNotice,
  onToggleMap,
  onOpenRoute,
  shownOnMap,
  initialPlace = null,
  nearbyStopCodes = NO_STOPS,
  searchBack = null,
}: Props) {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const { sheetRef, isDragging, isExpanded, handleToggleExpand, dragHandleProps, sheetStyle } = useMobileDraggableSheet();
  const layer = surfaceRouteLayer(route.kind);

  const [stops, setStops] = useState<StopsState>(() => {
    if (!route.drawn) return { status: "error" };
    const cached = cachedRouteStops(layer);
    return cached ? { status: "ready", file: cached } : { status: "loading" };
  });
  const [index, setIndex] = useState<PreparedSurfaceIndex | null>(() => cachedSurfaceSearchIndex(route.network));
  const [notices, setNotices] = useState<SurfaceNoticeDetail[]>([]);
  const [now] = useState(() => Date.now());
  const [directionId, setDirectionId] = useState<number | null>(initialPlace?.direction ?? null);
  const [variantCode, setVariantCode] = useState<string | null>(initialPlace?.variant ?? null);
  const [filter, setFilter] = useState(initialPlace?.filter ?? "");

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
  const patterns = stops.status === "ready" ? stops.file.routes[route.route] : null;
  // The whole route's, for the direction switch: a variant may run one way only.
  const directions = routeDirections(patterns, stopName);
  const stopPoint = (code: string) => {
    const at = index?.stopByCode.get(code);
    return at === undefined ? null : index!.stops[at];
  };
  const variants = routeVariants(patterns, route.route, stopName, stopPoint);
  const variant = variants.find((candidate) => candidate.id === variantCode)
    ?? busiestVariantFor(variants, directionId ?? directions[0]?.direction ?? 0)
    ?? variants[0]
    ?? null;
  const direction = variant?.directions.find((candidate) => candidate.direction === directionId) ?? variant?.directions[0] ?? null;
  const branch = direction?.branches[0] ?? null;
  // What View on Map draws: this branch, on a route that has several; else the whole route.
  const mapBranch = (chosen: RouteVariant | null): SurfaceSelectionRoute["branch"] => (
    chosen && variants.length > 1
      ? {
        id: chosen.id,
        path: chosen.directions.map((candidate) => (candidate.branches[0]?.stops ?? []).flatMap((code): [number, number][] => {
          const point = stopPoint(code);
          return point ? [[point.lon, point.lat]] : [];
        })),
      }
      : undefined
  );
  const chooseVariant = (next: RouteVariant | null) => {
    setVariantCode(next?.id ?? null);
    if (shownOnMap && next && next.id !== variant?.id) onToggleMap(true, mapBranch(next));
  };
  // A direction this branch does not run opens the busiest one that does.
  const chooseDirection = (next: number) => {
    setDirectionId(next);
    if (!variant?.directions.some((candidate) => candidate.direction === next)) chooseVariant(busiestVariantFor(variants, next));
  };
  const linked = index ? expressCounterpart(route, index.routes) : null;
  const routeNotices = surfaceNoticesForRoute(notices, route, now);

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
    variant: variant?.id,
    scrollTop: scrollRef.current?.scrollTop ?? 0,
    filter,
  });

  const filterTokens = routeStopFilterTokens(filter);
  const filtering = filterTokens.length > 0;
  const shownName = (code: string) => stopName(code) ?? `Stop ${code}`;
  const stopNotice = (code: string) => noticeNamingStop(routeNotices, code, stopName(code), now);
  // Every stop of the branch in order, with its place, so the rail can show what was skipped.
  const listedStops = (branch?.stops ?? []).flatMap((code, at) => {
    const match = filtering ? matchRouteStop(filterTokens, code, shownName(code)) : null;
    return !filtering || match ? [{ code, at, match }] : [];
  });
  const alternatives = filtering && variant && direction && listedStops.length === 0
    ? routeStopAlternatives(filterTokens, variants, { variant: variant.id, direction: direction.direction }, shownName)
    : [];
  const showAlternative = (alternative: { variant: string; direction: number }) => {
    chooseVariant(variants.find((candidate) => candidate.id === alternative.variant) ?? null);
    setDirectionId(alternative.direction);
  };
  // A phone's keyboard would cover the results: open the sheet, with the box at its top.
  const handleFilterFocus = () => {
    if (window.innerWidth >= 768) return;
    if (!isExpanded) handleToggleExpand();
    requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      const box = filterRef.current;
      if (scroller && box) {
        scroller.scrollTop += box.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      }
    });
  };
  const handleFilterKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && filter) {
      // Clears first; a second Escape does what it does anywhere else.
      event.preventDefault();
      event.stopPropagation();
      setFilter("");
    } else if (event.key === "Enter" && filtering) {
      event.preventDefault();
      if (listedStops[0]) onOpenStop(listedStops[0].code, place());
      else if (alternatives[0]) showAlternative(alternatives[0]);
    }
  };

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
        stationName={route.name}
        nameBadge={<span className="surface-route-title-badge" style={surfaceRouteBadgeStyle(route)}>{route.route}</span>}
        updating={false}
        onClose={handleClose}
        closeLabel="Close route"
      />
      <div ref={scrollRef} className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto mt-2 md:mt-3.5 pb-3 station-detail-scroll">
        {searchBack ? <SurfaceSearchBackLink back={searchBack} /> : null}
        {variants.length > 1 ? (
          <section className="surface-route-variants" aria-labelledby="surface-route-variants-heading">
            <h3 id="surface-route-variants-heading" className="surface-route-stops-heading">Branches</h3>
            <div role="group" aria-labelledby="surface-route-variants-heading">
              {variants.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className="surface-route-variant"
                  data-route-variant={candidate.id}
                  aria-pressed={candidate.id === variant?.id}
                  onClick={() => chooseVariant(candidate)}
                >
                  <span className="surface-route-variant-badge route-code-badge" style={surfaceRouteBadgeStyle(route)}>{candidate.code}</span>
                  <VariantName name={candidate.name} />
                  {filtering ? <small className="surface-route-filter-count">{countVariantMatches(filterTokens, candidate, shownName)}</small> : null}
                </button>
              ))}
            </div>
          </section>
        ) : variant && variant.code !== route.route ? (
          <div className="surface-route-variant" data-route-variant={variant.id}>
            <span className="surface-route-variant-badge route-code-badge" style={surfaceRouteBadgeStyle(route)}>{variant.code}</span>
            <VariantName name={variant.name} />
          </div>
        ) : null}
        {linked ? (
          <section className="surface-route-variants" aria-labelledby="surface-route-linked-heading">
            <h3 id="surface-route-linked-heading" className="surface-route-stops-heading">
              {linked.isExpress ? "Express Variant" : "Regular Route"}
            </h3>
            <button
              type="button"
              className="surface-route-variant surface-route-linked"
              data-linked-route={linked.route.route}
              aria-label={`Jump to route ${linked.route.route} ${linked.route.name}`}
              onClick={() => onOpenRoute(linked.route)}
            >
              <span className="surface-route-variant-badge route-code-badge" style={surfaceRouteBadgeStyle(linked.route)}>{linked.route.route}</span>
              <span className="surface-route-variant-name">{linked.route.name}</span>
              <span className="surface-route-linked-action">Jump To<ChevronRight size={15} aria-hidden="true" /></span>
            </button>
          </section>
        ) : null}
        <div className="surface-route-panel-summary">
          <p>
            {night ? "Weekday night schedule" : "Weekday schedule"}, {period}. Not live service.
          </p>
        </div>

        {route.drawn ? (
          <button
            type="button"
            className="impact-card-map-btn surface-route-map-button"
            aria-pressed={shownOnMap}
            onClick={() => onToggleMap(!shownOnMap, mapBranch(variant))}
          >
            <MapPinned size={18} className="map-pinned-icon" aria-hidden="true" />
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
                      {notice.startAt && surfaceNoticeTiming(notice, now) === "upcoming" ? <SurfaceNoticeStartsChip startAt={notice.startAt} now={now} /> : null}
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
            <p className="surface-route-branch-label">{branch.label}</p>
            <div ref={filterRef} className="surface-route-filter">
              <FilterSearchRow active={filter.length > 0} onReset={() => setFilter("")}>
                <label className="impact-list-search">
                  <Search size={14} aria-hidden="true" />
                  <span className="sr-only">Search stops on this route by name or number</span>
                  <input
                    type="search"
                    className="submenu-search-input"
                    value={filter}
                    placeholder="Search Stops"
                    enterKeyHint="go"
                    onChange={(event) => setFilter(event.target.value)}
                    onFocus={handleFilterFocus}
                    onKeyDown={handleFilterKeyDown}
                  />
                </label>
              </FilterSearchRow>
            </div>
            {directions.length > 1 ? (
              <div className="surface-route-directions" role="group" aria-label="Direction">
                {directions.map((candidate) => (
                  <button
                    key={candidate.direction}
                    type="button"
                    aria-pressed={candidate.direction === direction.direction}
                    onClick={() => chooseDirection(candidate.direction)}
                  >
                    {candidate.label}
                    {filtering ? <small className="surface-route-filter-count">{countDirectionMatches(filterTokens, candidate, shownName)}</small> : null}
                  </button>
                ))}
              </div>
            ) : null}
            {filtering ? (
              <p className="surface-route-filter-status" role="status">
                {listedStops.length} of {branch.stops.length} {branch.stops.length === 1 ? "Stop" : "Stops"}
              </p>
            ) : null}
            {filtering && listedStops.length === 0 ? (
              <div className="surface-route-filter-empty">
                <p>{alternatives.length > 0 ? "No matching stops on this list." : "No stops on this route match."}</p>
                {alternatives.map((alternative) => (
                  <button
                    key={`${alternative.variant}:${alternative.direction}`}
                    type="button"
                    className="impact-card-map-btn"
                    onClick={() => showAlternative(alternative)}
                  >
                    Show {alternative.label} ({alternative.count})
                  </button>
                ))}
              </div>
            ) : null}
            <ol
              className={`surface-route-stop-list ${filtering ? "is-filtered" : ""}`}
              style={{ "--surface-route-color": railColor } as CSSProperties}
              hidden={listedStops.length === 0}
            >
              {listedStops.map(({ code, at, match }, position) => {
                const name = shownName(code);
                const nearest = code === nearestStopCode && at === branch.stops.indexOf(code);
                const skippedBefore = position > 0 && listedStops[position - 1].at !== at - 1;
                const terminal = at === 0 ? "first" : at === branch.stops.length - 1 ? "last" : undefined;
                const named = stopNotice(code);
                const namedLabel = named
                  ? `${named.upcoming ? "Upcoming " : ""}${surfaceNoticeCategoryLabel(named.notice.category)}`
                  : null;
                return (
                  <li
                    key={`${code}:${at}`}
                    data-nearest={nearest ? "true" : undefined}
                    data-skipped-before={skippedBefore ? "true" : undefined}
                    data-terminal={terminal}
                  >
                    <button
                      type="button"
                      data-surface-route-stop={code}
                      aria-label={`Stop ${code}, ${name}${nearest ? ", nearest to you" : ""}${namedLabel ? `, named in ${namedLabel.toLowerCase()} notice` : ""}: departures`}
                      data-stop-notice={named ? named.notice.id : undefined}
                      onClick={() => onOpenStop(code, place())}
                    >
                      <span className="surface-route-stop-dot" aria-hidden="true" />
                      <span className="surface-route-stop-name">
                        <MarkedText text={name} ranges={match?.name ?? []} />
                        {nearest ? <small>Nearest</small> : null}
                        {named && namedLabel ? (
                          <span className={`surface-route-stop-notice${named.upcoming ? " is-upcoming" : ""}`} aria-hidden="true">
                            <SurfaceCategoryIcon category={named.notice.category} size={12} />
                            {namedLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className={stopBadgeClass} aria-hidden="true"><MarkedText text={code} ranges={match?.code ?? []} /></span>
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

/**
 * The notice that names a stop on this route, by pole number or (TTC Live
 * Alerts repeat the name as the id) by name; in-effect notices before
 * upcoming ones, as routeNotices is ordered.
 */
function noticeNamingStop(notices: readonly SurfaceNoticeDetail[], code: string, name: string | null, now: number) {
  const lowerName = name?.trim().toLowerCase();
  const notice = notices.find((candidate) => candidate.stopIds.some((id) => id === code || (lowerName && id.trim().toLowerCase() === lowerName)));
  return notice ? { notice, upcoming: surfaceNoticeTiming(notice, now) === "upcoming" } : null;
}

/** The way back from a stop opened in a route panel: a stop panel's first row. */
export type SurfaceRouteBack = { route: string; name: string; onBack: () => void };

export function SurfaceRouteBackLink({ back }: { back: SurfaceRouteBack }) {
  return (
    <button
      type="button"
      className="impact-card-map-btn surface-stop-station-link surface-route-back-link"
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
      className="impact-card-map-btn surface-stop-station-link surface-route-back-link surface-notice-back-link"
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
      className="impact-card-map-btn surface-stop-station-link surface-route-back-link"
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
