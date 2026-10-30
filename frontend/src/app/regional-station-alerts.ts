import type { Station, StationNodeImpact } from "./linewatch-data.ts";
import {
  pointInRegionalStationsLayer,
  regionalStationImpactAnchors,
  regionalStationVisualAnchors,
} from "./regional-map-geometry.ts";
import {
  STATION_IMPACT_RING_SCALE,
  stationImpactBeaconSize,
  type StationBeaconNeighbour,
} from "../components/station-impact-beacon.ts";
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

/*
 * TTC's station alert design measured against its regular station dot
 * (authored radius 32): a 26-unit core and a 24-unit direction badge. GO/UP
 * dots vary in size, so each alert takes these ratios of its own dot.
 */
const TTC_STATION_DOT_RADIUS = 32;
const CORE_RATIO = 26 / TTC_STATION_DOT_RADIUS;
const DIRECTION_BADGE_RATIO = 24 / TTC_STATION_DOT_RADIUS;
/** TTC's clear space between a beacon and a neighbouring dot, in overlay units. */
const BEACON_GAP = 4;
/** A dot's visible radius with its outline, over its authored radius. */
const STATION_DOT_OUTLINE_RATIO = 1.15;

/** Every station dot in the stations layer's space, where overlays are drawn. */
function stationBeaconNeighbours(stationsLayer: SVGElement): StationBeaconNeighbour[] {
  return [...stationsLayer.querySelectorAll<SVGElement>(':scope > [id^="station-"]')].flatMap((station) => (
    regionalStationVisualAnchors(station).map((anchor) => ({
      id: anchor.id,
      center: anchor.point,
      radius: anchor.radius * STATION_DOT_OUTLINE_RATIO,
    }))
  ));
}

/** A pill-shaped marker (Union), with its authored outline, in overlay coordinates. */
export function regionalStationPill(shape: SVGElement | null): MapStationPill | undefined {
  if (!shape?.matches("rect")) return undefined;
  const number = (name: string) => Number.parseFloat(shape.getAttribute(name) ?? "0") || 0;
  const origin = pointInRegionalStationsLayer(shape, { x: 0, y: 0 });
  const xBasis = pointInRegionalStationsLayer(shape, { x: 1, y: 0 });
  const yBasis = pointInRegionalStationsLayer(shape, { x: 0, y: 1 });
  const a = xBasis.x - origin.x;
  const b = xBasis.y - origin.y;
  const style = window.getComputedStyle(shape);
  const rx = shape.hasAttribute("rx") ? number("rx") : number("ry");
  const ry = shape.hasAttribute("ry") ? number("ry") : rx;
  return {
    x: number("x"),
    y: number("y"),
    width: number("width"),
    height: number("height"),
    rx,
    ry,
    transform: `matrix(${[a, b, yBasis.x - origin.x, yBasis.y - origin.y, origin.x, origin.y].join(" ")})`,
    scale: Math.hypot(a, b),
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
  };
}

/**
 * Every GO/UP station alert, in the shared overlay model, drawn in the
 * stations layer's coordinates. An alert sits on the platform of its line
 * where the station has one per line (Bloor's UP and KI dots).
 */
export function regionalStationAlerts(
  svg: SVGSVGElement,
  data: StationImpactDirectionData & {
    stationNodeImpacts: StationNodeImpact[];
    stations: Pick<Station, "id" | "name">[];
  },
  unit: number,
): { alerts: MapStationAlert[]; glyphs: MapStationDirectionGlyph[] } {
  const stationsLayer = svg.querySelector<SVGElement>("#regional-stations-layer");
  if (!stationsLayer) return { alerts: [], glyphs: [] };
  const stationNames = new Map(data.stations.map((station) => [station.id, station.name]));

  const placed = data.stationNodeImpacts.flatMap((impact) => {
    const stationVisual = svg.querySelector<SVGElement>(`#station-${CSS.escape(impact.stationId)}`);
    if (!stationVisual) return [];
    const lineId = stationImpactDirectionSource(impact, data)?.lineId;
    return [{ impact, anchors: regionalStationImpactAnchors(stationVisual, lineId) }];
  });
  const neighbours = stationBeaconNeighbours(stationsLayer);
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
        const coreRadius = anchor.radius * CORE_RATIO;
        return {
          id: anchor.id,
          center: anchor.point,
          coreRadius,
          ringRadius: coreRadius * STATION_IMPACT_RING_SCALE,
          beaconRadius: stationImpactBeaconSize(
            anchor.point,
            coreRadius,
            neighbours,
            alertedAnchorIds,
            BEACON_GAP * unit,
          ).radius,
          pill: regionalStationPill(svg.querySelector<SVGElement>(`#${CSS.escape(anchor.id)}`)),
        };
      }),
    };
  });

  const glyphs = stationDirectionGlyphs(
    placed.flatMap(({ impact, anchors }) => anchors.map((anchor) => ({
      impact,
      anchor: { id: anchor.id, center: anchor.point, badgeRadius: anchor.radius * DIRECTION_BADGE_RATIO },
    }))),
    data,
  );
  return { alerts, glyphs };
}
