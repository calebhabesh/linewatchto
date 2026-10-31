/*
 * TTC's content adapter: what the TTC System Map draws over its artwork
 * (`MapContent`, app/map-content.ts), from dashboard data. Corridors are
 * composed from the network's segments along the authored guide paths, and
 * station alerts take their size from TTC's station dots.
 */
import type {
  ActiveAlert,
  DelayAlert,
  ImpactSelection,
  MapImpact,
  MapImpactKind,
  NetworkSegment,
  PlannedClosure,
  ReducedSpeedZone,
  Station,
  StationNodeImpact,
} from "./linewatch-data.ts";
import type { StationSummary } from "./station-data.ts";
import type { AccountCommutePathPreview } from "./commute-data.ts";
import type { PreparedMapGeometry } from "./map-geometry-data.ts";
import {
  composeNetworkSegmentPath,
  pathMidpointFrame,
  resolveNetworkSegmentPath,
  visualTravelDirection,
  type MapPoint,
} from "./map-geometry.ts";
import { ttcAnchorPoints, ttcGuidePaths, ttcStationCenters } from "./ttc-map-geometry.ts";
import { getImpactPriority, plannedAdvisoryStationImpacts } from "./map-alert-selector.ts";
import type { MapContent, MapOverlapBadgeInput } from "./map-content.ts";
import { estimatedTrainMarkerLanePoint, type EstimatedTrainMarker } from "./train-markers.ts";
import type { MapTrainMarkerPlacement } from "../components/map-overlays/TrainMarkerLayer.tsx";
import type { MapLineAlert, MapOverlayVisualState } from "../components/map-overlays/line-alert-model.ts";
import {
  interchangeLineImpacts,
  stationDirectionGlyphs,
  type MapStationAlert,
} from "../components/map-overlays/station-alert-model.ts";
import type { MapCommutePreview } from "../components/map-overlays/commute-preview-model.ts";
import { overlapBadgeTargetsAlong, type MapBadgeArtwork } from "../components/map-overlays/overlap-badge-layout.ts";
import { CONNECTOR_STATION_CLEARANCE } from "../components/map-overlays/overlay-obstacles.ts";
import type { ConnectorCrossing, ConnectorKeepOut } from "../components/overlap-badge-connector.ts";
import {
  TRANSIT_LINE_HALF_WIDTH,
  collectBaseRouteObstacles,
  ttcArtworkObstacles,
} from "../components/ttc-map-obstacles.ts";
import {
  activeImpactsForSegment,
  buildStationOverlapBadgeGroups,
  coveredSegmentOverlapBadgeSignatures,
  hasOverlappingImpacts,
  mapOverlapIndicatorSizeForKindCount,
  overlapBadgeKindCounts,
  overlapBadgeSignature,
  overlapBadgeVisualItemCount,
} from "../components/map-overlap-badges.ts";
import { stationImpactDirectionForImpact } from "../components/station-impact-direction.ts";
import {
  stationImpactVisualAnchors,
  stationVisualAnchorIds,
  stationVisualAnchorsFor,
  stationVisualCenterIds,
} from "../components/station-map-visuals.ts";
import {
  buildActiveClosureImpactCardIds,
  normalizeActiveClosureMapImpact,
} from "../components/map-impact-normalization.ts";
import { stationImpactBeaconSize, type StationBeaconNeighbour } from "../components/station-impact-beacon.ts";

export type TtcMapContentInput = {
  networkSegments: NetworkSegment[];
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  /** Current station alerts; planned advisories are added here. */
  stationNodeImpacts: StationNodeImpact[];
  /** The network's stations, which segment paths and route obstacles are placed by. */
  mapStations: Station[];
  /** The stations the map shows. */
  stations: StationSummary[];
  selection: ImpactSelection;
  commutePathPreview?: AccountCommutePathPreview | null;
};

type RenderedNetworkSegment = NetworkSegment & {
  patternOriginX?: number;
  patternOriginY?: number;
  patternAngle?: number;
  sourceSegmentIds?: string[];
};

type RenderedImpactLayer = { segment: RenderedNetworkSegment; impact: MapImpact };
type RenderedPlannedPreviewLayer = { segment: RenderedNetworkSegment; closure: PlannedClosure };

type OverlapBadgeGroup = {
  signature: string;
  segments: RenderedNetworkSegment[];
  impacts: MapImpact[];
};

const LARGE_TERMINAL_IDS = new Set([
  "kipling",
  "finch",
  "vaughan-metropolitan-centre",
  "don-mills",
  "humber-college",
  "mount-dennis",
]);

function isStationVisuallyLarge(station: { id: string; interchange: boolean }): boolean {
  if (stationVisualAnchorIds(station.id).length > 1) return false;
  if (LARGE_TERMINAL_IDS.has(station.id)) return true;
  // Union is an interchange drawn with a regular-size dot.
  if (station.id === "union") return false;
  return station.interchange;
}

function stationImpactEffectRadius(isLargeStation: boolean): number {
  return isLargeStation ? 48 : 26;
}

function stationImpactDirectionBadgeRadius(isLargeStation: boolean): number {
  return isLargeStation ? 40 : 24;
}

/** A station dot's visible radius with its outline (authored r 32 or 59, stroke 8 or 15). */
function stationDotOuterRadius(isLargeStation: boolean): number {
  return isLargeStation ? 66 : 36;
}

/** Clear space a station beacon keeps from a neighbouring dot or beacon. */
const STATION_BEACON_GAP = 4;

function stationImpactRingRadius(isLargeStation: boolean): number {
  return isLargeStation ? 56 : 38;
}

/**
 * The last result of `compute`, while its arguments are the same objects:
 * polls and selections rebuild the content, and the corridors and badge
 * artwork (whose identity keeps the badge placement cached) need not follow.
 */
function lastResult<A extends unknown[], R>(compute: (...args: A) => R): (...args: A) => R {
  let last: { args: A; result: R } | null = null;
  return (...args: A) => {
    if (last && last.args.length === args.length && last.args.every((arg, index) => arg === args[index])) {
      return last.result;
    }
    const result = compute(...args);
    last = { args, result };
    return result;
  };
}

const geometryCache = new WeakMap<PreparedMapGeometry, {
  anchorPoints: Map<string, MapPoint>;
  guidePaths: Map<string, string>;
  artworkObstacles: ReturnType<typeof ttcArtworkObstacles>;
}>();

function preparedTtc(geometry: PreparedMapGeometry) {
  let prepared = geometryCache.get(geometry);
  if (!prepared) {
    prepared = {
      anchorPoints: ttcAnchorPoints(geometry),
      guidePaths: ttcGuidePaths(geometry),
      artworkObstacles: ttcArtworkObstacles(geometry),
    };
    geometryCache.set(geometry, prepared);
  }
  return prepared;
}

/** Each segment's path along the authored guides, with each alert's corridor composed from them. */
const ttcCorridors = lastResult((
  geometry: PreparedMapGeometry,
  networkSegments: NetworkSegment[],
  mapStations: Station[],
  activeAlerts: ActiveAlert[],
  delays: DelayAlert[],
  reducedSpeedZones: ReducedSpeedZone[],
  plannedClosures: PlannedClosure[],
) => {
  const { anchorPoints, guidePaths } = preparedTtc(geometry);
  const activeClosureImpactCardIds = buildActiveClosureImpactCardIds(activeAlerts, plannedClosures, delays);
  const stationById = new Map(mapStations.map((station) => [station.id, station]));
  const renderedNetworkSegments = networkSegments
    .map((segment) => {
      const stationA = segment.stationAId ? stationById.get(segment.stationAId) : undefined;
      const stationB = segment.stationBId ? stationById.get(segment.stationBId) : undefined;
      const pointA = (segment.stationAAnchorId && anchorPoints.get(segment.stationAAnchorId)) ?? (stationA ? { x: stationA.x, y: stationA.y } : undefined);
      const pointB = (segment.stationBAnchorId && anchorPoints.get(segment.stationBAnchorId)) ?? (stationB ? { x: stationB.x, y: stationB.y } : undefined);

      let angle = 0;
      let originX = 0;
      let originY = 0;
      if (pointA && pointB) {
        angle = Math.atan2(pointB.y - pointA.y, pointB.x - pointA.x) * (180 / Math.PI);
        originX = pointA.x;
        originY = pointA.y;
      } else {
        const nums = segment.pathD.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
        originX = nums[0] || 0;
        originY = nums[1] || 0;
      }

      return {
        ...segment,
        impacts: segment.impacts?.map((impact) =>
          normalizeActiveClosureMapImpact(impact, activeClosureImpactCardIds, plannedClosures)
        ),
        pathD: resolveNetworkSegmentPath(segment, mapStations, anchorPoints, guidePaths),
        patternOriginX: originX,
        patternOriginY: originY,
        patternAngle: angle,
      } as RenderedNetworkSegment;
    })
    .filter((segment): segment is RenderedNetworkSegment => Boolean(segment.pathD));

  const plannedPreviewSegmentIds = new Set(plannedClosures.flatMap((closure) => closure.previewSegmentIds));
  const renderedOverlaySegments = renderedNetworkSegments.filter((segment) => (
    Boolean(segment.impacts?.length) || segment.overlay !== "clear" || plannedPreviewSegmentIds.has(segment.id)
  ));

  const groups = new Map<string, { impact: MapImpact; segments: RenderedNetworkSegment[] }>();
  for (const segment of renderedOverlaySegments) {
    for (const impact of activeImpactsForSegment(segment)) {
      const key = impactLayerKey(impact);
      const group = groups.get(key);
      if (group) group.segments.push(segment);
      else groups.set(key, { impact, segments: [segment] });
    }
  }
  const impactLayers = Array.from(groups.values())
    .map(({ impact, segments }): RenderedImpactLayer | null => {
      const orderedSegments = orderSegmentsByIds(
        segments,
        segmentIdsForImpact(impact, activeAlerts, delays, reducedSpeedZones, plannedClosures),
      );
      const corridor = composeNetworkSegmentPath(orderedSegments, impact.travelDirection);
      if (!corridor.pathD) return null;
      return {
        impact,
        segment: compositeSegment(
          `${impact.kind}-${impact.cardId}-${impact.travelDirection}`,
          orderedSegments,
          corridor.pathD,
          corridor.travelDirection,
          corridor.segmentIds,
          labelForSegments(orderedSegments),
        ),
      };
    })
    .filter((layer): layer is RenderedImpactLayer => Boolean(layer))
    .sort((a, b) => getImpactPriority(a.impact.kind) - getImpactPriority(b.impact.kind));

  // Planned closures in effect now (or linked from a current alert) are
  // current service, not previews, and get no preview badge.
  const currentPlannedClosureIds = new Set([
    ...[...activeAlerts, ...delays]
      .map((alert) => alert.relatedPlannedClosureId)
      .filter((id): id is string => Boolean(id)),
    ...plannedClosures
      .filter((closure) => closure.activeNow || closure.timingStatus === "active-now")
      .map((closure) => closure.id),
  ]);
  const overlapPlannedClosures = plannedClosures.filter((closure) => !currentPlannedClosureIds.has(closure.id));

  return {
    renderedNetworkSegments,
    renderedOverlaySegments,
    impactLayers,
    currentPlannedClosureIds,
    overlapPlannedClosures,
    segmentOverlapGroups: groupOverlapBadgeSegments(renderedOverlaySegments, overlapPlannedClosures),
  };
});

/**
 * The artwork badges keep clear of: track strokes and base routes as
 * corridors (kept clear at the wide transit-line gap only where no alert
 * covers them), everything else as one stable layer whose rasterization is
 * reused; station names connectors never pass through.
 */
const ttcBadgeArtwork = lastResult((
  geometry: PreparedMapGeometry,
  networkSegments: NetworkSegment[],
  mapStations: Station[],
): MapBadgeArtwork => {
  const { anchorPoints, guidePaths, artworkObstacles } = preparedTtc(geometry);
  const obstacles = [
    ...artworkObstacles,
    ...collectBaseRouteObstacles(networkSegments, mapStations, anchorPoints, guidePaths),
  ];
  const lines = obstacles.filter((obstacle) => "polyline" in obstacle);
  return {
    obstacles: obstacles.filter((obstacle) => !("polyline" in obstacle)),
    transitLines: lines,
    transitLineHalfWidth: TRANSIT_LINE_HALF_WIDTH,
    connectorKeepOut: obstacles.filter((obstacle): obstacle is ConnectorKeepOut & { polygon: MapPoint[] } => "polygon" in obstacle),
    connectorCrossings: lines as ConnectorCrossing[],
  };
});

const ttcStationCenterPoints = lastResult((geometry: PreparedMapGeometry, stations: StationSummary[]) => (
  ttcStationCenters(geometry, stationVisualCenterIds(stations))
));

/** What the TTC System Map draws over its artwork. */
export function ttcMapContent(geometry: PreparedMapGeometry, input: TtcMapContentInput): MapContent {
  const {
    networkSegments,
    activeAlerts,
    delays,
    reducedSpeedZones,
    plannedClosures,
    mapStations,
    stations,
    selection,
    commutePathPreview,
  } = input;
  const stationNodeImpacts = [
    ...input.stationNodeImpacts,
    ...plannedAdvisoryStationImpacts(plannedClosures, activeAlerts, delays, selection),
  ];
  const {
    renderedNetworkSegments,
    renderedOverlaySegments,
    impactLayers,
    currentPlannedClosureIds,
    overlapPlannedClosures,
    segmentOverlapGroups,
  } = ttcCorridors(geometry, networkSegments, mapStations, activeAlerts, delays, reducedSpeedZones, plannedClosures);
  const stationCenterPoints = ttcStationCenterPoints(geometry, stations);
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const visualAnchorsForStation = (station: Pick<StationSummary, "id" | "mapX" | "mapY">) => (
    stationVisualAnchorsFor(station, stationCenterPoints)
  );

  // Planned previews: upcoming closures, and a current one while selected.
  const plannedPreviewLayers = plannedClosures
    .filter((closure) => !currentPlannedClosureIds.has(closure.id)
      || (selection?.kind === "planned-closure" && selection.id === closure.id))
    .map((closure): RenderedPlannedPreviewLayer | null => {
      const orderedSegments = orderSegmentsByIds(
        renderedOverlaySegments.filter((segment) => shouldRenderPlannedPreviewLayer(segment, closure)),
        closure.previewSegmentIds,
      );
      const corridor = composeNetworkSegmentPath(orderedSegments, closure.travelDirection ?? "bidirectional");
      if (!corridor.pathD) return null;
      return {
        segment: compositeSegment(
          `planned-preview-${closure.id}`,
          orderedSegments,
          corridor.pathD,
          corridor.travelDirection,
          corridor.segmentIds,
          closure.location || closure.title,
        ),
        closure,
      };
    })
    .filter((layer): layer is RenderedPlannedPreviewLayer => Boolean(layer));

  const lineAlerts = [
    ...plannedPreviewLayers.map(({ segment, closure }) => (
      ttcLineAlert(`${segment.id}:${closure.id}`, segment, null, closure)
    )),
    ...impactLayers.map(({ segment, impact }) => (
      ttcLineAlert(`${segment.id}:${impact.kind}:${impact.cardId}:${impact.travelDirection}`, segment, impact, undefined)
    )),
  ];

  const outlinePathsByImpact = new Map<string, string[]>();
  const addOutlinePath = (key: string, pathD: string) => {
    const list = outlinePathsByImpact.get(key);
    if (!list) outlinePathsByImpact.set(key, [pathD]);
    else if (!list.includes(pathD)) list.push(pathD);
  };
  for (const { segment, closure } of plannedPreviewLayers) addOutlinePath(`planned-closure:${closure.id}`, segment.pathD);
  for (const { segment, impact } of impactLayers) addOutlinePath(`${impact.kind}:${impact.cardId}`, segment.pathD);

  const selectedLineAlerts: MapLineAlert[] = [];
  if (selection) {
    const activeLayer = impactLayers.find(({ impact }) => impact.kind === selection.kind && impact.cardId === selection.id);
    const previewLayer = !activeLayer && selection.kind === "planned-closure"
      ? plannedPreviewLayers.find(({ closure }) => closure.id === selection.id)
      : undefined;
    if (activeLayer) {
      selectedLineAlerts.push(ttcLineAlert(`selected:${selection.id}`, activeLayer.segment, activeLayer.impact, undefined));
    } else if (previewLayer) {
      selectedLineAlerts.push(ttcLineAlert(`selected:${selection.id}`, previewLayer.segment, null, previewLayer.closure));
    }
  }

  const directionData = { activeAlerts, delays, reducedSpeedZones, plannedClosures };

  // Every station dot, and the ones with an alert beacon, so each beacon
  // stops short of its neighbours (station-impact-beacon.ts; GO/UP matches).
  const stationBeaconNeighbours: StationBeaconNeighbour[] = stations.flatMap((station) => (
    visualAnchorsForStation(station).map((anchor) => ({
      id: anchor.id,
      center: anchor.point,
      radius: stationDotOuterRadius(isStationVisuallyLarge(station)),
    }))
  ));
  const stationBeaconAnchorIds = new Set<string>();
  for (const impact of stationNodeImpacts) {
    const station = stationById.get(impact.stationId);
    if (!station) continue;
    for (const anchor of stationImpactVisualAnchors(station, impact, directionData, stationCenterPoints)) {
      stationBeaconAnchorIds.add(anchor.id);
    }
  }

  const stationAlerts = stationNodeImpacts.flatMap((impact): MapStationAlert[] => {
    const station = stationById.get(impact.stationId);
    if (!station) return [];
    const isLarge = isStationVisuallyLarge(station);
    const coreRadius = stationImpactEffectRadius(isLarge);
    const impactDirection = stationImpactDirectionForImpact(impact, directionData);
    const directionLabel = impactDirection?.displayDirection ? ` (${impactDirection.displayDirection})` : "";
    return [{
      key: `${impact.kind}:${impact.cardId}:${impact.stationId}`,
      kind: impact.kind,
      impactId: impact.cardId,
      stationId: station.id,
      label: `${impact.title}: ${station.name}${directionLabel}`,
      anchors: stationImpactVisualAnchors(station, impact, directionData, stationCenterPoints).map(({ id, point }) => ({
        id,
        center: point,
        coreRadius,
        ringRadius: stationImpactRingRadius(isLarge),
        beaconRadius: stationImpactBeaconSize(
          point,
          coreRadius,
          stationBeaconNeighbours,
          stationBeaconAnchorIds,
          STATION_BEACON_GAP,
        ).radius,
      })),
    }];
  });

  const interchangeStationIds = new Set(mapStations.filter((station) => station.interchange).map((station) => station.id));
  const glyphs = stationDirectionGlyphs(
    [
      ...stationNodeImpacts,
      ...interchangeLineImpacts(renderedNetworkSegments, interchangeStationIds),
    ].flatMap((impact) => {
      const station = stationById.get(impact.stationId);
      if (!station) return [];
      const badgeRadius = stationImpactDirectionBadgeRadius(isStationVisuallyLarge(station));
      return stationImpactVisualAnchors(station, impact, directionData, stationCenterPoints).map(({ id, point }) => ({
        impact,
        anchor: { id, center: point, badgeRadius },
      }));
    }),
    directionData,
  );

  return {
    lineAlerts,
    selectedLineAlerts,
    stationAlerts,
    stationDirectionGlyphs: glyphs,
    commutePreview: ttcCommutePreview(commutePathPreview, renderedNetworkSegments, stations, visualAnchorsForStation),
    outlinePathsByImpact,
    overlapBadges: ttcOverlapBadges(
      segmentOverlapGroups,
      renderedOverlaySegments,
      overlapPlannedClosures,
      stationNodeImpacts,
      stationById,
      stationCenterPoints,
    ),
    badgePlacement: {
      artwork: ttcBadgeArtwork(geometry, networkSegments, mapStations),
      // Station dots a connector should not end on, with room for their rings.
      stationDots: stations.flatMap((station) => (
        visualAnchorsForStation(station).map((anchor) => ({
          center: anchor.point,
          radius: stationImpactRingRadius(isStationVisuallyLarge(station)) + CONNECTOR_STATION_CLEARANCE,
        }))
      )),
      badgeScale: 1,
    },
  };
}

/** The resolved path of each segment, for estimated train markers. */
export function ttcRenderedNetworkSegments(geometry: PreparedMapGeometry, input: Pick<
  TtcMapContentInput,
  "networkSegments" | "mapStations" | "activeAlerts" | "delays" | "reducedSpeedZones" | "plannedClosures"
>): NetworkSegment[] {
  return ttcCorridors(
    geometry,
    input.networkSegments,
    input.mapStations,
    input.activeAlerts,
    input.delays,
    input.reducedSpeedZones,
    input.plannedClosures,
  ).renderedNetworkSegments;
}

/** The previewed commute: its composed route, and each end's station dots. */
function ttcCommutePreview(
  preview: AccountCommutePathPreview | null | undefined,
  segments: RenderedNetworkSegment[],
  stations: StationSummary[],
  visualAnchorsForStation: (station: StationSummary) => { id: string; point: MapPoint }[],
): MapCommutePreview | null {
  // Endpoints flash even when the route has no drawable path.
  if (!preview || preview.stationIds.length === 0) return null;
  let pathD = "";
  if (preview.segmentIds.length > 0) {
    const previewSegmentIds = new Set(preview.segmentIds);
    const orderedSegments = orderSegmentsByIds(
      segments.filter((segment) => previewSegmentIds.has(segment.id)),
      preview.segmentIds,
    );
    pathD = composeNetworkSegmentPath(orderedSegments, "bidirectional").pathD ?? "";
  }
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const ends = [
    { stationId: preview.stationIds[0], role: "origin" as const },
    { stationId: preview.stationIds.at(-1), role: "destination" as const },
  ];
  return {
    id: preview.id,
    label: preview.routeLabel,
    pathD,
    endpoints: ends.flatMap(({ stationId, role }) => {
      const station = stationId ? stationById.get(stationId) : undefined;
      if (!station) return [];
      const anchors = visualAnchorsForStation(station);
      const flashRadius = anchors.length > 1 ? 33 : isStationVisuallyLarge(station) ? 48 : 38;
      return anchors.map((anchor) => ({
        key: `${role}:${station.id}:${anchor.id}`,
        stationId: station.id,
        role,
        center: anchor.point,
        dotRadius: 34,
        flashRadius,
      }));
    }),
  };
}

/**
 * Where alerts overlap: a badge per stretch of line they share, and a station
 * badge where they only meet at a station; a stretch's badge fully explained
 * by a station badge is dropped.
 */
function ttcOverlapBadges(
  rawSegmentGroups: OverlapBadgeGroup[],
  segments: RenderedNetworkSegment[],
  plannedClosures: PlannedClosure[],
  stationNodeImpacts: StationNodeImpact[],
  stationById: Map<string, StationSummary>,
  stationCenterPoints: Map<string, MapPoint>,
): MapOverlapBadgeInput[] {
  const stationGroups = buildStationOverlapBadgeGroups({
    segments,
    plannedClosures,
    stationNodeImpacts,
    suppressedSignatures: new Set(rawSegmentGroups.map((group) => group.signature)),
  });
  const covered = coveredSegmentOverlapBadgeSignatures(rawSegmentGroups, stationGroups);
  const segmentBadges = rawSegmentGroups
    .filter((group) => !covered.has(group.signature))
    .map((group): MapOverlapBadgeInput | null => {
      const corridor = composeNetworkSegmentPath(group.segments, "bidirectional");
      if (!corridor.pathD) return null;
      const frame = pathMidpointFrame(corridor.pathD);
      if (!frame) return null;
      // Sample each segment on its own: a composed path of disjoint segments
      // would otherwise add fake targets across the gaps between them.
      const placementTargets = group.segments.flatMap((source) => (
        source.pathD ? overlapBadgeTargetsAlong(source.pathD, 1) : []
      ));
      return {
        markerId: group.segments[0]?.id ?? `overlap-${group.signature}`,
        layoutId: `segment:${group.segments.map((source) => source.id).sort().join("|")}`,
        label: labelForSegments(group.segments),
        impacts: group.impacts,
        anchor: frame.point,
        position: frame.point,
        placementTargets: placementTargets.length > 0 ? placementTargets : [frame.point],
        size: overlapBadgeSize(group.impacts),
      };
    })
    .filter((badge): badge is MapOverlapBadgeInput => Boolean(badge));
  const stationBadges = stationGroups.flatMap((group): MapOverlapBadgeInput[] => {
    const station = stationById.get(group.stationId);
    if (!station) return [];
    // The badge explains where these alerts meet, so it aims for the station
    // (and its own overlays beside it: the shared layout).
    const point = stationCenterPoints.get(station.id) ?? { x: station.mapX, y: station.mapY };
    return [{
      markerId: `station-${group.stationId}-${group.signature}`,
      layoutId: `station:${group.stationId}`,
      label: station.name,
      impacts: group.impacts,
      anchor: point,
      position: point,
      placementTargets: [point],
      stationPoint: point,
      size: overlapBadgeSize(group.impacts),
    }];
  });
  return [...segmentBadges, ...stationBadges];
}

function overlapBadgeSize(impacts: MapImpact[]) {
  return mapOverlapIndicatorSizeForKindCount(overlapBadgeVisualItemCount(overlapBadgeKindCounts(impacts)));
}

function visualStateForImpactKind(kind: MapImpactKind): MapOverlayVisualState {
  switch (kind) {
    case "suspension":
      return "suspension";
    case "planned-closure":
      return "suspension";
    case "delay":
      return "delay-static";
    case "reduced-speed-zone":
      return "reduced-speed-zone";
  }
}

/** A TTC impact or planned-closure preview as the shared overlay layer draws it. */
function ttcLineAlert(
  key: string,
  segment: RenderedNetworkSegment,
  impact: MapImpact | null,
  closure: PlannedClosure | undefined,
): MapLineAlert {
  return {
    key,
    kind: impact?.kind ?? "planned-closure",
    impactId: impact?.cardId ?? closure?.id ?? "unknown",
    lineId: segment.lineId,
    pathD: segment.pathD,
    travelDirection: visualTravelDirection(segment),
    visualState: impact ? visualStateForImpactKind(impact.kind) : "planned-preview",
    label: impact
      ? `${impact.kind}: ${segment.label}`
      : `${closure?.title ?? "Planned advisory"}: ${segment.label}`,
    segmentIds: segment.sourceSegmentIds ?? [segment.id],
  };
}

function plannedPreviewImpactsForSegment(
  segment: RenderedNetworkSegment,
  plannedClosures: PlannedClosure[],
): MapImpact[] {
  return plannedClosures
    .filter((closure) => shouldRenderPlannedPreviewLayer(segment, closure))
    .map((closure) => ({
      kind: "planned-closure",
      cardId: closure.id,
      travelDirection: "bidirectional",
      sourceAlertIds: [closure.id],
    }));
}

function overlapBadgeImpactsForSegment(
  segment: RenderedNetworkSegment,
  plannedClosures: PlannedClosure[],
): MapImpact[] {
  const impactsByKey = new Map<string, MapImpact>();
  for (const impact of [
    ...activeImpactsForSegment(segment),
    ...plannedPreviewImpactsForSegment(segment, plannedClosures),
  ]) {
    impactsByKey.set(`${impact.kind}:${impact.cardId}`, impact);
  }
  return Array.from(impactsByKey.values());
}

function groupOverlapBadgeSegments(
  segments: RenderedNetworkSegment[],
  plannedClosures: PlannedClosure[],
): OverlapBadgeGroup[] {
  const groups = new Map<string, OverlapBadgeGroup>();
  for (const segment of segments) {
    const impacts = overlapBadgeImpactsForSegment(segment, plannedClosures);
    if (!hasOverlappingImpacts(impacts)) continue;
    const signature = overlapBadgeSignature(impacts);
    const group = groups.get(signature);
    if (group) group.segments.push(segment);
    else groups.set(signature, { signature, segments: [segment], impacts });
  }
  return Array.from(groups.values()).sort((a, b) => {
    const aSegmentId = a.segments[0]?.id ?? "";
    const bSegmentId = b.segments[0]?.id ?? "";
    return aSegmentId.localeCompare(bSegmentId) || a.signature.localeCompare(b.signature);
  });
}

function impactLayerKey(impact: MapImpact) {
  return `${impact.kind}:${impact.cardId}:${impact.travelDirection}`;
}

function segmentIdsForImpact(
  impact: MapImpact,
  activeAlerts: ActiveAlert[],
  delays: DelayAlert[],
  reducedSpeedZones: ReducedSpeedZone[],
  plannedClosures: PlannedClosure[],
): string[] {
  if (impact.kind === "planned-closure") {
    return activeAlerts.find((alert) => alert.id === impact.cardId)?.affectedSegmentIds
      ?? plannedClosures.find((closure) => closure.id === impact.cardId)?.previewSegmentIds
      ?? [];
  }
  if (impact.kind === "suspension") {
    return activeAlerts.find((alert) => alert.id === impact.cardId)?.affectedSegmentIds ?? [];
  }
  if (impact.kind === "delay") {
    return delays.find((delay) => delay.id === impact.cardId)?.affectedSegmentIds ?? [];
  }
  return reducedSpeedZones.find((zone) => zone.id === impact.cardId)?.affectedSegmentIds ?? [];
}

function orderSegmentsByIds(
  segments: RenderedNetworkSegment[],
  orderedIds: string[],
): RenderedNetworkSegment[] {
  if (orderedIds.length === 0) return segments;
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const ordered = orderedIds
    .map((segmentId) => segmentById.get(segmentId))
    .filter((segment): segment is RenderedNetworkSegment => Boolean(segment));
  const orderedIdSet = new Set(ordered.map((segment) => segment.id));
  return ordered.concat(segments.filter((segment) => !orderedIdSet.has(segment.id)));
}

function compositeSegment(
  id: string,
  sourceSegments: RenderedNetworkSegment[],
  pathD: string,
  travelDirection: NonNullable<NetworkSegment["travelDirection"]>,
  sourceSegmentIds: string[],
  label: string,
): RenderedNetworkSegment {
  const first = sourceSegments[0];
  if (!first) throw new Error("Cannot compose an empty corridor segment.");
  return {
    ...first,
    id,
    label,
    pathD,
    guidePathId: undefined,
    guidePathReversed: false,
    travelDirection,
    sourceSegmentIds,
  };
}

function labelForSegments(segments: RenderedNetworkSegment[]): string {
  if (segments.length === 0) return "Transit corridor";
  if (segments.length === 1) return segments[0].label;
  const first = segments[0];
  const last = segments.at(-1) ?? first;
  return `${first.label} through ${last.label}`;
}

function shouldRenderPlannedPreviewLayer(segment: RenderedNetworkSegment, selectedClosure: PlannedClosure) {
  if (!selectedClosure.previewSegmentIds.includes(segment.id)) return false;
  return !(segment.impacts ?? []).some(
    (impact) => impact.kind === "planned-closure" && impact.cardId === selectedClosure.id,
  );
}

const TTC_TRAIN_MARKER_LANE_OFFSET = 20;
const TTC_TRAIN_MARKER_LINE_LABELS: Record<string, string> = {
  "line-1": "Line 1",
  "line-2": "Line 2",
  "line-4": "Line 4",
  "line-5": "Line 5",
  "line-6": "Line 6",
};

type TrainMarkerPathMetrics = { path: SVGPathElement; length: number };
const trainMarkerPathMetrics = new Map<string, TrainMarkerPathMetrics>();

/** A segment path's length, measured once on a detached path (never the live map). */
function trainMarkerPath(pathD: string): TrainMarkerPathMetrics | null {
  if (typeof document === "undefined") return null;
  let metrics = trainMarkerPathMetrics.get(pathD);
  if (!metrics) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    metrics = { path, length: path.getTotalLength() };
    trainMarkerPathMetrics.set(pathD, metrics);
  }
  return metrics;
}

function ttcTrainMarkerTravelDirection(
  marker: EstimatedTrainMarker,
  segmentById: ReadonlyMap<string, NetworkSegment>,
): EstimatedTrainMarker["travelDirection"] {
  const segment = segmentById.get(marker.segmentId);
  return segment
    ? visualTravelDirection({ ...segment, travelDirection: marker.travelDirection })
    : marker.travelDirection;
}

/** TTC's train markers, along each segment's path in its lane. */
export const TTC_TRAIN_MARKER_PLACEMENT: MapTrainMarkerPlacement = {
  frame(marker, segmentById) {
    const segment = segmentById.get(marker.segmentId);
    if (!segment?.pathD) return null;
    const visualDirection = ttcTrainMarkerTravelDirection(marker, segmentById);
    const progress = visualDirection === "reverse" ? 1 - marker.progress : marker.progress;
    try {
      const metrics = trainMarkerPath(segment.pathD);
      if (!metrics) return null;
      const { path, length } = metrics;
      if (!Number.isFinite(length) || length <= 0) return null;
      const distance = Math.max(0, Math.min(1, progress)) * length;
      const point = path.getPointAtLength(distance);
      const delta = Math.min(12, Math.max(1, length * 0.015));
      const ahead = path.getPointAtLength(Math.min(length, distance + delta));
      const behind = path.getPointAtLength(Math.max(0, distance - delta));
      const tangent = { x: ahead.x - behind.x, y: ahead.y - behind.y };
      const angle = Math.atan2(tangent.y, tangent.x) * (180 / Math.PI);
      return {
        point: estimatedTrainMarkerLanePoint(point, tangent, visualDirection, TTC_TRAIN_MARKER_LANE_OFFSET),
        angle: visualDirection === "reverse" ? angle + 180 : angle,
      };
    } catch {
      return null;
    }
  },
  travelDirection: ttcTrainMarkerTravelDirection,
  label: (marker) => (
    `${TTC_TRAIN_MARKER_LINE_LABELS[marker.lineId] ?? "Train"} ${marker.direction} estimated train near ${marker.nextStationId}`
  ),
  scale: 1,
};
