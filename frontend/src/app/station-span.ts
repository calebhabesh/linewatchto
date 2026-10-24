import { formatImpactLocation } from "./impact-location.ts";

/**
 * Which travel directions a station span affects.
 * - one-way: stations are in travel order (rendered with →)
 * - both-ways: every train through the span (rendered with ⇄)
 * - unspecified: the source does not establish a direction (rendered with a neutral –)
 */
export type StationSpanTravel = "one-way" | "both-ways" | "unspecified";

export type StationSpan = { from: string; to: string; travel: StationSpanTravel };

const ONE_WAY = /\s+(?:→|->)\s+/;
const BOTH_WAYS = /\s*(?:⇄|↔|<\s*-+\s*>)\s*/;
const UNSPECIFIED = /\s+to\s+/i;

const BIDIRECTIONAL_LABELS = new Set([
  "bidirectional", "both way", "both ways", "both directions", "in both directions",
  "northbound & southbound", "southbound & northbound", "eastbound & westbound", "westbound & eastbound",
]);

/** True when a direction line already says every direction is affected. */
export function isBidirectionalDirection(direction?: string | null): boolean {
  if (!direction) return false;
  return BIDIRECTIONAL_LABELS.has(direction.trim().toLowerCase().replace(/\s+/g, " "));
}

/**
 * Reads a span from rider-facing location text. A plain "to" makes no travel claim
 * unless the direction line states that both directions are affected.
 */
export function parseStationSpan(location: string | null | undefined, direction?: string | null): StationSpan | null {
  const text = formatImpactLocation(location ?? "").trim();
  if (!text) return null;
  for (const [pattern, travel] of [[ONE_WAY, "one-way"], [BOTH_WAYS, "both-ways"], [UNSPECIFIED, "unspecified"]] as const) {
    const parts = text.split(pattern);
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) continue;
    const resolved = travel === "unspecified" && isBidirectionalDirection(direction) ? "both-ways" : travel;
    return { from: parts[0].trim(), to: parts[1].trim(), travel: resolved };
  }
  return null;
}

/** Plain-text span for labels, search results, and other text-only surfaces. */
export function formatStationSpanText(span: StationSpan): string {
  const connector = span.travel === "one-way" ? "→" : span.travel === "both-ways" ? "⇄" : "–";
  return `${span.from} ${connector} ${span.to}`;
}

/** Screen-reader wording; the visible arrows are decorative. */
export function stationSpanAccessibleText(span: StationSpan): string {
  return `${span.from} to ${span.to}${span.travel === "both-ways" ? ", both directions" : ""}`;
}

/** Prefer the backend's direction-aware span; older payloads only carry source text. */
export function withDisplayLocation<T extends { location: string | null; displayLocation?: string | null }>(item: T): T {
  const display = item.displayLocation?.trim();
  return display ? { ...item, location: display } : item;
}

type ImpactCollections<A, D, Z, P> = { activeAlerts: A[]; delays: D[]; reducedSpeedZones: Z[]; plannedClosures: P[] };
type Located = { location: string; displayLocation?: string | null };
type ZoneLike = Located & { directionalDetails?: Located[] };

/** Applies direction-aware spans to every dashboard impact collection. */
export function withDisplayLocations<A extends Located, D extends Located, Z extends ZoneLike, P extends Located>(
  data: ImpactCollections<A, D, Z, P>,
): ImpactCollections<A, D, Z, P> {
  return {
    activeAlerts: data.activeAlerts.map(withDisplayLocation),
    delays: data.delays.map(withDisplayLocation),
    reducedSpeedZones: data.reducedSpeedZones.map((zone) => ({
      ...withDisplayLocation(zone),
      ...(zone.directionalDetails ? { directionalDetails: zone.directionalDetails.map(withDisplayLocation) } : {}),
    })),
    plannedClosures: data.plannedClosures.map(withDisplayLocation),
  };
}
