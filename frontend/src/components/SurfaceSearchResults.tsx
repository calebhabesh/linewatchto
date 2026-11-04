"use client";

import type { KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";
import type { NetworkId } from "../app/dashboard-contract";
import type { SurfaceSearchRoute, SurfaceSearchStop, SurfaceStopGroup } from "../app/surface-search";
import { ttcRouteBadgeColors, ttcRouteFamily } from "../app/ttc-route-badge";

/**
 * Stop and route rows in search (plan 14, U3). Wayfinding only: a row names
 * the published schedule's stops and routes and never says whether they have
 * service now; departures open with their live or scheduled label.
 */

export type ResultKeyboard = () => {
  ref: (element: HTMLButtonElement | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

/** A route's badge colours; `edge` is the night badge's border width (thinner on small badges). */
export function surfaceRouteBadgeStyle(route: Pick<SurfaceSearchRoute, "network" | "route" | "color" | "textColor">, edge = 2.5) {
  if (route.network !== "ttc") return { backgroundColor: route.color, color: route.textColor };
  const colors = ttcRouteBadgeColors(route.route);
  return colors.edge
    ? { backgroundColor: colors.fill, color: colors.text, border: `${edge}px solid ${colors.edge}` }
    : { backgroundColor: colors.fill, color: colors.text };
}

export function surfaceRouteKindLabel(route: Pick<SurfaceSearchRoute, "kind" | "route">): string {
  switch (route.kind) {
    case "streetcar": return "Streetcar";
    case "night-streetcar": return "Night Streetcar";
    case "night-bus": return "Night Bus";
    case "express": return "Express Bus";
    case "go-bus": return "GO Bus";
    default: return ttcRouteFamily(route.route) === "community" ? "Community Bus" : "Bus";
  }
}

const MAX_STOP_ROUTE_BADGES = 6;

function RouteBadges({ stop, routes, routeLookup }: {
  stop: Pick<SurfaceSearchStop, "network">;
  routes: string[];
  routeLookup: (network: NetworkId, route: string) => SurfaceSearchRoute | null;
}) {
  const shown = routes.slice(0, MAX_STOP_ROUTE_BADGES);
  return (
    <span className="surface-search-route-badges" aria-label={`Routes ${routes.join(", ")}`}>
      {shown.map((route) => {
        const known = routeLookup(stop.network, route);
        return (
          <span
            key={route}
            className="surface-search-route-badge"
            style={surfaceRouteBadgeStyle(known ?? { network: stop.network, route, color: "#00853E", textColor: "#FFFFFF" }, 1.5)}
            aria-hidden="true"
          >
            {route}
          </span>
        );
      })}
      {routes.length > shown.length ? <span className="surface-search-route-more" aria-hidden="true">+{routes.length - shown.length}</span> : null}
    </span>
  );
}

function StopCode({ stop }: { stop: Pick<SurfaceSearchStop, "code" | "network"> }) {
  return <span className={`surface-search-stop-code is-${stop.network}`} aria-hidden="true">{stop.code}</span>;
}

function stopLabel(stop: SurfaceSearchStop) {
  return `Stop ${stop.code}, ${stop.name}, routes ${stop.routes.join(", ")}`;
}

/**
 * One place: a single pole opens its departures; an intersection's poles
 * (either side, either street) expand under it, each with its number.
 */
export function SurfaceStopGroupResult({
  group,
  expanded,
  onToggle,
  onOpenStop,
  keyboard,
  routeLookup,
}: {
  group: SurfaceStopGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenStop: (stop: SurfaceSearchStop) => void;
  keyboard: ResultKeyboard;
  routeLookup: (network: NetworkId, route: string) => SurfaceSearchRoute | null;
}) {
  const [single] = group.stops;
  if (group.stops.length === 1) {
    const { ref, onKeyDown } = keyboard();
    return (
      <button
        ref={ref}
        type="button"
        className="global-search-resource-result surface-search-stop-result"
        data-surface-stop-result={single.code}
        data-surface-stop-network={single.network}
        aria-label={`${stopLabel(single)}. Departures`}
        onClick={() => onOpenStop(single)}
        onKeyDown={onKeyDown}
      >
        <StopCode stop={single} />
        <span>
          <strong>{single.name}</strong>
          <RouteBadges stop={single} routes={single.routes} routeLookup={routeLookup} />
        </span>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    );
  }

  const { ref, onKeyDown } = keyboard();
  const panelId = `surface-search-poles-${group.key.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <div className="surface-search-stop-group">
      <button
        ref={ref}
        type="button"
        className="global-search-resource-result surface-search-stop-result"
        data-surface-stop-group={group.key}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`${group.label}, ${group.stops.length} stops, routes ${group.routes.join(", ")}`}
        onClick={onToggle}
        onKeyDown={onKeyDown}
      >
        <span className={`surface-search-stop-count is-${group.network}`} aria-hidden="true">
          <MapPin size={13} />
          {group.stops.length}
        </span>
        <span>
          <strong>{group.label}</strong>
          <RouteBadges stop={single} routes={group.routes} routeLookup={routeLookup} />
        </span>
        <ChevronDown size={17} aria-hidden="true" className="surface-search-expand-icon" />
      </button>
      {expanded ? (
        <div id={panelId} className="surface-search-poles">
          {group.stops.map((stop) => {
            const pole = keyboard();
            return (
              <button
                key={stop.code}
                ref={pole.ref}
                type="button"
                className="global-search-resource-result surface-search-stop-result is-pole"
                data-surface-stop-result={stop.code}
                data-surface-stop-network={stop.network}
                aria-label={`${stopLabel(stop)}. Departures`}
                onClick={() => onOpenStop(stop)}
                onKeyDown={pole.onKeyDown}
              >
                <StopCode stop={stop} />
                <span>
                  <strong>{stop.name}</strong>
                  <RouteBadges stop={stop} routes={stop.routes} routeLookup={routeLookup} />
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function SurfaceRouteResult({
  route,
  onOpen,
  keyboard,
}: {
  route: SurfaceSearchRoute;
  onOpen: (route: SurfaceSearchRoute) => void;
  keyboard: ResultKeyboard;
}) {
  const { ref, onKeyDown } = keyboard();
  const kind = surfaceRouteKindLabel(route);
  return (
    <button
      ref={ref}
      type="button"
      className="global-search-resource-result surface-search-route-result"
      data-surface-route-result={`${route.network}:${route.route}`}
      aria-label={`${kind} route ${route.route} ${route.name}`}
      onClick={() => onOpen(route)}
      onKeyDown={onKeyDown}
    >
      <span className="global-search-resource-icon global-search-resource-icon--standard">
        <span className="surface-search-route-badge is-large" style={surfaceRouteBadgeStyle(route, 2)} aria-hidden="true">{route.route}</span>
      </span>
      <span>
        <strong>{route.name}</strong>
        <small>{kind} Route{route.drawn ? "" : " · Not on the map this schedule"}</small>
      </span>
      <ChevronRight size={17} aria-hidden="true" />
    </button>
  );
}
