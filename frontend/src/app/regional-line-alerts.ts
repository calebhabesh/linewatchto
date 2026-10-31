import type {
  ActiveAlert,
  DelayAlert,
  ImpactKind,
  ImpactSelection,
  NetworkSegment,
  PlannedClosure,
  StationNodeImpact,
} from "./linewatch-data.ts";
import { lineAlertPaintOrder, type MapLineAlert } from "../components/map-overlays/line-alert-model.ts";
import type { MapOverlayPlane } from "../components/map-overlays/overlay-plane.ts";
import type { PreparedMapGeometry } from "./map-geometry-data.ts";
import {
  REGIONAL_OVERLAY_UNIT,
  authoredRegionalCorridorPathData,
  continuousRegionalOverlayRunPath,
  regionalStationPillShape,
  resolvedRegionalSegmentPath,
} from "./regional-map-geometry.ts";
import { regionalOverlayRuns, type RegionalOverlayPiece } from "./regional-map-overlays.ts";
import {
  isPlannedPreviewImpact,
  lineAlertLabel,
  lineAlertVisualState,
  mapImpactContext,
  mapPlannedPreviews,
  plannedPreviewLabel,
} from "./map-content-rules.ts";

/** Covers Union's authored border, so the outline disappears behind the pill. */
const REGIONAL_UNION_OUTLINE_CUTOUT_STROKE_WIDTH = 96;


/**
 * Every GO/UP line alert, in the shared overlay model, along the authored
 * routes; current service and planned previews by the shared rules
 * (map-content-rules.ts).
 */
export function regionalLineAlerts(
  geometry: PreparedMapGeometry,
  data: {
    activeAlerts: ActiveAlert[];
    delays: DelayAlert[];
    plannedClosures: PlannedClosure[];
    networkSegments: NetworkSegment[];
    stationNodeImpacts: Pick<StationNodeImpact, "cardId">[];
    selection: ImpactSelection;
  },
): MapLineAlert[] {
  const alerts: MapLineAlert[] = [];
  const context = mapImpactContext(data.networkSegments, data);

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
      visualState: lineAlertVisualState(kind, false),
      label: `${kind}: ${alert.lineNumber} ${alert.title}`,
      segmentIds: segments.map((segment) => segment.id),
    });
  }

  // Segment impacts join into one tube per connected run of segments.
  const pieces: RegionalOverlayPiece[] = [];
  for (const segment of context.segments) {
    if (!segment.impacts?.length) continue;
    const pathD = resolvedRegionalSegmentPath(geometry, segment);
    if (!pathD) continue;
    for (const [impactIndex, impact] of segment.impacts.entries()) {
      if (isPlannedPreviewImpact(impact, context)) continue;
      pieces.push({ segment, impact, impactIndex, pathD });
    }
  }
  // Planned previews, from either encoding, the same way.
  const previewPieces: RegionalOverlayPiece[] = [];
  const previews = new Map(mapPlannedPreviews(context, data.selection).map((preview) => [preview.id, preview]));
  for (const preview of previews.values()) {
    for (const segment of preview.segments) {
      const pathD = resolvedRegionalSegmentPath(geometry, segment);
      if (!pathD) continue;
      const impact = {
        kind: "planned-closure" as const,
        cardId: preview.id,
        travelDirection: preview.travelDirection,
        sourceAlertIds: [preview.id],
      };
      previewPieces.push({ segment, impact, impactIndex: 0, pathD });
    }
  }
  for (const [run, preview] of [
    ...regionalOverlayRuns(pieces).map((run) => [run, undefined] as const),
    ...regionalOverlayRuns(previewPieces).map((run) => [run, previews.get(run.impact.cardId)] as const),
  ]) {
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
      visualState: lineAlertVisualState(run.impact.kind, Boolean(preview)),
      label: preview ? plannedPreviewLabel(preview.closure, run.segments) : lineAlertLabel(run.impact.kind, run.segments),
      segmentIds,
    });
  }

  return lineAlertPaintOrder(alerts.sort((left, right) => (
    left.impactId.localeCompare(right.impactId) || left.key.localeCompare(right.key)
  )));
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
