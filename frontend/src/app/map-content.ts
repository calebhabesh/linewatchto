/*
 * What a System Map draws over its artwork, as plain data built per render
 * from dashboard data by the network's content adapter
 * (`ttcMapContent`, `regionalMapContent`). Network differences (which alerts
 * exist, how they are classified, sizes taken from the artwork) live only in
 * the adapters; the map renders any `MapContent` the same way.
 */
import type { MapImpact } from "./linewatch-data.ts";
import type { MapBounds, MapPoint } from "./map-geometry.ts";
import type { MapLineAlert } from "../components/map-overlays/line-alert-model.ts";
import type { MapStationAlert, MapStationDirectionGlyph } from "../components/map-overlays/station-alert-model.ts";
import type { MapCommutePreview } from "../components/map-overlays/commute-preview-model.ts";
import type { MapOverlapIndicatorSize } from "../components/map-overlap-badges.ts";
import type { ConnectorOutline, OverlapBadgeConnector } from "../components/overlap-badge-connector.ts";
import {
  layoutMapOverlapBadges,
  mapBadgeAlertCorridors,
  type MapBadgeArtwork,
} from "../components/map-overlays/overlap-badge-layout.ts";
import { stationAlertPlacementAnchors } from "../components/map-overlays/overlay-obstacles.ts";

/** An overlap badge before placement: where its alerts meet, in overlay coordinates. */
export type MapOverlapBadgeInput = {
  /** The badge's id on the map; its chooser keys on it. */
  markerId: string;
  /** The placement's id; equal ids keep their placement across renders. */
  layoutId: string;
  label: string;
  impacts: MapImpact[];
  anchor: MapPoint;
  /** Where the badge sits until placed. */
  position: MapPoint;
  /** Points along the overlays this badge explains; placement stays close to them. */
  placementTargets: MapPoint[];
  /** A station badge's station, where its alerts meet. */
  stationPoint?: MapPoint;
  /** Layout size, before the map's badge scale. */
  size: MapOverlapIndicatorSize;
};

/** A badge as placed by the shared layout (map-overlays/overlap-badge-layout.ts). */
export type MapPlacedOverlapBadge = MapOverlapBadgeInput & {
  collisionAvoided: boolean;
  /** Line to the overlay this badge explains. */
  connector: OverlapBadgeConnector | null;
  /** The visible overlays of the badge's alerts; its chooser keeps them uncovered. */
  affectedOutlines: ConnectorOutline[];
};

/** What overlap badges keep clear of on this map. */
export type MapBadgePlacement = {
  /** The map's artwork; the same object while it is unchanged, so placement is reused. */
  artwork: MapBadgeArtwork;
  /** Station dots a connector should not end on, with room for their rings. */
  stationDots: readonly { center: MapPoint; radius: number }[];
  /** How much larger than TTC's this map draws its badges. */
  badgeScale: number;
};

export type MapContent = {
  /** Every line alert, planned previews included, the most severe drawn last. */
  lineAlerts: MapLineAlert[];
  /** The selected line alert's emphasis (its whole corridor). */
  selectedLineAlerts: MapLineAlert[];
  stationAlerts: MapStationAlert[];
  stationDirectionGlyphs: MapStationDirectionGlyph[];
  /** The previewed commute; its route may have no drawable path. */
  commutePreview: MapCommutePreview | null;
  /** Each alert's corridor paths, by `kind:id`, for group and chooser outlines. */
  outlinePathsByImpact: Map<string, string[]>;
  overlapBadges: MapOverlapBadgeInput[];
  badgePlacement: MapBadgePlacement;
};

/** Places a map's overlap badges around its alerts, by the shared layout. */
export function placeMapOverlapBadges(
  content: Pick<MapContent, "lineAlerts" | "stationAlerts" | "overlapBadges" | "badgePlacement">,
  { unit, mapBounds }: { unit: number; mapBounds: MapBounds },
): MapPlacedOverlapBadge[] {
  const { artwork, stationDots, badgeScale } = content.badgePlacement;
  const layouts = layoutMapOverlapBadges({
    badges: content.overlapBadges.map((badge) => ({
      id: badge.layoutId,
      impacts: badge.impacts,
      size: { width: badge.size.width * badgeScale, height: badge.size.height * badgeScale },
      targets: badge.placementTargets,
      stationPoint: badge.stationPoint,
    })),
    artwork,
    corridors: mapBadgeAlertCorridors(content.lineAlerts, unit),
    stationAlerts: stationAlertPlacementAnchors(content.stationAlerts, unit, badgeScale),
    stationDots,
    mapBounds,
    unit,
    badgeScale,
  });
  return content.overlapBadges.map((badge) => {
    const layout = layouts.get(badge.layoutId);
    return {
      ...badge,
      position: layout?.position ?? badge.position,
      collisionAvoided: layout?.collisionAvoided ?? false,
      connector: layout?.connector ?? null,
      affectedOutlines: layout?.affectedOutlines ?? [],
    };
  });
}

function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * `next`'s items, reusing each of `previous`'s that is drawn the same (same
 * key and content), and `previous` itself when nothing changed. Memoized
 * overlays then redraw only what changed: each poll parses fresh arrays, and
 * a selection rebuilds the content.
 */
export function reuseMapItems<T extends { key: string }>(previous: readonly T[], next: T[]): T[] {
  const previousByKey = new Map(previous.map((item) => [item.key, item]));
  let changed = previous.length !== next.length;
  const items = next.map((item, index) => {
    const prior = previousByKey.get(item.key);
    if (prior && sameJson(prior, item)) {
      if (previous[index] !== prior) changed = true;
      return prior;
    }
    changed = true;
    return item;
  });
  return changed ? items : previous as T[];
}

/** `next`, keeping each of `previous`'s parts that is unchanged (see `reuseMapItems`). */
export function reuseMapContent(previous: MapContent | null, next: MapContent): MapContent {
  if (!previous) return next;
  const content: MapContent = {
    lineAlerts: reuseMapItems(previous.lineAlerts, next.lineAlerts),
    selectedLineAlerts: reuseMapItems(previous.selectedLineAlerts, next.selectedLineAlerts),
    stationAlerts: reuseMapItems(previous.stationAlerts, next.stationAlerts),
    stationDirectionGlyphs: reuseMapItems(previous.stationDirectionGlyphs, next.stationDirectionGlyphs),
    commutePreview: sameJson(previous.commutePreview, next.commutePreview) ? previous.commutePreview : next.commutePreview,
    outlinePathsByImpact: sameJson([...previous.outlinePathsByImpact], [...next.outlinePathsByImpact])
      ? previous.outlinePathsByImpact
      : next.outlinePathsByImpact,
    overlapBadges: sameJson(previous.overlapBadges, next.overlapBadges) ? previous.overlapBadges : next.overlapBadges,
    // A poll rebuilds the artwork as a new object; keeping the previous one
    // keeps the badge placement cached.
    badgePlacement: sameJson(previous.badgePlacement.artwork, next.badgePlacement.artwork)
      && sameJson(previous.badgePlacement.stationDots, next.badgePlacement.stationDots)
      && previous.badgePlacement.badgeScale === next.badgePlacement.badgeScale
      ? previous.badgePlacement
      : next.badgePlacement,
  };
  return (Object.keys(content) as (keyof MapContent)[]).every((key) => content[key] === previous[key])
    ? previous
    : content;
}

/** A `reuseMapContent` that remembers the content it last returned; one per map. */
export function mapContentReuser(): (next: MapContent) => MapContent {
  let previous: MapContent | null = null;
  return (next) => {
    previous = reuseMapContent(previous, next);
    return previous;
  };
}
