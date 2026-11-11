/*
 * How every System Map composes what it draws along its lines: each line
 * alert's corridors and the previewed commute's route, from the network's
 * segments with the paths the map draws them along (each content adapter
 * resolves those over its own prepared geometry). The rules are the shared
 * ones in map-content-rules.ts; nothing here reads the DOM.
 */
import type {
  ActiveAlert,
  ImpactSelection,
  MapImpact,
  MapImpactKind,
  NetworkSegment,
  PlannedClosure,
  StationNodeImpact,
  TravelDirection,
} from "./linewatch-data.ts";
import type { AccountCommutePathPreview } from "./commute-data.ts";
import { composeNetworkSegmentPath, pathPolylinePoints, pointsToPath, type MapPoint } from "./map-geometry.ts";
import {
  commuteEndpointSizes,
  currentSegmentImpacts,
  lineAlertLabel,
  lineAlertVisualState,
  lineWideAlertLabel,
  mapPlannedPreviews,
  plannedPreviewLabel,
  type MapImpactContext,
  type StationDot,
} from "./map-content-rules.ts";
import {
  isSelectedLineAlert,
  lineAlertPaintOrder,
  type MapLineAlert,
} from "../components/map-overlays/line-alert-model.ts";
import type { MapCommuteEndpoint, MapCommutePreview } from "../components/map-overlays/commute-preview-model.ts";
import type { MapStationPill } from "../components/map-overlays/station-alert-model.ts";

/** One drawn stretch of an alert: the segments that meet at its stations, as one path. */
export type MapCorridor<S extends NetworkSegment> = {
  /** In the order the path passes them. */
  segments: S[];
  /** One subpath per trail through the stretch (a branch starts a new one). */
  pathD: string;
  /** The alert's travel direction along every subpath of `pathD`. */
  travelDirection: TravelDirection;
};

/**
 * An alert's segments as drawn stretches: segments that meet at a station
 * join into one corridor, each a single path where the stretch is linear. A
 * branching stretch is one corridor of trails: each runs on through a branch
 * point and the branch starts its own subpath, so chevrons head the alert's
 * way along every one. Trails start at line ends and branch points, in
 * `segments`' order. `segments` carry the paths the map draws (`pathD`, with
 * `guidePathReversed` when that path runs from station B to A); one with no
 * path is left out.
 */
export function mapCorridors<S extends NetworkSegment>(
  segments: S[],
  travelDirection: TravelDirection,
): MapCorridor<S>[] {
  const drawn = segments.filter((segment) => segment.pathD);
  const ends = (segment: S) => [segment.stationAId ?? `${segment.id}:a`, segment.stationBId ?? `${segment.id}:b`];
  const atStation = new Map<string, S[]>();
  for (const segment of drawn) {
    for (const stationId of new Set(ends(segment))) {
      atStation.set(stationId, [...(atStation.get(stationId) ?? []), segment]);
    }
  }
  const visited = new Set<S>();
  const unvisitedAt = (stationId: string) => atStation.get(stationId)?.find((segment) => !visited.has(segment));
  const walk = (first: S, from: string): S[] => {
    const trail: S[] = [];
    let next: S | undefined = first;
    let station = from;
    while (next) {
      trail.push(next);
      visited.add(next);
      const [a, b] = ends(next);
      station = a === station ? b : a;
      next = unvisitedAt(station);
    }
    return trail;
  };

  const trails: S[][] = [];
  // From line ends and branch points (odd degree) first, then closed loops.
  const isTrailEnd = (stationId: string) => (atStation.get(stationId)?.length ?? 0) % 2 === 1;
  for (const segment of drawn) {
    if (visited.has(segment)) continue;
    const start = ends(segment).find(isTrailEnd);
    if (start) trails.push(walk(segment, start));
  }
  for (const segment of drawn) {
    if (!visited.has(segment)) trails.push(walk(segment, ends(segment)[0]));
  }

  // Trails that share a station are one corridor.
  const corridors: { segments: S[]; paths: string[]; stations: Set<string> }[] = [];
  for (const trail of trails) {
    const stations = new Set(trail.flatMap(ends));
    const composed = composeNetworkSegmentPath(trail, travelDirection);
    if (!composed.pathD) continue;
    // Keep the alert's direction on every subpath: a trail drawn against it runs backwards.
    const pathD = composed.travelDirection === travelDirection
      ? composed.pathD
      : pointsToPath([...pathPolylinePoints(composed.pathD)].reverse());
    const joined = corridors.filter((corridor) => [...stations].some((stationId) => corridor.stations.has(stationId)));
    const into = joined[0] ?? { segments: [], paths: [], stations: new Set<string>() };
    if (!joined[0]) corridors.push(into);
    for (const other of joined.slice(1)) {
      into.segments.push(...other.segments);
      into.paths.push(...other.paths);
      other.stations.forEach((stationId) => into.stations.add(stationId));
      corridors.splice(corridors.indexOf(other), 1);
    }
    into.segments.push(...trail);
    into.paths.push(pathD);
    stations.forEach((stationId) => into.stations.add(stationId));
  }
  return corridors.map(({ segments: stretch, paths }) => ({ segments: stretch, pathD: paths.join(" "), travelDirection }));
}

type LineAlertGroup<S extends NetworkSegment> = {
  kind: MapImpactKind;
  impactId: string;
  lineId: string;
  travelDirection: TravelDirection;
  segments: S[];
  preview?: { closure?: PlannedClosure };
  lineWide?: Pick<ActiveAlert, "lineNumber" | "title">;
};

/**
 * Every line alert a map draws, and the selected ones: current service along
 * its segments, line-wide alerts (no listed segments, not a station's own)
 * along the line's whole route, and planned previews (map-content-rules.ts),
 * each per line as its corridors. Paints by the shared priority.
 */
export function mapLineAlerts<S extends NetworkSegment>(
  context: MapImpactContext<S>,
  data: {
    activeAlerts: ActiveAlert[];
    stationNodeImpacts: Pick<StationNodeImpact, "cardId">[];
    selection: ImpactSelection;
  },
): { lineAlerts: MapLineAlert[]; selectedLineAlerts: MapLineAlert[] } {
  const groups = new Map<string, LineAlertGroup<S>>();
  const add = (key: string, group: Omit<LineAlertGroup<S>, "segments">, segment: S) => {
    const existing = groups.get(key);
    if (existing) existing.segments.push(segment);
    else groups.set(key, { ...group, segments: [segment] });
  };

  for (const segment of context.segments) {
    for (const impact of currentSegmentImpacts(segment, context)) {
      add(currentKey(segment.lineId, impact), {
        kind: impact.kind,
        impactId: impact.cardId,
        lineId: segment.lineId,
        travelDirection: impact.travelDirection,
      }, segment);
    }
  }

  const stationOnlyIds = new Set(data.stationNodeImpacts.map((impact) => impact.cardId));
  for (const alert of data.activeAlerts) {
    if (alert.affectedSegmentIds.length > 0 || stationOnlyIds.has(alert.id)) continue;
    const kind: MapImpactKind = alert.severity === "planned" ? "planned-closure" : alert.severity;
    for (const segment of context.segments) {
      if (segment.lineId !== alert.lineId) continue;
      add(`line-wide:${kind}:${alert.id}:${alert.lineId}`, {
        kind,
        impactId: alert.id,
        lineId: alert.lineId,
        travelDirection: "bidirectional",
        lineWide: alert,
      }, segment);
    }
  }

  for (const preview of mapPlannedPreviews(context, data.selection)) {
    for (const segment of preview.segments) {
      add(`preview:${preview.id}:${segment.lineId}`, {
        kind: "planned-closure",
        impactId: preview.id,
        lineId: segment.lineId,
        travelDirection: preview.travelDirection,
        preview: { closure: preview.closure },
      }, segment);
    }
  }

  const alerts = [...groups.values()].flatMap((group) => (
    mapCorridors(group.segments, group.travelDirection).map((corridor): MapLineAlert => {
      const segmentIds = corridor.segments.map((segment) => segment.id);
      return {
        key: `${group.kind}:${group.impactId}:${group.travelDirection}:${[...segmentIds].sort().join(",")}`,
        kind: group.kind,
        impactId: group.impactId,
        lineId: group.lineId,
        pathD: corridor.pathD,
        travelDirection: corridor.travelDirection,
        visualState: lineAlertVisualState(group.kind, Boolean(group.preview)),
        label: group.preview
          ? plannedPreviewLabel(group.preview.closure, corridor.segments)
          : group.lineWide
            ? lineWideAlertLabel(group.kind, group.lineWide)
            : lineAlertLabel(group.kind, corridor.segments),
        segmentIds,
      };
    })
  ));
  const lineAlerts = lineAlertPaintOrder(alerts.sort((left, right) => (
    left.impactId.localeCompare(right.impactId) || left.key.localeCompare(right.key)
  )));
  return {
    lineAlerts,
    selectedLineAlerts: lineAlerts.filter((alert) => isSelectedLineAlert(alert, data.selection)),
  };
}

function currentKey(lineId: string, impact: MapImpact) {
  return `current:${lineId}:${impact.kind}:${impact.cardId}:${impact.travelDirection}`;
}

/** A station dot a commute endpoint can sit on. */
export type MapCommuteEndpointDot = {
  id: string;
  center: MapPoint;
  dot: StationDot;
  /** A pill-shaped station (GO/UP's Union): the endpoint takes its shape. */
  pill?: MapStationPill;
};

/**
 * The previewed commute: its segments in the route's order as one path, and
 * at each end the dot the route uses there (else every dot of the station),
 * sized from that dot (`commuteEndpointSizes`). `endpointDots` is the map's:
 * a station's dots, or the one with this anchor id when it draws it. The
 * endpoints flash even when the route has no drawable path.
 */
export function mapCommutePreview<S extends NetworkSegment>(
  preview: AccountCommutePathPreview | null | undefined,
  segments: S[],
  endpointDots: (stationId: string, routeAnchorId: string | undefined) => MapCommuteEndpointDot[],
): MapCommutePreview | null {
  if (!preview || preview.stationIds.length === 0) return null;
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const route = preview.segmentIds.flatMap((segmentId) => {
    const segment = segmentById.get(segmentId);
    return segment?.pathD ? [segment] : [];
  });
  const pathD = route.length > 0 ? composeNetworkSegmentPath(route, "bidirectional").pathD : "";

  const ends = [
    { stationId: preview.stationIds[0], role: "origin" as const, segment: route[0] },
    { stationId: preview.stationIds.at(-1), role: "destination" as const, segment: route.at(-1) },
  ];
  const endpoints = ends.flatMap(({ stationId, role, segment }): MapCommuteEndpoint[] => {
    if (!stationId) return [];
    const routeAnchorId = segment?.stationAId === stationId
      ? segment.stationAAnchorId
      : segment?.stationBId === stationId ? segment.stationBAnchorId : undefined;
    return endpointDots(stationId, routeAnchorId).map((dot) => {
      const { dotRadius, flashRadius } = commuteEndpointSizes(dot.dot);
      return {
        key: `${role}:${stationId}:${dot.id}`,
        stationId,
        role,
        center: dot.center,
        dotRadius,
        flashRadius,
        ...(dot.pill ? { pill: dot.pill } : {}),
      };
    });
  });
  return {
    id: preview.id,
    label: preview.routeLabel,
    pathD,
    endpoints,
    endpointStyle: preview.returnView === "alert-history" ? "static" : "beacon",
  };
}
