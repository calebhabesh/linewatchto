import type { GeographicCatalog, GeographicCoordinate } from "./geographic-catalog";

export const GEOGRAPHIC_LINE_BADGE_FULL_ZOOM = 10;
export const GEOGRAPHIC_LINE_BADGE_HALF_ZOOM = 12;
export const GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM = 14;

type GeographicLineBadgeAnchor = {
  id: string;
  lineId: string;
  lineNumber: string;
  stationId: string;
  offset: [number, number];
};

// These anchors deliberately follow route topology instead of geographic
// centroids. Line 1 includes termini and intermediate anchors on both arms.
export const TTC_GEOGRAPHIC_LINE_BADGE_ANCHORS: readonly GeographicLineBadgeAnchor[] = [
  { id: "line-1-vmc", lineId: "line-1", lineNumber: "1", stationId: "vaughan-metropolitan-centre", offset: [-20, -18] },
  { id: "line-1-st-george", lineId: "line-1", lineNumber: "1", stationId: "st-george", offset: [-22, -20] },
  { id: "line-1-union", lineId: "line-1", lineNumber: "1", stationId: "union", offset: [0, 23] },
  { id: "line-1-bloor-yonge", lineId: "line-1", lineNumber: "1", stationId: "bloor-yonge", offset: [22, -20] },
  { id: "line-1-finch", lineId: "line-1", lineNumber: "1", stationId: "finch", offset: [18, -18] },
  { id: "line-2-kipling", lineId: "line-2", lineNumber: "2", stationId: "kipling", offset: [-20, 10] },
  { id: "line-2-ossington", lineId: "line-2", lineNumber: "2", stationId: "ossington", offset: [0, -22] },
  { id: "line-2-pape", lineId: "line-2", lineNumber: "2", stationId: "pape", offset: [0, -22] },
  { id: "line-2-kennedy", lineId: "line-2", lineNumber: "2", stationId: "kennedy", offset: [22, 8] },
  { id: "line-4-sheppard-yonge", lineId: "line-4", lineNumber: "4", stationId: "sheppard-yonge", offset: [-22, 0] },
  { id: "line-4-don-mills", lineId: "line-4", lineNumber: "4", stationId: "don-mills", offset: [22, 0] },
  { id: "line-5-mount-dennis", lineId: "line-5", lineNumber: "5", stationId: "mount-dennis", offset: [-20, -12] },
  { id: "line-5-eglinton", lineId: "line-5", lineNumber: "5", stationId: "eglinton", offset: [0, -22] },
  { id: "line-5-aga-khan", lineId: "line-5", lineNumber: "5", stationId: "aga-khan-park-and-museum", offset: [0, -22] },
  { id: "line-5-kennedy", lineId: "line-5", lineNumber: "5", stationId: "kennedy", offset: [22, -14] },
  { id: "line-6-humber-college", lineId: "line-6", lineNumber: "6", stationId: "humber-college", offset: [-20, -14] },
  { id: "line-6-finch-west", lineId: "line-6", lineNumber: "6", stationId: "finch-west", offset: [20, -14] },
] as const;

// Regional badges sit at outer termini and selected interior anchors so every
// corridor remains identifiable when map chrome obscures an edge of the full
// network overview. Avoid stacking eight labels around Union.
export const REGIONAL_GEOGRAPHIC_LINE_BADGE_ANCHORS: readonly GeographicLineBadgeAnchor[] = [
  { id: "regional-br-allandale", lineId: "regional-br", lineNumber: "BR", stationId: "allandale-waterfront", offset: [0, 20] },
  { id: "regional-br-aurora", lineId: "regional-br", lineNumber: "BR", stationId: "aurora", offset: [-20, 0] },
  { id: "regional-ki-stratford", lineId: "regional-ki", lineNumber: "KI", stationId: "stratford", offset: [20, 0] },
  { id: "regional-ki-georgetown", lineId: "regional-ki", lineNumber: "KI", stationId: "georgetown", offset: [0, -20] },
  { id: "regional-le-oshawa", lineId: "regional-le", lineNumber: "LE", stationId: "durham-college-oshawa", offset: [-20, 0] },
  { id: "regional-lw-hamilton", lineId: "regional-lw", lineNumber: "LW", stationId: "hamilton", offset: [-18, 18] },
  { id: "regional-lw-burlington", lineId: "regional-lw", lineNumber: "LW", stationId: "burlington", offset: [-18, -12] },
  { id: "regional-lw-niagara", lineId: "regional-lw", lineNumber: "LW", stationId: "niagara-falls", offset: [0, -20] },
  { id: "regional-mi-milton", lineId: "regional-mi", lineNumber: "MI", stationId: "milton", offset: [18, -12] },
  { id: "regional-rh-bloomington", lineId: "regional-rh", lineNumber: "RH", stationId: "bloomington", offset: [-20, 8] },
  { id: "regional-st-old-elm", lineId: "regional-st", lineNumber: "ST", stationId: "old-elm", offset: [-18, 12] },
  { id: "regional-up-pearson", lineId: "regional-up", lineNumber: "UP", stationId: "pearson-airport", offset: [20, -10] },
] as const;

export type GeographicLineBadgeFeature = GeoJSON.Feature<GeoJSON.Point, {
  anchorId: string;
  lineId: string;
  lineNumber: string;
  spriteId: string;
  offset: [number, number];
}>;

export function projectGeographicLineBadges(
  catalog: GeographicCatalog,
): GeoJSON.FeatureCollection<GeoJSON.Point, GeographicLineBadgeFeature["properties"]> {
  const anchors = catalog.network === "regional"
    ? REGIONAL_GEOGRAPHIC_LINE_BADGE_ANCHORS
    : TTC_GEOGRAPHIC_LINE_BADGE_ANCHORS;

  const stationCoordinates = new Map<string, GeographicCoordinate>();
  for (const feature of catalog.features) {
    if (feature.properties.featureType === "station" && feature.geometry.type === "Point") {
      stationCoordinates.set(feature.properties.stationId, feature.geometry.coordinates);
    }
  }

  return {
    type: "FeatureCollection",
    features: anchors.flatMap((anchor) => {
      const coordinates = stationCoordinates.get(anchor.stationId);
      if (!coordinates) return [];
      return [{
        type: "Feature" as const,
        id: `line-badge-${anchor.id}`,
        geometry: { type: "Point" as const, coordinates },
        properties: {
          anchorId: anchor.id,
          lineId: anchor.lineId,
          lineNumber: anchor.lineNumber,
          spriteId: `line-badge-${anchor.lineNumber}`,
          offset: anchor.offset,
        },
      }];
    }),
  };
}
