import type { NetworkSegment } from "./linewatch-data.ts";
import { REGIONAL_ROUTE_CARDINAL_DIRECTIONS, REGIONAL_ROUTE_DEFINITIONS } from "./regional-data.ts";
import { ENTIRE_LINE_LABEL, parseStationSpan } from "./station-span.ts";

type DirectedImpact = {
  lineId?: string;
  location?: string | null;
  displayDirection?: string | null;
  wholeLine?: boolean | null;
};

/**
 * GO/UP notices carry no both-ways direction text; their span's ⇄ states it. This names that pair
 * ("Eastbound & Westbound"), as TTC does. A one-way or unspecified span names no pair.
 */
function regionalBothWaysDirection(lineId: string | undefined, location: string | null | undefined): string | null {
  if (!lineId || parseStationSpan(location)?.travel !== "both-ways") return null;
  const route = REGIONAL_ROUTE_DEFINITIONS.find(({ id }) => id === lineId);
  return route ? REGIONAL_ROUTE_CARDINAL_DIRECTIONS[route.number].replace(/\s*\/\s*/g, " & ") : null;
}

/**
 * The direction line of an impact's card. A whole-line impact says "Entire Line" and which way:
 * "Entire Line · Eastbound & Westbound", "Entire Line · Westbound", "Entire Line · Towards Union
 * Station". With no established direction it says "Entire Line" alone. Display only:
 * `displayDirection` stays as supplied for code that reads a direction from it.
 */
export function impactDirectionLabel(impact: DirectedImpact): string | null {
  const direction = impact.displayDirection?.trim() || null;
  // Snapshots saved by earlier versions hold GO/UP directions that already carry the label.
  if (!impact.wholeLine || direction?.startsWith(ENTIRE_LINE_LABEL)) return direction;
  return [ENTIRE_LINE_LABEL, direction ?? regionalBothWaysDirection(impact.lineId, impact.location)]
    .filter(Boolean).join(" · ");
}

type Collections<A, D, P> = { activeAlerts: A[]; delays: D[]; plannedClosures: P[] };
type Affecting = { lineId: string; affectedSegmentIds: string[] };
type Previewing = { lineId: string; previewSegmentIds: string[] };

/** Marks TTC impacts whose segments cover every segment of their line; GO/UP's backend sends `wholeLine`. */
export function withWholeLineImpacts<A extends Affecting, D extends Affecting, P extends Previewing>(
  data: Collections<A, D, P>,
  segments: Pick<NetworkSegment, "id" | "lineId">[],
): Collections<A, D, P> {
  const byLine = new Map<string, string[]>();
  for (const { id, lineId } of segments) byLine.set(lineId, [...(byLine.get(lineId) ?? []), id]);
  const mark = <T extends { lineId: string }>(impact: T, segmentIds: string[] | null | undefined): T => {
    const all = byLine.get(impact.lineId);
    if (!all || !segmentIds || segmentIds.length < all.length) return impact;
    const covered = new Set(segmentIds);
    return all.every((id) => covered.has(id)) ? { ...impact, wholeLine: true } : impact;
  };
  return {
    activeAlerts: data.activeAlerts.map((alert) => mark(alert, alert.affectedSegmentIds)),
    delays: data.delays.map((delay) => mark(delay, delay.affectedSegmentIds)),
    plannedClosures: data.plannedClosures.map((closure) => mark(closure, closure.previewSegmentIds)),
  };
}
