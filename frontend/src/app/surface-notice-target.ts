/**
 * What a surface notice's View shows on the Map View (plan 15, L4): the stops
 * the notice names, else all of its routes the map draws, else nothing, with
 * why when its routes explain it.
 * Positions come from the search index (plan 14, U1). The result selects and
 * frames only; it says nothing about service.
 *
 * Notice stop ids (checked against live data, 2026-11-04):
 * - TTC GTFS-RT notices carry pole numbers. In the feed's schedule the 42
 *   stops whose stop_id differs from their stop_code use ids (43271 up) no
 *   stop_code uses, so a number never names the wrong pole. One that is not
 *   in the index falls through to its paired name.
 * - TTC Live Alerts notices repeat the stop name as the id, and a name can
 *   cover both sides of an intersection, so a name is matched only among
 *   poles on the notice's route.
 * - GO/UP rail notices carry station codes ("SR") and line codes ("MI"), which
 *   are not bus stops or routes, so only GO Bus notices resolve on GO/UP.
 */

import type { NetworkId } from "./regional-data.ts";
import type { SurfaceNoticeDetail } from "./surface-notice-data.ts";
import { surfaceRouteSelection, type SurfaceSelectionRoute } from "./surface-map-selection.ts";
import { noticeRouteBase } from "./surface-route-stops.ts";
import type { PreparedSurfaceIndex, SurfaceSearchStop } from "./surface-search.ts";

export type SurfaceNoticeMapTarget =
  | { kind: "stops"; stopCodes: string[] }
  | { kind: "routes"; routes: SurfaceSelectionRoute[] }
  | { kind: "none"; reason?: SurfaceNoticeNoMapReason };

/**
 * Why a notice's routes give the map nothing to show:
 * - `not-scheduled`: none of them is in the published schedule the map is
 *   drawn from (TTC drops a suspended seasonal route, such as 203 High Park,
 *   from its periods off).
 * - `not-drawn`: a route is in that schedule, but the map draws none of its
 *   trips (503 Kingston Rd while it runs only as buses).
 */
export type SurfaceNoticeNoMapReason = "not-scheduled" | "not-drawn";

const NONE: SurfaceNoticeMapTarget = { kind: "none" };
const GO_STOP_CODE_LENGTH = 5;

const stopsByNameCache = new WeakMap<PreparedSurfaceIndex, Map<string, SurfaceSearchStop[]>>();

function stopsByName(index: PreparedSurfaceIndex): Map<string, SurfaceSearchStop[]> {
  let byName = stopsByNameCache.get(index);
  if (!byName) {
    byName = new Map();
    for (const stop of index.stops) {
      const key = stop.name.trim().toLowerCase();
      const list = byName.get(key);
      if (list) list.push(stop);
      else byName.set(key, [stop]);
    }
    stopsByNameCache.set(index, byName);
  }
  return byName;
}

function stopByNumber(index: PreparedSurfaceIndex, id: string): SurfaceSearchStop | null {
  const position = index.stopByCode.get(id)
    ?? (index.network === "regional" && /^\d+$/.test(id)
      ? index.stopByCode.get(id.padStart(GO_STOP_CODE_LENGTH, "0"))
      : undefined);
  return position === undefined ? null : index.stops[position];
}

function stopsNamed(index: PreparedSurfaceIndex, name: string, routes: ReadonlySet<string>): SurfaceSearchStop[] {
  const named = stopsByName(index).get(name.trim().toLowerCase()) ?? [];
  if (routes.size === 0) return named.length === 1 ? named : [];
  return named.filter((stop) => stop.routes.some((route) => routes.has(route)));
}

/**
 * The disabled View's label, and why it has nothing to show (its tooltip and
 * accessible name). Both reasons read Not on Map, which says what the button
 * cannot do; the tooltip says why.
 */
export function surfaceNoticeNoMapCopy(target: SurfaceNoticeMapTarget, network: NetworkId): { label: string; reason?: string } {
  const reason = target.kind === "none" ? target.reason : undefined;
  const schedule = network === "regional" ? "the current GO schedule" : "TTC's current schedule";
  if (reason === "not-scheduled") return { label: "Not on Map", reason: `not in ${schedule}, so there is no route to show` };
  if (reason === "not-drawn") return { label: "Not on Map", reason: `in ${schedule}, but none of its trips are drawn on the map this period` };
  return { label: "No Map Location" };
}

/** A notice belongs to the network that publishes it; GO/UP rail notices have no surface stops or routes. */
export function noticeHasSurfaceTarget(notice: SurfaceNoticeDetail, network: NetworkId): boolean {
  if (network === "regional") return notice.routeType === "GO Bus";
  return notice.routeType !== "GO Bus" && notice.routeType !== "GO / UP";
}

export function surfaceNoticeMapTarget(
  notice: SurfaceNoticeDetail,
  network: NetworkId,
  index: PreparedSurfaceIndex,
): SurfaceNoticeMapTarget {
  if (index.network !== network || !noticeHasSurfaceTarget(notice, network)) return NONE;
  const routes = new Set(notice.routeIds.map(noticeRouteBase));

  const paired = notice.stops ?? [];
  const entries = [
    ...paired,
    ...notice.stopIds
      .filter((stopId) => !paired.some((stop) => stop.stopId === stopId))
      .map((stopId) => ({ stopId, stopName: "" })),
  ];
  const stopCodes = new Set<string>();
  for (const { stopId, stopName } of entries) {
    const numbered = stopByNumber(index, stopId.trim());
    if (numbered) {
      stopCodes.add(numbered.code);
      continue;
    }
    for (const stop of stopsNamed(index, stopName || stopId, routes)) stopCodes.add(stop.code);
  }
  if (stopCodes.size > 0) return { kind: "stops", stopCodes: [...stopCodes] };

  const drawn: SurfaceSelectionRoute[] = [];
  let scheduled = false;
  for (const base of routes) {
    const route = index.routes.find((candidate) => candidate.route === base);
    if (route) scheduled = true;
    const selection = route ? surfaceRouteSelection(route) : null;
    if (selection) drawn.push(selection);
  }
  if (drawn.length > 0) return { kind: "routes", routes: drawn };
  if (routes.size === 0) return NONE;
  return { kind: "none", reason: scheduled ? "not-drawn" : "not-scheduled" };
}
