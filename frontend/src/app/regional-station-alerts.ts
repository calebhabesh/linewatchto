import type { Station, StationNodeImpact } from "./linewatch-data.ts";
import type { PreparedMapGeometry } from "./map-geometry-data.ts";
import {
  matrixTransform,
  regionalStation,
  regionalStationDots,
  regionalStationImpactAnchors,
  regionalStationPillShape,
} from "./regional-map-geometry.ts";
import { stationImpactBeaconSize, type StationBeaconNeighbour } from "../components/station-impact-beacon.ts";
import { stationAlertSizes } from "./map-content-rules.ts";
import {
  stationImpactDirectionForImpact,
  stationImpactDirectionSource,
  type StationImpactDirectionData,
} from "../components/station-impact-direction.ts";
import {
  stationDirectionGlyphs,
  type MapStationAlert,
  type MapStationDirectionGlyph,
  type MapStationPill,
} from "../components/map-overlays/station-alert-model.ts";

/** TTC's clear space between a beacon and a neighbouring dot, in overlay units. */
const BEACON_GAP = 4;

/** Every station dot, with its outline. */
function stationBeaconNeighbours(geometry: PreparedMapGeometry): StationBeaconNeighbour[] {
  return regionalStationDots(geometry).map((anchor) => ({
    id: anchor.id,
    center: anchor.point,
    radius: stationAlertSizes(anchor).dotOuterRadius,
  }));
}

/** A pill-shaped dot (Union), with its authored outline, in overlay coordinates. */
export function regionalStationPill(geometry: PreparedMapGeometry, anchorId: string): MapStationPill | undefined {
  const pill = regionalStationPillShape(geometry, anchorId);
  if (!pill) return undefined;
  const { shape, matrix } = pill;
  return {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    rx: shape.rx,
    ry: shape.ry,
    transform: matrixTransform(matrix),
    scale: Math.hypot(matrix[0], matrix[1]),
    stroke: shape.stroke,
    strokeWidth: `${shape.strokeWidth}px`,
  };
}

/** Union's pill hub keeps its filled alert outline alone; arrows do not fit its many lines. */
const NO_DIRECTION_ARROW_STATION_IDS = new Set(["union"]);

/**
 * Every GO/UP station alert, in the shared overlay model. An alert sits on
 * the platform of its line where the station has one per line (Bloor's UP
 * and KI dots). Arrows mark a station's own alerts, not line alerts through it.
 */
export function regionalStationAlerts(
  geometry: PreparedMapGeometry,
  data: StationImpactDirectionData & {
    stationNodeImpacts: StationNodeImpact[];
    stations: Pick<Station, "id" | "name">[];
  },
  unit: number,
): { alerts: MapStationAlert[]; glyphs: MapStationDirectionGlyph[] } {
  const stationNames = new Map(data.stations.map((station) => [station.id, station.name]));

  const place = <I extends Pick<StationNodeImpact, "stationId" | "kind" | "cardId">>(impact: I) => {
    const station = regionalStation(geometry, impact.stationId);
    if (!station) return [];
    const lineId = stationImpactDirectionSource(impact, data)?.lineId;
    return [{ impact, anchors: regionalStationImpactAnchors(station, lineId) }];
  };
  const placed = data.stationNodeImpacts.flatMap(place);
  const neighbours = stationBeaconNeighbours(geometry);
  const alertedAnchorIds = new Set(placed.flatMap(({ anchors }) => anchors.map((anchor) => anchor.id)));

  const alerts = placed.map(({ impact, anchors }): MapStationAlert => {
    const direction = stationImpactDirectionForImpact(impact, data);
    const directionLabel = direction?.displayDirection ? ` (${direction.displayDirection})` : "";
    const stationName = stationNames.get(impact.stationId) ?? impact.stationId.replaceAll("-", " ");
    return {
      key: `${impact.kind}:${impact.cardId}:${impact.stationId}`,
      kind: impact.kind,
      impactId: impact.cardId,
      stationId: impact.stationId,
      label: `${impact.title}: ${stationName}${directionLabel}`,
      anchors: anchors.map((anchor) => {
        const { coreRadius, ringRadius } = stationAlertSizes(anchor);
        return {
          id: anchor.id,
          center: anchor.point,
          coreRadius,
          ringRadius,
          beaconRadius: stationImpactBeaconSize(
            anchor.point,
            coreRadius,
            neighbours,
            alertedAnchorIds,
            BEACON_GAP * unit,
          ).radius,
          pill: regionalStationPill(geometry, anchor.id),
        };
      }),
    };
  });

  // Arrows mark a station's own alerts only; line alerts carry their own chevrons.
  const glyphs = stationDirectionGlyphs(
    placed
      .filter(({ impact }) => !NO_DIRECTION_ARROW_STATION_IDS.has(impact.stationId))
      .flatMap(({ impact, anchors }) => anchors.map((anchor) => ({
        impact,
        anchor: { id: anchor.id, center: anchor.point, badgeRadius: stationAlertSizes(anchor).directionBadgeRadius },
      }))),
    data,
  );
  return { alerts, glyphs };
}
