/*
 * What the System Map engine (SystemMap.tsx) needs from one map: its manifest
 * and prepared data, how to prepare its SVG, and its network's content
 * adapter. Everything else is the engine's. Built once per map, at module
 * load, by the map's definition module (ttc-system-map.ts, regional-system-map.ts),
 * which the map registry (system-map-registry.tsx) loads.
 */
import type { MapManifest } from "../../app/map-manifests";
import type { PreparedMapGeometry } from "../../app/map-geometry-data";
import { mapArtworkSource, type MapArtworkSource } from "../../app/map-artwork";
import type { MapContent } from "../../app/map-content";
import { mapStationArtwork, type MapStationArtwork } from "../../app/map-station-artwork";
import type { DashboardData } from "../../app/DataContext";
import type { ImpactSelection, NetworkSegment } from "../../app/linewatch-data";
import type { AccountCommutePathPreview } from "../../app/commute-data";
import type { StationSummary } from "../../app/station-data";
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
  /** The map's manifest: its id, network and authored SVG's facts. */
  manifest: MapManifest<string>;
  /** Its prepared geometry (`prepare:map-geometry`). */
  geometry: PreparedMapGeometry;
  stationArtwork: readonly MapStationArtwork[];
  overlayPlane: MapOverlayPlane;
  /** The authored SVG, prepared as artwork only. */
  artwork: MapArtworkSource;
  /**
   * Whether the map places the shell's station list (`SystemMap`'s `stations`)
   * rather than its data's stations, so a listed station the artwork lacks
   * still gets a target (TTC's smoke fixtures need it).
   */
  usesStationList: boolean;
  /** The network's content adapter: what the map draws over its artwork. */
  content: (input: SystemMapContentInput) => MapContent;
  trainMarkers: {
    /** The segments markers travel along. */
    segments: (data: SystemMapData) => NetworkSegment[];
    placement: MapTrainMarkerPlacement;
  };
};

/** What a network's content adapter gives each of its maps, from the map's prepared geometry. */
export type SystemMapNetworkAdapter = Pick<SystemMapDefinition, "usesStationList" | "content" | "trainMarkers">;

/** The overlay plane a map gets from its manifest alone: no outline cutouts. */
export function manifestOverlayPlane(manifest: MapManifest<string>): MapOverlayPlane {
  return { idPrefix: manifest.id, unit: manifest.overlayUnit, maskBounds: manifest.viewBox, outlineCutouts: [] };
}

/**
 * A map's definition from its parts, with the station artwork read from its
 * prepared geometry. The geometry must be the manifest map's, prepared from
 * the same view box. Without an overlay plane or artwork, the map gets its
 * manifest's (`manifestOverlayPlane`, `mapArtworkSource`).
 */
export function defineSystemMap(
  definition: Omit<SystemMapDefinition, "stationArtwork" | "overlayPlane" | "artwork">
    & Partial<Pick<SystemMapDefinition, "overlayPlane" | "artwork">>,
): SystemMapDefinition {
  const { manifest, geometry } = definition;
  if (geometry.map !== manifest.id) {
    throw new Error(`Prepared geometry for map "${geometry.map}" given to map "${manifest.id}"`);
  }
  return {
    ...definition,
    overlayPlane: definition.overlayPlane ?? manifestOverlayPlane(manifest),
    artwork: definition.artwork ?? mapArtworkSource(manifest),
    stationArtwork: mapStationArtwork(geometry, manifest.stationPartSuffixes),
  };
}
