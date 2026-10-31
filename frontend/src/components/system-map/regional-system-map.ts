/* The GO/UP System Map: manifest, prepared data and the GO/UP content adapter (loaded on demand). */
import { MAP_MANIFESTS } from "../../app/map-manifests";
import type { PreparedMapGeometry } from "../../app/map-geometry-data";
import preparedRegionalGeometry from "../../app/map-geometry/regional.json";
import { REGIONAL_MAP_ARTWORK } from "../../app/regional-map-asset";
import { regionalOverlayPlane } from "../../app/regional-line-alerts";
import { regionalMapContent, regionalTrainMarkerPlacement } from "../../app/regional-map-content";
import { defineSystemMap } from "./system-map-definition";

const geometry = preparedRegionalGeometry as unknown as PreparedMapGeometry;

export const REGIONAL_SYSTEM_MAP = defineSystemMap({
  manifest: MAP_MANIFESTS.regional,
  geometry,
  overlayPlane: regionalOverlayPlane(geometry),
  artwork: REGIONAL_MAP_ARTWORK,
  usesStationList: false,
  content: (input) => regionalMapContent(geometry, input),
  trainMarkers: {
    segments: (data) => data.networkSegments,
    placement: regionalTrainMarkerPlacement(geometry),
  },
});
