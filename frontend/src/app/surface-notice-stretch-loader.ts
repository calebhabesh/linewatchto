/**
 * Loads what a notice's stretch needs (the stop index, the route's timetable
 * patterns and its drawn streets) and returns its stretches, one per named
 * route that has one. Empty when the notice names no run of stops, a file
 * fails, or nothing can be traced: the View then shows the stops alone.
 */

import { isStreetcarCorridorFeature, loadStreetcarCatalog } from "./geographic-surface-catalog.ts";
import { loadBusCatalog } from "./geographic-bus-catalog.ts";
import { loadNightCatalog } from "./night-route-catalog.ts";
import type { NetworkId } from "./regional-data.ts";
import { surfaceRouteLayer, type SurfaceSelectionLayer, type SurfaceSelectionStretch } from "./surface-map-selection.ts";
import type { SurfaceNoticeDetail } from "./surface-notice-data.ts";
import { noticeStopRange, stretchPath, stretchStopCodes, type Coordinate } from "./surface-notice-stretch.ts";
import { noticeStopPoles } from "./surface-notice-target.ts";
import { loadRouteStops, noticeRouteBase } from "./surface-route-stops.ts";
import { loadSurfaceSearchIndex } from "./surface-search-index.ts";

type Corridor = { geometry: { coordinates: Coordinate[] }; properties: { routes: readonly string[] } };

async function corridorsFor(layer: SurfaceSelectionLayer): Promise<readonly Corridor[]> {
  if (layer === "streetcar") return (await loadStreetcarCatalog()).features.filter(isStreetcarCorridorFeature) as unknown as Corridor[];
  if (layer === "bus") return (await loadBusCatalog()).features as unknown as Corridor[];
  if (layer === "night") return (await loadNightCatalog()).features as unknown as Corridor[];
  return [];
}

export async function loadNoticeStretches(notice: SurfaceNoticeDetail, network: NetworkId): Promise<SurfaceSelectionStretch[]> {
  const range = noticeStopRange(notice, network);
  if (!range) return [];
  try {
    const index = await loadSurfaceSearchIndex(network);
    const routes = new Set(notice.routeIds.map(noticeRouteBase));
    const from = noticeStopPoles(index, range.from, routes).map((stop) => stop.code);
    const to = noticeStopPoles(index, range.to, routes).map((stop) => stop.code);
    if (from.length === 0 || to.length === 0) return [];
    const positionOf = (code: string): Coordinate | null => {
      const at = index.stopByCode.get(code);
      return at === undefined ? null : [index.stops[at].lon, index.stops[at].lat];
    };
    const stretches: SurfaceSelectionStretch[] = [];
    for (const base of routes) {
      const route = index.routes.find((candidate) => candidate.route === base);
      if (!route?.drawn) continue;
      const layer = surfaceRouteLayer(route.kind);
      if (layer === "go-bus") continue;
      const [patterns, corridors] = await Promise.all([loadRouteStops(layer), corridorsFor(layer)]);
      const codes = stretchStopCodes(patterns.routes[base], { from, to }, positionOf);
      const points = codes?.map(positionOf);
      if (!points || points.some((point) => point === null)) continue;
      // The pattern's ends can be the poles across the street; the band reaches the poles the notice names.
      const named = (poles: readonly string[], fallback: Coordinate | null) => (poles.length === 1 ? positionOf(poles[0]) ?? fallback : fallback);
      points[0] = named(from, points[0]);
      points[points.length - 1] = named(to, points[points.length - 1]);
      const path = stretchPath(corridors, base, points as Coordinate[]);
      if (path) stretches.push({ route: base, path });
    }
    return stretches;
  } catch {
    return [];
  }
}
