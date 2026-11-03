"use client";

import { useLayoutEffect, useRef } from "react";
import { ChevronRight, X } from "lucide-react";
import { useFollowedChooserPortal } from "./MapOverlapChooser";
import type { ChooserFollowAnchor, MapChooserFollower } from "./map-chooser-follow";
import { OVERLAP_CHOOSER_MOBILE_BREAKPOINT } from "./map-chooser-layout";
import type { OverlapChooserScreenLayout } from "./map-chooser-placement";
import type { StreetcarStopFeature } from "../app/geographic-surface-catalog";
import type { BusStopFeature } from "../app/geographic-bus-catalog";
import { parseSurfaceRouteDetails } from "../app/surface-arrivals";
import { ttcRouteBadgeStyle } from "../app/ttc-route-badge";
import {
  streetcarVehicleStatusLabel,
  type StreetcarVehicle,
  type StreetcarVehicleState,
} from "../app/streetcar-positions";

/**
 * What a press on a live streetcar shows (plan 13, S4): its route and
 * destination, how old its GPS report is, whether it is off its mapped route,
 * and the departures at the nearest stop on its route (S3). The feed's own
 * stop references do not match the published schedule, so no "next stop" is claimed.
 * Live buses (S8) use the same card with `mode="bus"`; a replacement bus says
 * which streetcar route it stands in for.
 */
export function GeographicStreetcarVehicleCard({
  mode = "streetcar",
  replacement = false,
  vehicle,
  state,
  ageSeconds,
  offRoute,
  nearestStop = null,
  onOpenStop,
  selectionKey,
  layout,
  follower,
  followAnchor,
  viewportSize,
  reducedMotion,
  onClose,
}: {
  mode?: "streetcar" | "bus";
  /** A bus on a streetcar route's replacement-bus trip. */
  replacement?: boolean;
  vehicle: StreetcarVehicle;
  state: Exclude<StreetcarVehicleState, "expired">;
  ageSeconds: number;
  offRoute: boolean;
  nearestStop?: StreetcarStopFeature | BusStopFeature | null;
  onOpenStop?: (stopCode: string) => void;
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

  const details = parseSurfaceRouteDetails({
    mode: mode === "bus" && !replacement ? "bus" : "streetcar",
    route: vehicle.route,
    routeName: vehicle.routeName,
    destination: vehicle.destination,
    bayPlatform: "",
  });
  const routeName = details.displayRouteName;
  const destination = details.destinationTarget || details.cleanDestination;
  const status = streetcarVehicleStatusLabel(state, ageSeconds);
  // A stale report is not called live anywhere on the card.
  const noun = mode === "bus" ? "Bus" : "Streetcar";
  const title = state === "live" ? `Live ${noun}` : noun;

  return (
    <div
      ref={attachPortal}
      className="overlap-chooser-portal overlap-chooser-object open"
      style={portalStyle}
      data-streetcar-vehicle-card={mode === "streetcar" ? "" : undefined}
      data-bus-vehicle-card={mode === "bus" ? "" : undefined}
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
        <div className="streetcar-card-row" data-streetcar-route={vehicle.route}>
          <span
            className="streetcar-card-badge"
            style={ttcRouteBadgeStyle(vehicle.route)}
            aria-hidden="true"
          >
            {vehicle.route}
          </span>
          <span className="streetcar-card-copy">
            <strong>{routeName}</strong>
            {destination ? <span className="streetcar-card-note">{destination}</span> : null}
          </span>
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
              <strong>Nearest Stop Departures</strong>
              <span>{nearestStop.properties.name}</span>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : null}
        <p className="streetcar-card-source">Position from TTC vehicle GPS. Not a schedule.</p>
      </div>
    </div>
  );
}
