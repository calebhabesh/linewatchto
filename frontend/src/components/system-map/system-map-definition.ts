/*
 * What the System Map engine (SystemMap.tsx) needs from one map: its manifest
 * and prepared data, how to prepare its SVG, and its network's content
 * adapter. Everything else is the engine's. Built once per map, at module
 * load, by the map's definition module (ttc-system-map.ts, regional-system-map.ts).
 */
import type { MapManifest } from "../../app/map-manifests";
import type { PreparedMapGeometry } from "../../app/map-geometry-data";
import type { MapArtworkSource } from "../../app/map-artwork";
import type { MapContent } from "../../app/map-content";
import type { MapStationArtwork } from "../../app/map-station-artwork";
import type { DashboardData } from "../../app/DataContext";
import type { ImpactSelection, NetworkSegment } from "../../app/linewatch-data";
import type { AccountCommutePathPreview } from "../../app/commute-data";
import type { StationSummary } from "../../app/station-data";
import type { NetworkId } from "../../app/regional-data";
import type { MapOverlayPlane } from "../map-overlays/overlay-plane";
import type { MapTrainMarkerPlacement } from "../map-overlays/TrainMarkerLayer";

/** The dashboard data a map's overlays are built from. */
export type SystemMapData = Pick<
  DashboardData,
  "networkSegments" | "activeAlerts" | "delays" | "reducedSpeedZones" | "plannedClosures" | "stationNodeImpacts" | "stations"
>;

export type SystemMapContentInput = SystemMapData & {
  /** The shell's station list for this map, when it passes one (TTC). */
  stationList?: StationSummary[];
  selection: ImpactSelection;
  commutePathPreview: AccountCommutePathPreview | null;
};

export type SystemMapDefinition = {
  manifest: MapManifest;
  /** The network whose data the map shows and whose raster planes it uses. */
  network: NetworkId;
  geometry: PreparedMapGeometry;
  stationArtwork: readonly MapStationArtwork[];
  overlayPlane: MapOverlayPlane;
  /** The authored SVG, prepared as artwork only. */
  artwork: MapArtworkSource;
  /** The network's content adapter: what the map draws over its artwork. */
  content: (input: SystemMapContentInput) => MapContent;
  trainMarkers: {
    /** The segments markers travel along. */
    segments: (data: SystemMapData) => NetworkSegment[];
    placement: MapTrainMarkerPlacement;
  };
};
