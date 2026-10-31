/*
 * The overlay rules every System Map's content adapter applies
 * (app/ttc-map-content.ts, app/regional-map-content.ts), so the same data
 * draws the same overlays on every map: which planned closures are current
 * service and which are previews, each alert's visual state and label, what
 * an overlap badge groups and how it is labelled, and station-alert sizes as
 * ratios of the dot they sit on. Paint order is one table,
 * `getImpactPriority` (map-alert-selector.ts), applied by
 * `lineAlertPaintOrder`. Adapters keep only network facts and how their
 * corridors are composed.
 */
import type {
  ActiveAlert,
  DelayAlert,
  ImpactSelection,
  MapImpact,
  MapImpactKind,
  NetworkSegment,
  PlannedClosure,
  TravelDirection,
} from "./linewatch-data.ts";
import {
  buildActiveClosureImpactCardIds,
  getEligiblePlannedClosures,
  normalizeActiveClosureMapImpact,
} from "./map-alert-selector.ts";
import type { MapOverlayVisualState } from "../components/map-overlays/line-alert-model.ts";
import {
  activeImpactsForSegment,
  hasOverlappingImpacts,
  overlapBadgeSignature,
  type OverlapBadgeSourceSegment,
} from "../components/map-overlap-badges.ts";
import { STATION_IMPACT_RING_SCALE } from "../components/station-impact-beacon.ts";

type ClosureData = {
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  plannedClosures: PlannedClosure[];
};

/**
 * The network's segments with every planned closure sorted by its timing.
 * A closure is current service when it is in effect now (`activeNow`,
 * `active-now`), is itself a current planned alert, or is linked from a
 * current alert; its segment impacts then take its current effect (and card)
 * where one is known. Every other planned closure is an upcoming preview,
 * whether a backend lists it in `previewSegmentIds` or in segment impacts.
 */
export type MapImpactContext<S extends NetworkSegment> = {
  /** The segments, with current closures' impacts as their current effect. */
  segments: S[];
  closureById: ReadonlyMap<string, PlannedClosure>;
  isCurrentClosure(id: string): boolean;
  /** Upcoming preview ids per segment id. */
  previewIdsBySegment: ReadonlyMap<string, string[]>;
  /** Upcoming previews: closures first, in their order, then ones only segment impacts name. */
  upcomingPreviewIds: string[];
};

export function mapImpactContext<S extends NetworkSegment>(segments: S[], data: ClosureData): MapImpactContext<S> {
  const { activeAlerts, delays, plannedClosures } = data;
  const activeCardIds = buildActiveClosureImpactCardIds(activeAlerts, plannedClosures, delays);
  const currentIds = new Set([
    ...getEligiblePlannedClosures(plannedClosures, activeAlerts, null, delays).currentPlannedClosureIds,
    ...activeCardIds.keys(),
  ]);
  const isCurrentClosure = (id: string) => currentIds.has(id);
  const closureById = new Map(plannedClosures.map((closure) => [closure.id, closure]));

  const normalized = segments.map((segment) => (
    segment.impacts?.some((impact) => impact.kind === "planned-closure")
      ? {
          ...segment,
          impacts: segment.impacts.map((impact) => (
            normalizeActiveClosureMapImpact(impact, activeCardIds, plannedClosures)
          )),
        }
      : segment
  ));

  const previewIdsBySegment = new Map<string, string[]>();
  const upcoming = new Set<string>();
  const addPreview = (segmentId: string, id: string) => {
    upcoming.add(id);
    const ids = previewIdsBySegment.get(segmentId);
    if (!ids) previewIdsBySegment.set(segmentId, [id]);
    else if (!ids.includes(id)) ids.push(id);
  };
  for (const closure of plannedClosures) {
    if (isCurrentClosure(closure.id)) continue;
    upcoming.add(closure.id);
    for (const segmentId of closure.previewSegmentIds) addPreview(segmentId, closure.id);
  }
  for (const segment of normalized) {
    for (const impact of segment.impacts ?? []) {
      if (impact.kind === "planned-closure" && !isCurrentClosure(impact.cardId)) addPreview(segment.id, impact.cardId);
    }
  }
  const closureOrder = new Map(plannedClosures.map((closure, index) => [closure.id, index]));
  const upcomingPreviewIds = [...upcoming].sort((a, b) => (
    (closureOrder.get(a) ?? Infinity) - (closureOrder.get(b) ?? Infinity)
  ));

  return { segments: normalized, closureById, isCurrentClosure, previewIdsBySegment, upcomingPreviewIds };
}

/** A segment impact that previews upcoming work rather than current service. */
export function isPlannedPreviewImpact(
  impact: Pick<MapImpact, "kind" | "cardId">,
  context: Pick<MapImpactContext<NetworkSegment>, "isCurrentClosure">,
): boolean {
  return impact.kind === "planned-closure" && !context.isCurrentClosure(impact.cardId);
}

/** The current service a segment carries (previews left out), each impact once. */
export function currentSegmentImpacts(
  segment: OverlapBadgeSourceSegment,
  context: Pick<MapImpactContext<NetworkSegment>, "isCurrentClosure">,
): MapImpact[] {
  return activeImpactsForSegment(segment).filter((impact) => !isPlannedPreviewImpact(impact, context));
}

export type MapPlannedPreview<S extends NetworkSegment> = {
  id: string;
  /** The closure, when the network lists it (a segment impact may name one it does not). */
  closure?: PlannedClosure;
  /** Its segments: the closure's preview order, then any others in network order. */
  segments: S[];
  travelDirection: TravelDirection;
};

/**
 * Planned previews to draw: every upcoming closure, and a current one while
 * it is selected (its planned extent, over its current effect).
 */
export function mapPlannedPreviews<S extends NetworkSegment>(
  context: MapImpactContext<S>,
  selection: ImpactSelection,
): MapPlannedPreview<S>[] {
  const ids = [...context.upcomingPreviewIds];
  if (selection?.kind === "planned-closure" && context.closureById.has(selection.id) && !ids.includes(selection.id)) {
    ids.push(selection.id);
  }
  return ids.flatMap((id): MapPlannedPreview<S>[] => {
    const closure = context.closureById.get(id);
    const listed = context.segments.filter((segment) => context.previewIdsBySegment.get(segment.id)?.includes(id));
    const segmentById = new Map(context.segments.map((segment) => [segment.id, segment]));
    const ordered = (closure?.previewSegmentIds ?? []).flatMap((segmentId) => {
      const segment = segmentById.get(segmentId);
      return segment ? [segment] : [];
    });
    const segments = [...new Set([...ordered, ...listed])];
    if (segments.length === 0) return [];
    const segmentImpact = segments
      .flatMap((segment) => segment.impacts ?? [])
      .find((impact) => impact.kind === "planned-closure" && impact.cardId === id);
    return [{
      id,
      closure,
      segments,
      travelDirection: closure?.travelDirection ?? segmentImpact?.travelDirection ?? "bidirectional",
    }];
  });
}

/** How a line alert draws: previews in planned blue, current service by its kind. */
export function lineAlertVisualState(kind: MapImpactKind, preview: boolean): MapOverlayVisualState {
  if (preview) return "planned-preview";
  switch (kind) {
    case "suspension":
    case "planned-closure":
      return "suspension";
    case "reduced-speed-zone":
      return "reduced-speed-zone";
    case "delay":
    default:
      return "delay-static";
  }
}

/** The stretch a run of segments covers, by its ends' segment labels. */
export function segmentsLabel(segments: Pick<NetworkSegment, "label">[]): string {
  if (segments.length === 0) return "Line corridor";
  if (segments.length === 1) return segments[0].label;
  const first = segments[0];
  const last = segments.at(-1) ?? first;
  return `${first.label} through ${last.label}`;
}

/** A current line alert's accessible name. */
export function lineAlertLabel(kind: MapImpactKind, segments: Pick<NetworkSegment, "label">[]): string {
  return `${kind}: ${segmentsLabel(segments)}`;
}

/** A planned preview's accessible name: the closure and where it is. */
export function plannedPreviewLabel(
  closure: Pick<PlannedClosure, "title" | "location"> | undefined,
  segments: Pick<NetworkSegment, "label">[],
): string {
  return `${closure?.title ?? "Planned closure"}: ${closure?.location || segmentsLabel(segments)}`;
}

/**
 * A stretch badge's label: from the first segment's start to the last one's
 * end ("Alder to Cedar"), or the segments' own labels where those meet.
 */
export function overlapStretchLabel(segments: Pick<NetworkSegment, "label">[]): string {
  if (segments.length <= 1) return segmentsLabel(segments);
  const start = segments[0].label.split(" to ")[0];
  const end = segments.at(-1)?.label.split(" to ").at(-1) ?? start;
  return start === end ? segmentsLabel(segments) : `${start} to ${end}`;
}

/** What a segment's overlap badge counts: its current service and its upcoming previews, each once. */
export function overlapBadgeImpactsForSegment(
  segment: NetworkSegment,
  context: Pick<MapImpactContext<NetworkSegment>, "isCurrentClosure" | "previewIdsBySegment">,
): MapImpact[] {
  const impactsByKey = new Map<string, MapImpact>();
  for (const impact of currentSegmentImpacts(segment, context)) {
    impactsByKey.set(`${impact.kind}:${impact.cardId}`, impact);
  }
  for (const id of context.previewIdsBySegment.get(segment.id) ?? []) {
    impactsByKey.set(`planned-closure:${id}`, {
      kind: "planned-closure",
      cardId: id,
      travelDirection: "bidirectional",
      sourceAlertIds: [id],
    });
  }
  return [...impactsByKey.values()];
}

export type MapOverlapBadgeGroup<S extends NetworkSegment> = {
  signature: string;
  segments: S[];
  impacts: MapImpact[];
};

/** Segments whose alerts overlap, grouped by the alerts they share. */
export function overlapBadgeGroups<S extends NetworkSegment>(context: MapImpactContext<S>): MapOverlapBadgeGroup<S>[] {
  const groups = new Map<string, MapOverlapBadgeGroup<S>>();
  for (const segment of context.segments) {
    const impacts = overlapBadgeImpactsForSegment(segment, context);
    if (!hasOverlappingImpacts(impacts)) continue;
    const signature = overlapBadgeSignature(impacts);
    const group = groups.get(signature);
    if (group) group.segments.push(segment);
    else groups.set(signature, { signature, segments: [segment], impacts });
  }
  return [...groups.values()].sort((a, b) => (
    (a.segments[0]?.id ?? "").localeCompare(b.segments[0]?.id ?? "") || a.signature.localeCompare(b.signature)
  ));
}

/** Upcoming closures as the station badges' preview source, including ones only segment impacts name. */
export function overlapPreviewClosures(
  context: Pick<MapImpactContext<NetworkSegment>, "previewIdsBySegment">,
): Pick<PlannedClosure, "id" | "previewSegmentIds">[] {
  const segmentIdsById = new Map<string, string[]>();
  for (const [segmentId, ids] of context.previewIdsBySegment) {
    for (const id of ids) segmentIdsById.set(id, [...(segmentIdsById.get(id) ?? []), segmentId]);
  }
  return [...segmentIdsById].map(([id, previewSegmentIds]) => ({ id, previewSegmentIds }));
}

/*
 * Station alerts are drawn to TTC's design for its regular dot (authored
 * radius 32): a 26-unit core and a ring 38/26 of it. Every dot takes these
 * as ratios of its own prepared radius; the direction arrow's badge fills
 * the dot's white, inside its outline.
 */
const DESIGN_DOT_RADIUS = 32;
const CORE_RATIO = 26 / DESIGN_DOT_RADIUS;

/** A prepared station dot: radius to the middle of its outline, and the outline's width. */
export type StationDot = { radius: number; outline: number };

export type StationAlertSizes = {
  coreRadius: number;
  ringRadius: number;
  /** The dot's white: the arrow badge covers exactly this. */
  directionBadgeRadius: number;
  /** The dot with its outline: what a neighbouring beacon keeps clear of. */
  dotOuterRadius: number;
};

/** A station alert's sizes on this dot. */
export function stationAlertSizes(dot: StationDot): StationAlertSizes {
  const coreRadius = dot.radius * CORE_RATIO;
  return {
    coreRadius,
    ringRadius: coreRadius * STATION_IMPACT_RING_SCALE,
    directionBadgeRadius: dot.radius - dot.outline / 2,
    dotOuterRadius: dot.radius + dot.outline / 2,
  };
}
