/*
 * GO/UP's content adapter: what the GO/UP System Map draws over its artwork
 * (`MapContent`, app/map-content.ts), from dashboard data. It holds GO/UP's
 * facts only (how a segment is drawn along the authored routes, where its
 * stations, dots and Union's pill are, its line codes); corridors, the
 * commute preview, badge artwork and train-marker placement are the shared
 * builders over the shared rules, as on TTC.
 */
import type {
  ActiveAlert,
  DelayAlert,
  ImpactSelection,
  NetworkSegment,
  PlannedClosure,
  ReducedSpeedZone,
  Station,
  StationNodeImpact,
} from "./linewatch-data.ts";
import type { AccountCommutePathPreview } from "./commute-data.ts";
import type { PreparedMapGeometry } from "./map-geometry-data.ts";
import type { MapContent } from "./map-content.ts";
import { regionalStationAlerts, regionalStationPill } from "./regional-station-alerts.ts";
import { regionalBadgePlacement, regionalOverlapBadges } from "./regional-map-overlays.ts";
import {
  REGIONAL_OVERLAY_UNIT,
  regionalAnchorDot,
  regionalDrawnSegments,
  regionalSegmentCorridorPoints,
  regionalStation,
  regionalStationVisualAnchors,
  type RegionalStationVisualAnchor,
} from "./regional-map-geometry.ts";
import { mapImpactContext } from "./map-content-rules.ts";
import { mapCommutePreview, mapLineAlerts, type MapCommuteEndpointDot } from "./map-corridors.ts";
import { mapTrainMarkerPlacement } from "./train-marker-placement.ts";
import type { MapTrainMarkerPlacement } from "../components/map-overlays/TrainMarkerLayer.tsx";
import { lineAlertPathsByImpact } from "../components/map-overlays/line-alert-model.ts";
import { mapStationAlertImpacts } from "../components/map-overlays/redundant-station-impacts.ts";

export type RegionalMapContentInput = {
  networkSegments: NetworkSegment[];
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  /** Current station alerts; planned advisories are added here. */
  stationNodeImpacts: StationNodeImpact[];
  stations: Station[];
  selection: ImpactSelection;
  commutePathPreview?: AccountCommutePathPreview | null;
};

/** Station alerts to draw, by every map's rule (`mapStationAlertImpacts`). */
export function regionalStationAlertImpacts(
  input: Pick<
    RegionalMapContentInput,
    "networkSegments" | "stationNodeImpacts" | "plannedClosures" | "activeAlerts" | "delays" | "reducedSpeedZones" | "selection"
  >,
): StationNodeImpact[] {
  return mapStationAlertImpacts(input);
}

/** What the GO/UP System Map draws over its artwork. */
export function regionalMapContent(geometry: PreparedMapGeometry, input: RegionalMapContentInput): MapContent {
  const { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stations, selection } = input;
  const stationAlertImpacts = regionalStationAlertImpacts(input);
  const drawnSegments = regionalDrawnSegments(geometry, networkSegments);
  const { lineAlerts, selectedLineAlerts } = mapLineAlerts(
    mapImpactContext(drawnSegments, { activeAlerts, delays, plannedClosures }),
    { activeAlerts, stationNodeImpacts: input.stationNodeImpacts, selection },
  );
  const station = regionalStationAlerts(geometry, {
    activeAlerts,
    delays,
    reducedSpeedZones,
    plannedClosures,
    stationNodeImpacts: stationAlertImpacts,
    stations,
  }, REGIONAL_OVERLAY_UNIT);
  return {
    lineAlerts,
    selectedLineAlerts,
    stationAlerts: station.alerts,
    stationDirectionGlyphs: station.glyphs,
    // A commute ends on the dot its route uses there, else every dot of the station.
    commutePreview: mapCommutePreview(input.commutePathPreview, drawnSegments, (stationId, routeAnchorId) => {
      const routeDot = routeAnchorId ? regionalAnchorDot(geometry, routeAnchorId) : null;
      const station = regionalStation(geometry, stationId);
      const dots = routeDot ? [routeDot] : station ? regionalStationVisualAnchors(station) : [];
      return dots.map((dot) => regionalEndpointDot(geometry, dot));
    }),
    outlinePathsByImpact: lineAlertPathsByImpact(lineAlerts),
    overlapBadges: regionalOverlapBadges(
      geometry,
      networkSegments,
      { stationNodeImpacts: stationAlertImpacts, stations },
      { activeAlerts, delays, plannedClosures },
    ),
    badgePlacement: regionalBadgePlacement(geometry),
  };
}

function regionalEndpointDot(geometry: PreparedMapGeometry, dot: RegionalStationVisualAnchor): MapCommuteEndpointDot {
  const pill = regionalStationPill(geometry, dot.id);
  return { id: dot.id, center: dot.point, dot, ...(pill ? { pill } : {}) };
}

/** GO/UP's train markers, along each segment's authored corridor, at GO/UP's larger size. */
export function regionalTrainMarkerPlacement(geometry: PreparedMapGeometry): MapTrainMarkerPlacement {
  return mapTrainMarkerPlacement({
    unit: REGIONAL_OVERLAY_UNIT,
    scale: 1.8,
    // Corridors only: a chord between stations can leave a bent track, so
    // a segment without one draws no marker.
    path: (segment) => regionalSegmentCorridorPoints(geometry, segment),
    lineLabel: (lineId) => lineId.replace(/^regional-/, "").toUpperCase(),
  });
}
