/* The TTC subway System Map: manifest, prepared data and the TTC content adapter. */
import { MAP_MANIFESTS } from "../../app/map-manifests";
import type { PreparedMapGeometry } from "../../app/map-geometry-data";
import preparedTtcGeometry from "../../app/map-geometry/ttc.json";
import { mapStationArtwork } from "../../app/map-station-artwork";
import { DEFAULT_TTC_MAP_SOURCE, prepareTtcMapMarkup } from "../../app/map-preload";
import { TTC_TRAIN_MARKER_PLACEMENT, ttcMapContent, ttcRenderedNetworkSegments } from "../../app/ttc-map-content";
import type { SystemMapDefinition } from "./system-map-definition";

const manifest = MAP_MANIFESTS.ttc;
const geometry = preparedTtcGeometry as unknown as PreparedMapGeometry;

export const TTC_SYSTEM_MAP: SystemMapDefinition = {
  manifest,
  network: "ttc",
  geometry,
  stationArtwork: mapStationArtwork(geometry, manifest.stationPartSuffixes),
  overlayPlane: {
    idPrefix: "ttc",
    unit: manifest.overlayUnit,
    maskBounds: manifest.viewBox,
    outlineCutouts: [],
  },
  artwork: { url: DEFAULT_TTC_MAP_SOURCE, prepare: prepareTtcMapMarkup },
  content: ({ stations, stationList, ...input }) => ttcMapContent(geometry, {
    ...input,
    mapStations: stations,
    stations: stationList ?? [],
  }),
  trainMarkers: {
    segments: ({ stations, ...data }) => ttcRenderedNetworkSegments(geometry, { ...data, mapStations: stations }),
    placement: TTC_TRAIN_MARKER_PLACEMENT,
  },
};
