/*
 * The drop-in fixture map's manifest (plan 10 phase 6). It is not in
 * MAP_MANIFESTS or NETWORK_MAPS: the tools take it with `--manifest`, and only
 * the test harness renders it. It ships no raster planes, so the authored SVG
 * paints.
 */
import type { MapManifest } from "../../../src/app/map-manifests.ts";

const DROP_IN_MAP_MANIFEST: MapManifest<"drop-in"> = {
  id: "drop-in",
  network: "ttc",
  svg: "tests/fixtures/drop-in-map/drop-in-map.svg",
  geometry: "tests/fixtures/drop-in-map/drop-in-map.json",
  viewBox: { x: 0, y: 0, width: 2000, height: 1200 },
  stage: { width: 2000, height: 1200 },
  // Lines are 80 units wide, as TTC's are.
  overlayUnit: 1,
  contentBounds: { x: 100, y: 120, width: 1800, height: 960 },
  rasterPlanes: [],
  layers: {
    stations: "#drop-in-stations-layer",
    stationLabels: "#drop-in-station-labels-layer",
    lines: "#drop-in-lines-layer",
  },
  stationLabelLink: { kind: "attribute", attribute: "data-station-label-for" },
  stationPartSuffixes: [],
  stationHitPadding: { pointer: 6, touch: 22 },
  stationLabels: {
    targetPadding: { leading: 0, trailing: 40, y: 8 },
    hoverPadding: { leading: 0, trailing: 40, y: 8 },
    cutout: { kind: "use", idPrefix: "station-label-", dilate: 4 },
  },
  framing: {
    mobileZoom: 1,
    mobileCenterStationId: "birch",
    horizontalInsetRatio: 0.025,
  },
  compass: { x: 1760, y: 880, width: 120, height: 160 },
  attributionSource: "LineWatchTO fixture",
  label: "Drop-in fixture map",
  lineIds: ["line-a", "line-b"],
};

export default DROP_IN_MAP_MANIFEST;
