/*
 * GO/UP's content adapter: what the GO/UP System Map draws over its artwork
 * (`MapContent`, app/map-content.ts), from dashboard data, built by the
 * `regional-*` adapters over GO/UP's prepared geometry.
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
import { plannedAdvisoryStationImpacts } from "./map-alert-selector.ts";
import { regionalLineAlerts } from "./regional-line-alerts.ts";
import { regionalStationAlerts } from "./regional-station-alerts.ts";
import { regionalCommutePreview } from "./regional-commute-preview.ts";
import { regionalBadgePlacement, regionalOverlapBadges } from "./regional-map-overlays.ts";
import { REGIONAL_OVERLAY_UNIT, regionalTrainMarkerFrame } from "./regional-map-geometry.ts";
import type { MapTrainMarkerPlacement } from "../components/map-overlays/TrainMarkerLayer.tsx";
import { isSelectedLineAlert, lineAlertPathsByImpact } from "../components/map-overlays/line-alert-model.ts";

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

/**
 * Station alerts to draw: the current ones, and station-only planned
 * advisories by TTC's rule (upcoming ones always, a current one only while
 * selected), each once.
 */
export function regionalStationAlertImpacts(
  input: Pick<RegionalMapContentInput, "stationNodeImpacts" | "plannedClosures" | "activeAlerts" | "delays" | "selection">,
): StationNodeImpact[] {
  const seen = new Set<string>();
  return [
    ...input.stationNodeImpacts,
    ...plannedAdvisoryStationImpacts(input.plannedClosures, input.activeAlerts, input.delays, input.selection),
  ].filter((impact) => {
    const key = `${impact.kind}:${impact.cardId}:${impact.stationId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** What the GO/UP System Map draws over its artwork. */
export function regionalMapContent(geometry: PreparedMapGeometry, input: RegionalMapContentInput): MapContent {
  const { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stations, selection } = input;
  const stationAlertImpacts = regionalStationAlertImpacts(input);
  const lineAlerts = regionalLineAlerts(geometry, {
    activeAlerts,
    networkSegments,
    stationNodeImpacts: input.stationNodeImpacts,
  });
  const station = regionalStationAlerts(geometry, {
    activeAlerts,
    delays,
    reducedSpeedZones,
    plannedClosures,
    stationNodeImpacts: stationAlertImpacts,
    stations,
    networkSegments,
  }, REGIONAL_OVERLAY_UNIT);
  return {
    lineAlerts,
    selectedLineAlerts: lineAlerts.filter((alert) => isSelectedLineAlert(alert, selection)),
    stationAlerts: station.alerts,
    stationDirectionGlyphs: station.glyphs,
    commutePreview: regionalCommutePreview(geometry, input.commutePathPreview ?? null, networkSegments),
    outlinePathsByImpact: lineAlertPathsByImpact(lineAlerts),
    overlapBadges: regionalOverlapBadges(geometry, networkSegments, { stationNodeImpacts: stationAlertImpacts, stations }),
    badgePlacement: regionalBadgePlacement(geometry),
  };
}

/** GO/UP's train markers, along each segment's prepared corridor, at GO/UP's larger size. */
export function regionalTrainMarkerPlacement(geometry: PreparedMapGeometry): MapTrainMarkerPlacement {
  return {
    frame(marker, segmentById) {
      const segment = segmentById.get(marker.segmentId);
      return segment ? regionalTrainMarkerFrame(geometry, segment, marker) : null;
    },
    travelDirection: (marker) => marker.travelDirection,
    label: (marker) => `${marker.lineId.replace("regional-", "").toUpperCase()} toward ${marker.direction}; schematic estimated position`,
    scale: 1.8,
  };
}
