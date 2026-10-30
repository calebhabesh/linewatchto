import type { ActiveAlert, ImpactKind, NetworkSegment, StationNodeImpact } from "./linewatch-data.ts";
import type { MapLineAlert, MapOverlayVisualState } from "../components/map-overlays/line-alert-model.ts";
import type { MapOverlayPlane } from "../components/map-overlays/overlay-plane.ts";
import type { PreparedMapGeometry } from "./map-geometry-data.ts";
import {
  REGIONAL_OVERLAY_UNIT,
  authoredRegionalCorridorPathData,
  continuousRegionalOverlayRunPath,
  regionalStationPillShape,
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

/** Every GO/UP line alert, in the shared overlay model, along the authored routes. */
export function regionalLineAlerts(
  geometry: PreparedMapGeometry,
  data: {
    activeAlerts: ActiveAlert[];
    networkSegments: NetworkSegment[];
    stationNodeImpacts: Pick<StationNodeImpact, "cardId">[];
  },
): MapLineAlert[] {
  const alerts: MapLineAlert[] = [];

  // Alerts without listed segments cover their whole corridor.
  const stationOnlyImpactIds = new Set(data.stationNodeImpacts.map((impact) => impact.cardId));
  for (const alert of data.activeAlerts) {
    if (alert.affectedSegmentIds.length > 0 || stationOnlyImpactIds.has(alert.id)) continue;
    const pathD = authoredRegionalCorridorPathData(geometry, alert.lineId);
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
    const pathD = resolvedRegionalSegmentPath(geometry, segment);
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
      ? authoredRegionalCorridorPathData(geometry, run.lineId) ?? run.pathD
      : continuousRegionalOverlayRunPath(geometry, run) ?? run.pathD;
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
 * Where GO/UP draws overlays: the root SVG's coordinates, at its rail's
 * scale. The hover outline stops at Union's pill instead of crossing it.
 */
export function regionalOverlayPlane(geometry: PreparedMapGeometry): MapOverlayPlane {
  // The view box with a margin, so outlines near the edge are not clipped.
  const { viewBox } = geometry;
  const maskBounds = {
    x: viewBox.x - viewBox.width,
    y: viewBox.y - viewBox.height,
    width: viewBox.width * 3,
    height: viewBox.height * 3,
  };
  const union = regionalStationPillShape(geometry, "station-union");
  // Cutouts are plain rectangles: Union's pill is only translated.
  const [a, b, c, d, e, f] = union?.matrix ?? [];
  const outlineCutouts = union && a === 1 && b === 0 && c === 0 && d === 1
    ? [{
        x: union.shape.x + e,
        y: union.shape.y + f,
        width: union.shape.width,
        height: union.shape.height,
        rx: union.shape.rx,
        ry: union.shape.ry,
        strokeWidth: REGIONAL_UNION_OUTLINE_CUTOUT_STROKE_WIDTH,
      }]
    : [];
  return {
    idPrefix: "regional",
    unit: REGIONAL_OVERLAY_UNIT,
    maskBounds,
    outlineCutouts,
  };
}
