"use client";

import { useLayoutEffect, useRef } from "react";
import { ChevronRight, X } from "lucide-react";
import { useFollowedChooserPortal } from "./MapOverlapChooser";
import type { ChooserFollowAnchor, MapChooserFollower } from "./map-chooser-follow";
import { OVERLAP_CHOOSER_MOBILE_BREAKPOINT } from "./map-chooser-layout";
import type { OverlapChooserScreenLayout } from "./map-chooser-placement";
import type { StreetcarStopFeature } from "../app/geographic-surface-catalog";
import type { BusStopFeature } from "../app/geographic-bus-catalog";
import type { GoBusRouteSummary, GoBusStopFeature } from "../app/go-bus-catalog";
import type { GoBusVehicle } from "../app/go-bus-positions";
import { parseSurfaceRouteDetails } from "../app/surface-arrivals";
import { ttcRouteBadgeStyle } from "../app/ttc-route-badge";
import {
  streetcarVehicleStatusLabel,
  type StreetcarVehicle,
  type StreetcarVehicleState,
} from "../app/streetcar-positions";
import { StreetcarCardRouteRow } from "./GeographicStreetcarCard";

/** GO green, for a GO route the catalog does not list. */
const GO_BUS_BADGE_FALLBACK = "#00853E";

/**
 * What a press on a live streetcar shows (plan 13, S4): its route and
 * destination, how old its GPS report is, whether it is off its mapped route,
 * and the departures at the nearest stop on its route (S3). The feed's own
 * stop references do not match the published schedule, so no "next stop" is claimed.
 * Live buses (S8) use the same card with `mode="bus"`; a replacement bus says
 * which streetcar route it stands in for. Live GO buses (S9) use
 * `mode="go-bus"`: GO's route colours and name, the destination from the
 * vehicle label, and the bus's next GO stop when GO names one on its route.
 */
export function GeographicStreetcarVehicleCard({
  mode = "streetcar",
  replacement = false,
  vehicle,
  goRoute = null,
  nextStop = false,
  state,
  ageSeconds,
  offRoute,
  nearestStop = null,
  onOpenStop,
  onOpenRoute,
  selectionKey,
  layout,
  follower,
  followAnchor,
  viewportSize,
  reducedMotion,
  onClose,
}: {
  mode?: "streetcar" | "bus" | "go-bus";
  /** A bus on a streetcar route's replacement-bus trip. */
  replacement?: boolean;
  vehicle: StreetcarVehicle | GoBusVehicle;
  /** GO buses: the route from the GO bus catalog (name and colours), when it is listed. */
  goRoute?: GoBusRouteSummary | null;
  /** GO buses: the stop offered is the bus's next stop, not just the nearest. */
  nextStop?: boolean;
  state: Exclude<StreetcarVehicleState, "expired">;
  ageSeconds: number;
  offRoute: boolean;
  nearestStop?: StreetcarStopFeature | BusStopFeature | GoBusStopFeature | null;
  onOpenStop?: (stopCode: string) => void;
  /** Opens the route's panel: its stops, notices and schedule. */
  onOpenRoute?: (route: string) => void;
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

  const go = mode === "go-bus";
  let routeName: string;
  let destination: string;
  if ("routeName" in vehicle) {
    const details = parseSurfaceRouteDetails({
      mode: mode === "bus" && !replacement ? "bus" : "streetcar",
      route: vehicle.route,
      routeName: vehicle.routeName,
      destination: vehicle.destination,
      bayPlatform: "",
    });
    routeName = details.displayRouteName;
    destination = details.destinationTarget || details.cleanDestination;
  } else {
    routeName = goRoute?.name ?? `Route ${vehicle.route}`;
    destination = vehicle.destination ?? "";
  }
  const badgeStyle = go
    ? { backgroundColor: goRoute?.color ?? GO_BUS_BADGE_FALLBACK, color: goRoute?.textColor ?? "#ffffff" }
    : ttcRouteBadgeStyle(vehicle.route);
  const status = streetcarVehicleStatusLabel(state, ageSeconds);
  // A stale report is not called live anywhere on the card.
  const noun = go ? "GO Bus" : mode === "bus" ? "Bus" : "Streetcar";
  const title = state === "live" ? `Live ${noun}` : noun;

  return (
    <div
      ref={attachPortal}
      className="overlap-chooser-portal overlap-chooser-object open"
      style={portalStyle}
      data-streetcar-vehicle-card={mode === "streetcar" ? "" : undefined}
      data-bus-vehicle-card={mode === "bus" ? "" : undefined}
      data-go-bus-vehicle-card={go ? "" : undefined}
    >
      <div
        ref={surfaceRef}
        className="overlap-chooser-surface streetcar-card-surface"
        style={{ maxHeight: size.height }}
        role="dialog"
        aria-label={`${title}: ${vehicle.route} ${routeName}${destination ? `, ${destination}` : ""}`}
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
            aria-label={`Close ${noun.toLowerCase()}`}
            onClick={() => onClose(true)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="streetcar-card-item" data-streetcar-route={vehicle.route}>
          <StreetcarCardRouteRow
            route={vehicle.route}
            name={routeName}
            badgeStyle={badgeStyle}
            note={destination}
            onOpen={onOpenRoute}
          />
        </div>
        <p className="streetcar-vehicle-status" data-state={state}>
          <span className="streetcar-vehicle-status-dot" aria-hidden="true" />
          <span>{status}</span>
        </p>
        {replacement ? (
          <p className="streetcar-vehicle-note">Replacement bus for the {vehicle.route} streetcar.</p>
        ) : null}
        {offRoute ? (
          <p className="streetcar-vehicle-note">Off its mapped route; shown where it reports.</p>
        ) : null}
        {vehicle.vehicleId ? <p className="streetcar-vehicle-id">Vehicle {vehicle.vehicleId}</p> : null}
        {nearestStop?.properties.stopCode && onOpenStop ? (
          <button
            type="button"
            className="streetcar-card-stop"
            onClick={() => onOpenStop(nearestStop.properties.stopCode as string)}
          >
            <span className="streetcar-card-stop-code">{nearestStop.properties.stopCode}</span>
            <span className="streetcar-card-stop-copy">
              <strong>{nextStop ? "Next Stop Departures" : "Nearest Stop Departures"}</strong>
              <span>{nearestStop.properties.name}</span>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : null}
        <p className="streetcar-card-source">
          {go
            ? "Position from Metrolinx GO bus GPS. Not a schedule."
            : "Position from TTC vehicle GPS. Not a schedule."}
        </p>
      </div>
    </div>
  );
}
