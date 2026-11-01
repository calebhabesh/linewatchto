/* The TTC subway System Map: manifest, prepared data and the TTC content adapter. */
import { MAP_MANIFESTS } from "../../app/map-manifests";
import type { PreparedMapGeometry } from "../../app/map-geometry-data";
import preparedTtcGeometry from "../../app/map-geometry/ttc.json";
import { TTC_TRAIN_MARKER_PLACEMENT, ttcMapContent, ttcRenderedNetworkSegments } from "../../app/ttc-map-content";
import { defineSystemMap, type SystemMapNetworkAdapter } from "./system-map-definition";

/**
 * The TTC network's adapter for one of its maps: TTC content over that map's
 * prepared geometry. TTC's station catalog carries the map's coordinates.
 */
export function ttcSystemMapAdapter(geometry: PreparedMapGeometry): SystemMapNetworkAdapter {
  return {
    placesUndrawnStations: true,
    content: ({ stations, stationList, ...input }) => ttcMapContent(geometry, {
      ...input,
      mapStations: stations,
      stations: stationList,
    }),
    trainMarkers: {
      segments: ({ stations, ...data }) => ttcRenderedNetworkSegments(geometry, { ...data, mapStations: stations }),
      placement: TTC_TRAIN_MARKER_PLACEMENT,
    },
  };
}

const geometry = preparedTtcGeometry as unknown as PreparedMapGeometry;

export const TTC_SYSTEM_MAP = defineSystemMap({
  manifest: MAP_MANIFESTS.ttc,
  geometry,
  ...ttcSystemMapAdapter(geometry),
});
