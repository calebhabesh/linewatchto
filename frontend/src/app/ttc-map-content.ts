/*
 * TTC's content adapter: what the TTC System Map draws over its artwork
 * (`MapContent`, app/map-content.ts), from dashboard data. It holds TTC's
 * facts only: how a segment is drawn along the authored guides and tracks,
 * where TTC's stations and dots are, and its line names. Corridors, the
 * commute preview, badge artwork and train-marker placement are the shared
 * builders (map-corridors.ts, map-badge-artwork.ts, train-marker-placement.ts)
 * over the shared rules (map-content-rules.ts).
 */
import type {
  ActiveAlert,
  DelayAlert,
  ImpactSelection,
  MapImpact,
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
  pathPolylinePoints,
  resolveNetworkSegmentPath,
  type MapPoint,
} from "./map-geometry.ts";
import { ttcAnchorPoints, ttcGuidePaths, ttcStationCenters } from "./ttc-map-geometry.ts";
import { plannedAdvisoryStationImpacts } from "./map-alert-selector.ts";
import {
  mapImpactContext,
  overlapBadgeGroups,
  overlapPreviewClosures,
  overlapStretchLabel,
  stationAlertSizes,
  type MapImpactContext,
  type MapOverlapBadgeGroup,
  type StationDot,
} from "./map-content-rules.ts";
import { mapCommutePreview, mapLineAlerts } from "./map-corridors.ts";
import { mapBadgeArtwork } from "./map-badge-artwork.ts";
import { mapTrainMarkerPlacement } from "./train-marker-placement.ts";
import type { MapContent, MapOverlapBadgeInput } from "./map-content.ts";
import { lineAlertPathsByImpact } from "../components/map-overlays/line-alert-model.ts";
import {
  stationDirectionGlyphs,
  type MapStationAlert,
} from "../components/map-overlays/station-alert-model.ts";
import { overlapBadgeTargetsAlong } from "../components/map-overlays/overlap-badge-layout.ts";
import { CONNECTOR_STATION_CLEARANCE } from "../components/map-overlays/overlay-obstacles.ts";
import {
  buildStationOverlapBadgeGroups,
  coveredSegmentOverlapBadgeSignatures,
  mapOverlapIndicatorSizeForKindCount,
  overlapBadgeKindCounts,
  overlapBadgeVisualItemCount,
} from "../components/map-overlap-badges.ts";
import { stationImpactDirectionForImpact } from "../components/station-impact-direction.ts";
import {
  stationImpactVisualAnchors,
  stationVisualAnchorsFor,
  stationVisualCenterIds,
} from "../components/station-map-visuals.ts";
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

/** Clear space a station beacon keeps from a neighbouring dot or beacon. */
const STATION_BEACON_GAP = 4;

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
  dots: Map<string, StationDot>;
  medianDot: StationDot;
}>();

function preparedTtc(geometry: PreparedMapGeometry) {
  let prepared = geometryCache.get(geometry);
  if (!prepared) {
    const dots = new Map(geometry.stations.flatMap((station) => (
      station.anchors.map(({ id, radius, outline }) => [id.replace(/^station-/, ""), { radius, outline }] as const)
    )));
    const sorted = [...dots.values()].sort((a, b) => a.radius - b.radius);
    prepared = {
      anchorPoints: ttcAnchorPoints(geometry),
      guidePaths: ttcGuidePaths(geometry),
      dots,
      medianDot: sorted[Math.floor(sorted.length / 2)] ?? { radius: 32, outline: 8 },
    };
    geometryCache.set(geometry, prepared);
  }
  return prepared;
}

/** Each segment with the path TTC draws it along: its authored guide, its line's track, else the chord between its stations. */
const ttcDrawnSegments = lastResult((
  geometry: PreparedMapGeometry,
  networkSegments: NetworkSegment[],
  mapStations: Station[],
): NetworkSegment[] => {
  const { anchorPoints, guidePaths } = preparedTtc(geometry);
  return networkSegments
    .map((segment) => ({ ...segment, pathD: resolveNetworkSegmentPath(segment, mapStations, anchorPoints, guidePaths) }))
    .filter((segment) => Boolean(segment.pathD));
});

/** The drawn segments with planned closures sorted by their timing (map-content-rules.ts), and the alerts along them. */
const ttcCorridors = lastResult((
  geometry: PreparedMapGeometry,
  networkSegments: NetworkSegment[],
  mapStations: Station[],
  activeAlerts: ActiveAlert[],
  delays: DelayAlert[],
  plannedClosures: PlannedClosure[],
) => {
  const context = mapImpactContext(ttcDrawnSegments(geometry, networkSegments, mapStations), { activeAlerts, delays, plannedClosures });
  return { context, segmentOverlapGroups: overlapBadgeGroups(context) };
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
  const { context, segmentOverlapGroups } = ttcCorridors(geometry, networkSegments, mapStations, activeAlerts, delays, plannedClosures);
  const stationCenterPoints = ttcStationCenterPoints(geometry, stations);
  const { dots, medianDot } = preparedTtc(geometry);
  // A station placed where the artwork draws no dot is drawn as a regular one.
  const dot = (anchorId: string) => dots.get(anchorId) ?? medianDot;
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const visualAnchorsForStation = (station: Pick<StationSummary, "id" | "mapX" | "mapY">) => (
    stationVisualAnchorsFor(station, stationCenterPoints)
  );

  const { lineAlerts, selectedLineAlerts } = mapLineAlerts(context, {
    activeAlerts,
    stationNodeImpacts: input.stationNodeImpacts,
    selection,
  });
  const directionData = { activeAlerts, delays, reducedSpeedZones, plannedClosures };

  // Every station dot, and the ones with an alert beacon, so each beacon
  // stops short of its neighbours (station-impact-beacon.ts; GO/UP matches).
  const stationBeaconNeighbours: StationBeaconNeighbour[] = stations.flatMap((station) => (
    visualAnchorsForStation(station).map((anchor) => ({
      id: anchor.id,
      center: anchor.point,
      radius: stationAlertSizes(dot(anchor.id)).dotOuterRadius,
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
    const impactDirection = stationImpactDirectionForImpact(impact, directionData);
    const directionLabel = impactDirection?.displayDirection ? ` (${impactDirection.displayDirection})` : "";
    return [{
      key: `${impact.kind}:${impact.cardId}:${impact.stationId}`,
      kind: impact.kind,
      impactId: impact.cardId,
      stationId: station.id,
      label: `${impact.title}: ${station.name}${directionLabel}`,
      anchors: stationImpactVisualAnchors(station, impact, directionData, stationCenterPoints).map(({ id, point }) => {
        const { coreRadius, ringRadius } = stationAlertSizes(dot(id));
        return {
          id,
          center: point,
          coreRadius,
          ringRadius,
          beaconRadius: stationImpactBeaconSize(
            point,
            coreRadius,
            stationBeaconNeighbours,
            stationBeaconAnchorIds,
            STATION_BEACON_GAP,
          ).radius,
        };
      }),
    }];
  });

  // Arrows mark a station's own alerts only; line alerts carry their own chevrons.
  const glyphs = stationDirectionGlyphs(
    stationNodeImpacts.flatMap((impact) => {
      const station = stationById.get(impact.stationId);
      if (!station) return [];
      return stationImpactVisualAnchors(station, impact, directionData, stationCenterPoints).map(({ id, point }) => ({
        impact,
        anchor: { id, center: point, badgeRadius: stationAlertSizes(dot(id)).directionBadgeRadius },
      }));
    }),
    directionData,
  );

  return {
    lineAlerts,
    selectedLineAlerts,
    stationAlerts,
    stationDirectionGlyphs: glyphs,
    // A commute ends on the dot its route uses there, else every dot of the station.
    commutePreview: mapCommutePreview(commutePathPreview, context.segments, (stationId, routeAnchorId) => {
      const station = stationById.get(stationId);
      if (!station) return [];
      const anchors = visualAnchorsForStation(station);
      const routeAnchor = anchors.find((anchor) => `station-${anchor.id}` === routeAnchorId);
      return (routeAnchor ? [routeAnchor] : anchors).map((anchor) => ({ id: anchor.id, center: anchor.point, dot: dot(anchor.id) }));
    }),
    outlinePathsByImpact: lineAlertPathsByImpact(lineAlerts),
    overlapBadges: ttcOverlapBadges(
      segmentOverlapGroups,
      context.segments,
      context,
      stationNodeImpacts,
      stationById,
      stationCenterPoints,
    ),
    badgePlacement: {
      artwork: mapBadgeArtwork(geometry, TTC_BADGE_ARTWORK_SCALE),
      // Station dots a connector should not end on, with room for their rings.
      stationDots: stations.flatMap((station) => (
        visualAnchorsForStation(station).map((anchor) => ({
          center: anchor.point,
          radius: stationAlertSizes(dot(anchor.id)).ringRadius + CONNECTOR_STATION_CLEARANCE,
        }))
      )),
      badgeScale: 1,
    },
  };
}

/** TTC's badge spacing: TTC units, TTC-size badges, its 80-unit line strokes. */
const TTC_BADGE_ARTWORK_SCALE = { unit: 1, badgeScale: 1, lineHalfWidth: 40 };

/** The drawn path of each segment, for estimated train markers. */
export function ttcRenderedNetworkSegments(geometry: PreparedMapGeometry, input: Pick<
  TtcMapContentInput,
  "networkSegments" | "mapStations"
>): NetworkSegment[] {
  return ttcDrawnSegments(geometry, input.networkSegments, input.mapStations);
}

/**
 * Where alerts overlap: a badge per stretch of line they share, and a station
 * badge where they only meet at a station; a stretch's badge fully explained
 * by a station badge is dropped.
 */
function ttcOverlapBadges(
  rawSegmentGroups: MapOverlapBadgeGroup<NetworkSegment>[],
  segments: NetworkSegment[],
  context: MapImpactContext<NetworkSegment>,
  stationNodeImpacts: StationNodeImpact[],
  stationById: Map<string, StationSummary>,
  stationCenterPoints: Map<string, MapPoint>,
): MapOverlapBadgeInput[] {
  const stationGroups = buildStationOverlapBadgeGroups({
    segments,
    plannedClosures: overlapPreviewClosures(context),
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
        label: overlapStretchLabel(group.segments),
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

const TTC_LINE_LABELS: Record<string, string> = {
  "line-1": "Line 1",
  "line-2": "Line 2",
  "line-4": "Line 4",
  "line-5": "Line 5",
  "line-6": "Line 6",
};

/** TTC's train markers, along each segment's drawn path (from station A to B). */
export const TTC_TRAIN_MARKER_PLACEMENT = mapTrainMarkerPlacement({
  unit: 1,
  scale: 1,
  path: (segment) => {
    if (!segment.pathD) return null;
    const points = pathPolylinePoints(segment.pathD);
    return segment.guidePathReversed ? [...points].reverse() : points;
  },
  lineLabel: (lineId) => TTC_LINE_LABELS[lineId] ?? "Train",
});
