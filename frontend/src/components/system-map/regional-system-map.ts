/* The GO/UP System Map: manifest, prepared data and the GO/UP content adapter. */
import { MAP_MANIFESTS } from "../../app/map-manifests";
import type { PreparedMapGeometry } from "../../app/map-geometry-data";
import preparedRegionalGeometry from "../../app/map-geometry/regional.json";
import { mapStationArtwork } from "../../app/map-station-artwork";
import { DEFAULT_REGIONAL_MAP_SOURCE, prepareRegionalMapMarkup } from "../../app/regional-map-asset";
import { regionalOverlayPlane } from "../../app/regional-line-alerts";
import { regionalMapContent, regionalTrainMarkerPlacement } from "../../app/regional-map-content";
import type { SystemMapDefinition } from "./system-map-definition";

const manifest = MAP_MANIFESTS.regional;
const geometry = preparedRegionalGeometry as unknown as PreparedMapGeometry;

export const REGIONAL_SYSTEM_MAP: SystemMapDefinition = {
  manifest,
  network: "regional",
  geometry,
  stationArtwork: mapStationArtwork(geometry, manifest.stationPartSuffixes),
  overlayPlane: regionalOverlayPlane(geometry),
  artwork: { url: DEFAULT_REGIONAL_MAP_SOURCE, prepare: prepareRegionalMapMarkup },
  content: (input) => regionalMapContent(geometry, input),
  trainMarkers: {
    segments: (data) => data.networkSegments,
    placement: regionalTrainMarkerPlacement(geometry),
  },
};
