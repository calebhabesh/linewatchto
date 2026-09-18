/**
 * Geographic Catalog Data Contract & Types (Boundary 1)
 *
 * Defines static coordinates, route-link geometry, coverage, and provenance.
 * Strictly independent of React, DOM, and MapLibre.
 */

export type GeographicCoordinate = [number, number]; // [longitude, latitude]

export type GeographicStationProperties = {
  featureType: "station";
  stationId: string;
  name: string;
  network: "ttc" | "regional";
  lineIds: string[];
  gtfsStopId: string;
};

export type GeographicLinkProperties = {
  featureType: "link";
  segmentId: string;
  lineId: string;
  routeCode?: string;
  network: "ttc" | "regional";
  stationAId: string;
  stationBId: string;
  direction?: string;
  gtfsShapeId?: string;
};

export type GeographicStationFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: GeographicCoordinate;
  };
  properties: GeographicStationProperties;
};

export type GeographicLinkFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "LineString";
    coordinates: GeographicCoordinate[];
  };
  properties: GeographicLinkProperties;
};

export type GeographicFeature = GeographicStationFeature | GeographicLinkFeature;

export type GeographicCoverageItem = {
  id: string;
  reason: string;
  stationOnlyPossible?: boolean;
};

export type GeographicCoverage = {
  status: "complete" | "partial" | "unavailable";
  stationCount: number;
  linkCount: number;
  missingStations: GeographicCoverageItem[];
  missingLinks: GeographicCoverageItem[];
};

export type GeographicCatalog = {
  type: "FeatureCollection";
  network: "ttc" | "regional";
  features: GeographicFeature[];
  coverage: GeographicCoverage;
};

export type GeographicNetworkSource = {
  feedVersion: string;
  feedStartDate: string;
  feedEndDate: string;
  sourceName: string;
  publisher: string;
  license: string;
  attribution: string;
};

export type GeographicNetworkManifestEntry = {
  assetUrl: string;
  contentHash: string;
  stationCount: number;
  linkCount: number;
  coverageStatus: string;
  feedVersion?: string;
  feedStartDate?: string;
  feedEndDate?: string;
  sourceName?: string;
  publisher?: string;
  license?: string;
  attribution?: string;
  sources?: Record<string, GeographicNetworkSource>;
};

export type GeographicManifest = {
  schemaVersion: string;
  contentVersion: string;
  generatedAt: string;
  networks: {
    ttc: GeographicNetworkManifestEntry;
    regional: GeographicNetworkManifestEntry;
  };
};

export function isGeographicStationFeature(
  feature: GeographicFeature,
): feature is GeographicStationFeature {
  return feature.properties.featureType === "station" && feature.geometry.type === "Point";
}

export function isGeographicLinkFeature(
  feature: GeographicFeature,
): feature is GeographicLinkFeature {
  return feature.properties.featureType === "link" && feature.geometry.type === "LineString";
}

export function getStationFeatures(catalog: GeographicCatalog): GeographicStationFeature[] {
  return catalog.features.filter(isGeographicStationFeature);
}

export function getLinkFeatures(catalog: GeographicCatalog): GeographicLinkFeature[] {
  return catalog.features.filter(isGeographicLinkFeature);
}

export function findStationFeature(
  catalog: GeographicCatalog,
  stationId: string,
): GeographicStationFeature | undefined {
  return getStationFeatures(catalog).find((f) => f.properties.stationId === stationId);
}

export function findLinkFeaturesForStation(
  catalog: GeographicCatalog,
  stationId: string,
): GeographicLinkFeature[] {
  return getLinkFeatures(catalog).filter(
    (f) => f.properties.stationAId === stationId || f.properties.stationBId === stationId,
  );
}
