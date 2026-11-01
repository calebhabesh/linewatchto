/* The GO/UP System Map: manifest, prepared data and the GO/UP content adapter (loaded on demand). */
import { MAP_MANIFESTS } from "../../app/map-manifests";
import type { PreparedMapGeometry } from "../../app/map-geometry-data";
import preparedRegionalGeometry from "../../app/map-geometry/regional.json";
import { regionalMapContent, regionalTrainMarkerPlacement } from "../../app/regional-map-content";
import { defineSystemMap, type SystemMapNetworkAdapter } from "./system-map-definition";

/** The GO/UP network's adapter for one of its maps, over that map's prepared geometry. */
export function regionalSystemMapAdapter(geometry: PreparedMapGeometry): SystemMapNetworkAdapter {
  return {
    placesUndrawnStations: false,
    content: (input) => regionalMapContent(geometry, input),
    trainMarkers: {
      segments: (data) => data.networkSegments,
      placement: regionalTrainMarkerPlacement(geometry),
    },
  };
}

const geometry = preparedRegionalGeometry as unknown as PreparedMapGeometry;

export const REGIONAL_SYSTEM_MAP = defineSystemMap({
  manifest: MAP_MANIFESTS.regional,
  geometry,
  ...regionalSystemMapAdapter(geometry),
});
