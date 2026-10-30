import type { ActiveAlert, ImpactKind, NetworkSegment, StationNodeImpact } from "./linewatch-data.ts";
import type { MapLineAlert, MapOverlayVisualState } from "../components/map-overlays/line-alert-model.ts";
import type { MapOverlayPlane } from "../components/map-overlays/overlay-plane.ts";
import {
  REGIONAL_MAP_VIEWBOX,
  REGIONAL_OVERLAY_UNIT,
  authoredRegionalCorridorPathData,
  continuousRegionalOverlayRunPath,
  pointInSvgRootCoordinates,
  regionalSvgScope,
  resolvedRegionalSegmentPath,
} from "./regional-map-geometry.ts";
import { regionalImpactPriority, regionalOverlayRuns, type RegionalOverlayPiece } from "./regional-map-overlays.ts";

/** Covers Union's authored border, so the outline disappears behind the pill. */
const REGIONAL_UNION_OUTLINE_CUTOUT_STROKE_WIDTH = 96;


/**
 * GO/UP planned-closure impacts are previews of upcoming work, drawn like
 * TTC's planned previews. (TTC draws an active closure in suspension red.)
 */
export function regionalLineAlertVisualState(kind: ImpactKind): MapOverlayVisualState {
  switch (kind) {
    case "suspension":
      return "suspension";
    case "planned-closure":
      return "planned-preview";
    case "reduced-speed-zone":
      return "reduced-speed-zone";
    case "delay":
    default:
      return "delay-static";
  }
}

function segmentsLabel(segments: Pick<NetworkSegment, "label">[]): string {
  if (segments.length === 0) return "Rail corridor";
  if (segments.length === 1) return segments[0].label;
  const first = segments[0];
  const last = segments.at(-1) ?? first;
  return `${first.label} through ${last.label}`;
}

/**
 * Every GO/UP line alert, in the shared overlay model. Paths come from the
 * authored corridors in the stations layer, where the overlays are drawn.
 */
export function regionalLineAlerts(
  svg: SVGSVGElement,
  data: {
    activeAlerts: ActiveAlert[];
    networkSegments: NetworkSegment[];
    stationNodeImpacts: Pick<StationNodeImpact, "cardId">[];
  },
): MapLineAlert[] {
  const documentNode = regionalSvgScope(svg);
  const alerts: MapLineAlert[] = [];

  // Alerts without listed segments cover their whole corridor.
  const stationOnlyImpactIds = new Set(data.stationNodeImpacts.map((impact) => impact.cardId));
  for (const alert of data.activeAlerts) {
    if (alert.affectedSegmentIds.length > 0 || stationOnlyImpactIds.has(alert.id)) continue;
    const pathD = authoredRegionalCorridorPathData(documentNode, alert.lineId);
    if (!pathD) continue;
    const kind: ImpactKind = alert.severity === "planned" ? "planned-closure" : alert.severity;
    const segments = data.networkSegments.filter((segment) => segment.lineId === alert.lineId);
    alerts.push({
      key: `corridor:${kind}:${alert.id}:${alert.lineId}`,
      kind,
      impactId: alert.id,
      lineId: alert.lineId,
      pathD,
      travelDirection: "bidirectional",
      visualState: regionalLineAlertVisualState(kind),
      label: `${kind}: ${alert.lineNumber} ${alert.title}`,
      segmentIds: segments.map((segment) => segment.id),
    });
  }

  // Segment impacts join into one tube per connected run of segments.
  const pieces: RegionalOverlayPiece[] = [];
  for (const segment of data.networkSegments) {
    if (!segment.impacts?.length) continue;
    const pathD = resolvedRegionalSegmentPath(documentNode, segment);
    if (!pathD) continue;
    for (const [impactIndex, impact] of segment.impacts.entries()) {
      pieces.push({ segment, impact, impactIndex, pathD });
    }
  }
  for (const run of regionalOverlayRuns(pieces)) {
    const lineSegmentIds = data.networkSegments
      .filter((segment) => segment.lineId === run.lineId)
      .map((segment) => segment.id);
    const runSegmentIds = new Set(run.segments.map((segment) => segment.id));
    const coversFullCorridor = lineSegmentIds.length === run.segments.length
      && lineSegmentIds.every((segmentId) => runSegmentIds.has(segmentId));
    const pathD = coversFullCorridor
      ? authoredRegionalCorridorPathData(documentNode, run.lineId) ?? run.pathD
      : continuousRegionalOverlayRunPath(documentNode, run) ?? run.pathD;
    const segmentIds = run.segments.map((segment) => segment.id);
    alerts.push({
      key: `${run.impact.kind}:${run.impact.cardId}:${run.impact.travelDirection}:${[...segmentIds].sort().join(",")}`,
      kind: run.impact.kind,
      impactId: run.impact.cardId,
      lineId: run.lineId,
      pathD,
      travelDirection: run.impact.travelDirection,
      visualState: regionalLineAlertVisualState(run.impact.kind),
      label: `${run.impact.kind}: ${segmentsLabel(run.segments)}`,
      segmentIds,
    });
  }

  return alerts.sort((left, right) => (
    regionalImpactPriority(left.kind) - regionalImpactPriority(right.kind)
    || left.impactId.localeCompare(right.impactId)
    || left.key.localeCompare(right.key)
  ));
}

/**
 * Where GO/UP draws overlays: inside its translated stations layer, at its
 * rail's scale. The hover outline stops at Union's pill instead of crossing it.
 */
export function regionalOverlayPlane(svg: SVGSVGElement): MapOverlayPlane | null {
  const stationsLayer = svg.querySelector<SVGGElement>("#regional-stations-layer");
  if (!stationsLayer) return null;
  const origin = pointInSvgRootCoordinates(stationsLayer, { x: 0, y: 0 });
  const xBasis = pointInSvgRootCoordinates(stationsLayer, { x: 1, y: 0 });
  const yBasis = pointInSvgRootCoordinates(stationsLayer, { x: 0, y: 1 });
  const matrix = [
    xBasis.x - origin.x, xBasis.y - origin.y,
    yBasis.x - origin.x, yBasis.y - origin.y,
    origin.x, origin.y,
  ];
  // The view box in the stations layer's coordinates (a translation), with a
  // margin so outlines near the edge are not clipped.
  const viewBox = REGIONAL_MAP_VIEWBOX;
  const maskBounds = {
    x: viewBox.x - origin.x - viewBox.width,
    y: viewBox.y - origin.y - viewBox.height,
    width: viewBox.width * 3,
    height: viewBox.height * 3,
  };
  const union = svg.querySelector<SVGRectElement>("rect#station-union");
  const number = (element: Element, name: string) => Number.parseFloat(element.getAttribute(name) ?? "0") || 0;
  const outlineCutouts = union
    ? [{
        x: number(union, "x"),
        y: number(union, "y"),
        width: number(union, "width"),
        height: number(union, "height"),
        rx: number(union, "rx"),
        ry: number(union, "ry") || number(union, "rx"),
        strokeWidth: REGIONAL_UNION_OUTLINE_CUTOUT_STROKE_WIDTH,
      }]
    : [];
  return {
    idPrefix: "regional",
    unit: REGIONAL_OVERLAY_UNIT,
    maskBounds,
    topPlaneTransform: `matrix(${matrix.join(" ")})`,
    outlineCutouts,
  };
}
