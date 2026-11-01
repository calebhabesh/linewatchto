import type {
  ActiveAlert,
  DelayAlert,
  NetworkSegment,
  PlannedClosure,
  Station,
  StationNodeImpact,
} from "./linewatch-data.ts";
import type { PreparedMapGeometry } from "./map-geometry-data.ts";
import { mapBadgeArtwork } from "./map-badge-artwork.ts";
import {
  REGIONAL_OVERLAP_INDICATOR_SCALE,
  REGIONAL_OVERLAY_UNIT,
  regionalStation,
  regionalStationDots,
  regionalStationVisualAnchors,
  resolvedRegionalSegmentPath,
  regionalOverlapBadgeAnchor,
  REGIONAL_MAP_VIEWBOX,
} from "./regional-map-geometry.ts";
import {
  buildStationOverlapBadgeGroups,
  coveredSegmentOverlapBadgeSignatures,
  mapOverlapIndicatorSize,
  type StationOverlapBadgeGroup,
} from "../components/map-overlap-badges.ts";
import {
  mapImpactContext,
  overlapBadgeGroups,
  overlapPreviewClosures,
  overlapStretchLabel,
  stationAlertSizes,
} from "./map-content-rules.ts";
import type { MapLineAlert } from "../components/map-overlays/line-alert-model.ts";
import { overlapBadgeTargetsAlong } from "../components/map-overlays/overlap-badge-layout.ts";
import type { MapStationAlert } from "../components/map-overlays/station-alert-model.ts";
import { CONNECTOR_STATION_CLEARANCE } from "../components/map-overlays/overlay-obstacles.ts";
import {
  placeMapOverlapBadges,
  type MapBadgePlacement,
  type MapOverlapBadgeInput,
  type MapPlacedOverlapBadge,
} from "./map-content.ts";

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** A GO/UP overlap badge before placement; its layout id is its marker id. */
export type RegionalOverlapBadge = Omit<MapOverlapBadgeInput, "layoutId"> & { layoutId?: string };

/** Planned closures and the alerts that decide their timing (map-content-rules.ts). */
export type RegionalClosureData = {
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  plannedClosures: PlannedClosure[];
};

const NO_CLOSURES: RegionalClosureData = { activeAlerts: [], delays: [], plannedClosures: [] };

/** Segments whose alerts overlap, by the shared grouping (upcoming previews included). */
export function regionalOverlapBadgeGroups(segments: NetworkSegment[], closures: RegionalClosureData = NO_CLOSURES) {
  return overlapBadgeGroups(mapImpactContext(segments, closures));
}

export function regionalOverlapBadges(
  geometry: PreparedMapGeometry,
  segments: NetworkSegment[],
  stationContext?: {
    stationNodeImpacts: StationNodeImpact[];
    stations: Pick<Station, "id" | "name">[];
  },
  closures: RegionalClosureData = NO_CLOSURES,
): MapOverlapBadgeInput[] {
  const context = mapImpactContext(segments, closures);
  const segmentGroups = overlapBadgeGroups(context);
  // Same rules as the TTC map: alerts that only meet at a station get a station
  // badge, and a segment badge fully explained by a station badge is dropped.
  const stationGroups = stationContext
    ? buildStationOverlapBadgeGroups({
        segments: context.segments,
        plannedClosures: overlapPreviewClosures(context),
        stationNodeImpacts: stationContext.stationNodeImpacts,
        suppressedSignatures: new Set(segmentGroups.map((group) => group.signature)),
      })
    : [];
  const coveredSignatures = coveredSegmentOverlapBadgeSignatures(segmentGroups, stationGroups);
  const stationBadges = stationContext
    ? regionalStationOverlapBadges(geometry, stationGroups, stationContext.stations)
    : [];
  const segmentBadges = segmentGroups.filter((group) => !coveredSignatures.has(group.signature)).flatMap((group) => {
    const size = mapOverlapIndicatorSize(group.impacts);
    const anchorSegment = group.segments[Math.floor(group.segments.length / 2)];
    const placement = anchorSegment
      ? regionalOverlapBadgeAnchor(geometry, anchorSegment, size)
      : null;
    if (!placement) return [];
    // Sample each segment on its own so disjoint segments don't add targets
    // across the gaps between them.
    const placementTargets = group.segments.flatMap((segment) => {
      const pathD = resolvedRegionalSegmentPath(geometry, segment);
      return pathD ? overlapBadgeTargetsAlong(pathD, REGIONAL_BADGE_SCALE) : [];
    });
    const markerId = `regional-overlap-${group.signature}`;
    return [{
      markerId,
      layoutId: markerId,
      label: overlapStretchLabel(group.segments),
      impacts: group.impacts,
      anchor: placement.anchor,
      position: placement.position,
      placementTargets: placementTargets.length > 0 ? placementTargets : [placement.anchor],
      size,
    }];
  });
  return [...segmentBadges, ...stationBadges];
}

function regionalStationOverlapBadges(
  geometry: PreparedMapGeometry,
  groups: StationOverlapBadgeGroup[],
  stations: Pick<Station, "id" | "name">[],
): MapOverlapBadgeInput[] {
  const stationNames = new Map(stations.map((station) => [station.id, station.name]));
  return groups.flatMap((group) => {
    const station = regionalStation(geometry, group.stationId);
    const anchors = station ? regionalStationVisualAnchors(station) : [];
    if (anchors.length === 0) return [];
    const point = {
      x: anchors.reduce((sum, anchor) => sum + anchor.point.x, 0) / anchors.length,
      y: anchors.reduce((sum, anchor) => sum + anchor.point.y, 0) / anchors.length,
    };
    const markerId = `regional-overlap-station-${group.stationId}-${group.signature}`;
    return [{
      markerId,
      layoutId: markerId,
      label: stationNames.get(group.stationId) ?? group.stationId,
      impacts: group.impacts,
      anchor: point,
      position: point,
      placementTargets: [point],
      stationPoint: point,
      size: mapOverlapIndicatorSize(group.impacts),
    }];
  });
}

// GO/UP draws overlap badges at twice TTC's size, so badge spacing doubles
// too (map-badge-artwork.ts). Overlay sizes come from the shared metrics at
// GO/UP's overlay unit (map-overlays/overlay-obstacles.ts), as on TTC.
const REGIONAL_BADGE_SCALE = REGIONAL_OVERLAP_INDICATOR_SCALE;
// GO/UP's route strokes are 175 units wide.
const REGIONAL_BADGE_ARTWORK_SCALE = {
  unit: REGIONAL_OVERLAY_UNIT,
  badgeScale: REGIONAL_BADGE_SCALE,
  lineHalfWidth: 87.5,
};

const badgePlacementCache = new WeakMap<PreparedMapGeometry, MapBadgePlacement>();

/** What GO/UP's overlap badges keep clear of: its artwork and station dots, at twice TTC's badge size. */
export function regionalBadgePlacement(geometry: PreparedMapGeometry): MapBadgePlacement {
  let placement = badgePlacementCache.get(geometry);
  if (!placement) {
    placement = {
      artwork: mapBadgeArtwork(geometry, REGIONAL_BADGE_ARTWORK_SCALE),
      stationDots: regionalStationDots(geometry).map((anchor) => ({
        center: anchor.point,
        radius: stationAlertSizes(anchor).ringRadius + CONNECTOR_STATION_CLEARANCE * REGIONAL_OVERLAY_UNIT,
      })),
      badgeScale: REGIONAL_BADGE_SCALE,
    };
    badgePlacementCache.set(geometry, placement);
  }
  return placement;
}

/** GO/UP's overlap badges placed around its alerts by the shared layout, as on TTC. */
export function regionalPlacedOverlapBadges(
  geometry: PreparedMapGeometry,
  badges: RegionalOverlapBadge[],
  lineAlerts: MapLineAlert[] = [],
  stationAlerts: MapStationAlert[] = [],
): MapPlacedOverlapBadge[] {
  return placeMapOverlapBadges({
    lineAlerts,
    stationAlerts,
    overlapBadges: badges.map((badge) => ({ ...badge, layoutId: badge.layoutId ?? badge.markerId })),
    badgePlacement: regionalBadgePlacement(geometry),
  }, { unit: REGIONAL_OVERLAY_UNIT, mapBounds: REGIONAL_MAP_VIEWBOX });
}
