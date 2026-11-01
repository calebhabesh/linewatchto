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
  /** The network's station catalog (the shell's list), which every map places. */
  stationList: StationSummary[];
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
   * Whether the network's station catalog carries positions in this map's
   * coordinates (TTC's `mapX`/`mapY` do; GO/UP's are 0, 0). Every map places
   * its network's catalog (`SystemMap`'s `stations`) where the artwork draws
   * each station; with positions, a station the artwork does not draw is
   * placed at its own as a regular dot.
   */
  placesUndrawnStations: boolean;
  /** The network's content adapter: what the map draws over its artwork. */
  content: (input: SystemMapContentInput) => MapContent;
  trainMarkers: {
    /** The segments markers travel along. */
    segments: (data: SystemMapData) => NetworkSegment[];
    placement: MapTrainMarkerPlacement;
  };
};

/** What a network's content adapter gives each of its maps, from the map's prepared geometry. */
export type SystemMapNetworkAdapter = Pick<SystemMapDefinition, "placesUndrawnStations" | "content" | "trainMarkers">;

/**
 * Where a map draws its overlays, from its manifest and prepared geometry: its
 * id and overlay unit, map-wide masks over the view box with a view box of
 * margin on every side (outlines near the edge are not clipped), and an
 * outline cutout per pill station the manifest names (`outlineCutouts`).
 */
export function mapOverlayPlane(manifest: MapManifest<string>, geometry: PreparedMapGeometry): MapOverlayPlane {
  const { viewBox } = manifest;
  const { stationIds = [], strokeWidth = 0 } = manifest.outlineCutouts ?? {};
  const outlineCutouts = stationIds.flatMap((stationId): MapOverlayPlane["outlineCutouts"] => {
    const id = `station-${stationId}`;
    const station = geometry.stations.find((candidate) => candidate.shapes.some((shape) => shape.id === id));
    const shape = station?.shapes.find((candidate) => candidate.id === id);
    if (!station || shape?.tag !== "rect" || shape.join || shape.transform) return [];
    // Cutouts are plain rectangles: the pill may only be translated.
    const [a, b, c, d, e, f] = station.transform;
    if (a !== 1 || b !== 0 || c !== 0 || d !== 1) return [];
    return [{ x: shape.x + e, y: shape.y + f, width: shape.width, height: shape.height, rx: shape.rx, ry: shape.ry, strokeWidth }];
  });
  return {
    idPrefix: manifest.id,
    unit: manifest.overlayUnit,
    maskBounds: { x: viewBox.x - viewBox.width, y: viewBox.y - viewBox.height, width: viewBox.width * 3, height: viewBox.height * 3 },
    outlineCutouts,
  };
}

/**
 * A map's definition from its manifest, prepared geometry and network
 * adapter. Everything else comes from the manifest and geometry, the same way
 * for every map: station artwork, the overlay plane (`mapOverlayPlane`) and
 * the SVG's preparation (`mapArtworkSource`). The geometry must be the
 * manifest map's, prepared from the same view box.
 */
export function defineSystemMap(
  definition: Omit<SystemMapDefinition, "stationArtwork" | "overlayPlane" | "artwork">,
): SystemMapDefinition {
  const { manifest, geometry } = definition;
  if (geometry.map !== manifest.id) {
    throw new Error(`Prepared geometry for map "${geometry.map}" given to map "${manifest.id}"`);
  }
  return {
    ...definition,
    overlayPlane: mapOverlayPlane(manifest, geometry),
    artwork: mapArtworkSource(manifest),
    stationArtwork: mapStationArtwork(geometry, manifest.stationPartSuffixes),
  };
}
