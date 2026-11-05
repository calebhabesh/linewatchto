"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cachedRouteStops, loadRouteStops, routeBranchCodes } from "../app/surface-route-stops";
import { ChevronRight, X } from "lucide-react";
import { useFollowedChooserPortal } from "./MapOverlapChooser";
import type { ChooserFollowAnchor, MapChooserFollower } from "./map-chooser-follow";
import { OVERLAP_CHOOSER_MOBILE_BREAKPOINT } from "./map-chooser-layout";
import { ttcRouteBadgeStyle } from "../app/ttc-route-badge";
import type { OverlapChooserScreenLayout } from "./map-chooser-placement";
import type { StreetcarCardRow } from "../app/geographic-surface-catalog";

/** One route on a map card: pressing it opens the route's panel. */
export function StreetcarCardRouteRow({ route, name, badgeStyle, note, branches, onOpen }: {
  route: string;
  name: string;
  badgeStyle?: CSSProperties;
  note?: string | null;
  /** The route's lettered branches, as a caption. */
  branches?: readonly string[];
  onOpen?: (route: string) => void;
}) {
  const content = (
    <>
      <span className="streetcar-card-badge" style={badgeStyle} aria-hidden="true">{route}</span>
      <span className="streetcar-card-copy">
        <strong>{name}</strong>
        {branches && branches.length > 0 ? <span className="streetcar-card-note" data-route-branches>{branches.join(" · ")}</span> : null}
        {note ? <span className="streetcar-card-note">{note}</span> : null}
      </span>
    </>
  );
  if (!onOpen) return <div className="streetcar-card-row">{content}</div>;
  return (
    <button
      type="button"
      className="streetcar-card-row streetcar-card-row--action"
      aria-label={`Open route ${route} ${name}`}
      onClick={() => onOpen(route)}
    >
      {content}
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}

/**
 * What a press on a streetcar line (plan 13, S2), a TTC bus line (S5) or a GO
 * bus line (S6) shows: the routes on that street or road and the schedule
 * period the line is drawn from. Not live service. The nearest stop on those
 * routes opens its departures (S3; GO stops in S6). Night lines (S10) read
 * "Night Routes" with the weekday night schedule; they offer no stop. Each
 * route opens its panel.
 */
export function GeographicStreetcarCard({
  mode = "streetcar",
  rows,
  nearestStop = null,
  onOpenStop,
  onOpenRoute,
  periodLabel,
  selectionKey,
  layout,
  follower,
  followAnchor,
  viewportSize,
  reducedMotion,
  onClose,
}: {
  mode?: "streetcar" | "bus" | "go-bus" | "night";
  rows: Pick<StreetcarCardRow, "route" | "name" | "color" | "textColor" | "replacementBuses">[];
  nearestStop?: { properties: { stopCode?: string; name: string } } | null;
  onOpenStop?: (stopCode: string) => void;
  /** Opens the route's panel: its stops, notices and schedule. */
  onOpenRoute?: (route: string) => void;
  periodLabel: string;
  selectionKey: string | null;
  layout: OverlapChooserScreenLayout;
  follower: MapChooserFollower;
  followAnchor: ChooserFollowAnchor;
  viewportSize: { width: number; height: number };
  reducedMotion: boolean;
  onClose: (restoreFocus: boolean) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Branch captions arrive with the route-stop file; the card is whole without them.
  const [routeStops, setRouteStops] = useState(() => cachedRouteStops(mode));
  useEffect(() => {
    if (routeStops) return;
    let active = true;
    loadRouteStops(mode).then((file) => { if (active) setRouteStops(file); }, () => undefined);
    return () => { active = false; };
  }, [mode, routeStops]);
  const size = { width: layout.width, height: layout.height };
  const { attachPortal, portalStyle } = useFollowedChooserPortal({
    follower,
    followAnchor,
    layout,
    size,
    viewportOrientation: "standard",
    viewportSize,
    reducedMotion,
  });

  // A new map selection replaces the card, as it does the alert chooser.
  const openedWith = useRef(selectionKey);
  useLayoutEffect(() => {
    if (selectionKey && selectionKey !== openedWith.current) onClose(false);
  }, [onClose, selectionKey]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const compact = viewportSize.width <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT;
    const animation = reducedMotion ? undefined : surfaceRef.current?.animate([
      { opacity: 0, transform: "scale(0.98)" },
      { opacity: 1, transform: "scale(1)" },
    ], { duration: compact ? 100 : 140, easing: "ease-out" });
    return () => {
      window.cancelAnimationFrame(frame);
      animation?.cancel();
    };
  }, [reducedMotion, viewportSize.width]);

  const noun = mode === "go-bus" ? "GO Bus" : mode === "night" ? "Night" : mode === "bus" ? "Bus" : "Streetcar";
  const title = rows.length === 1 ? `${noun} Route` : `${noun} Routes`;

  return (
    <div
      ref={attachPortal}
      className="overlap-chooser-portal overlap-chooser-object open"
      style={portalStyle}
      data-streetcar-card={mode === "streetcar" ? "" : undefined}
      data-bus-card={mode === "bus" ? "" : undefined}
      data-go-bus-card={mode === "go-bus" ? "" : undefined}
      data-night-card={mode === "night" ? "" : undefined}
    >
      <div
        ref={surfaceRef}
        className="overlap-chooser-surface streetcar-card-surface"
        style={{ maxHeight: size.height }}
        role="dialog"
        aria-label={`${title}: ${rows.map((row) => `${row.route} ${row.name}`).join(", ")}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          onClose(true);
        }}
      >
        <div className="overlap-chooser-header">
          <div className="overlap-chooser-header-title">
            <strong>{title}</strong>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="overlap-chooser-close"
            aria-label={`Close ${mode === "go-bus" ? "GO bus" : noun.toLowerCase()} routes`}
            onClick={() => onClose(true)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <ul className="streetcar-card-list">
          {rows.map((row) => (
            <li key={row.route} className="streetcar-card-item" data-streetcar-route={row.route}>
              <StreetcarCardRouteRow
                route={row.route}
                name={row.name}
                badgeStyle={mode === "bus" || mode === "night"
                  ? ttcRouteBadgeStyle(row.route)
                  : { backgroundColor: row.color, color: row.textColor }}
                note={row.replacementBuses ? "Some trips run as replacement buses." : null}
                branches={routeStops ? routeBranchCodes(routeStops.routes[row.route], row.route) : undefined}
                onOpen={onOpenRoute}
              />
            </li>
          ))}
        </ul>
        {nearestStop?.properties.stopCode && onOpenStop ? (
          <button
            type="button"
            className="streetcar-card-stop"
            onClick={() => onOpenStop(nearestStop.properties.stopCode as string)}
          >
            <span className="streetcar-card-stop-code">{nearestStop.properties.stopCode}</span>
            <span className="streetcar-card-stop-copy">
              <strong>Nearest Stop Departures</strong>
              <span>{nearestStop.properties.name}</span>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : null}
        <p className="streetcar-card-source">
          {mode === "night" ? "Weekday night schedule" : "Weekday schedule"}, {periodLabel}. Not live service.
        </p>
      </div>
    </div>
  );
}
