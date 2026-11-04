"use client";

import { CommuteRouteLabel } from "./CommuteRouteLabel";
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, type ReactNode, type RefObject } from "react";
import { Map as MapLibreMap, AttributionControl, getVersion, setWorkerUrl, type VectorTileSource } from "maplibre-gl";
import { installTilePrefetch, type PrefetchSource } from "./map-tile-prefetch";
import "maplibre-gl/dist/maplibre-gl.css";
import { AlertCircle, RefreshCw, Layers, Locate, Bus, Route, SatelliteDish, TrainFrontTunnel, ZoomIn, ZoomOut } from "lucide-react";
import { cachedGeographicCatalog, loadGeographicCatalog } from "../app/geographic-catalog-loader";
import type { MapFadeController } from "../app/map-surface-transition";
import { createGeographicMapFade, installTransitOpacity, setTransitPaintProperty } from "./geographic-network-transition";
import type { GeographicCatalog } from "../app/geographic-catalog";
import type { NetworkId } from "../app/regional-data";
import type { MapViewPreference } from "../app/visual-preferences";
import type {
  ActiveAlert,
  ImpactSelection,
  MapImpact,
  MapImpactKind,
  NetworkSegment,
  PlannedClosure,
  StationNodeImpact,
} from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/commute-data";
import { useOptionalDashboardData } from "../app/DataContext";
import { plannedAdvisoryStationImpacts } from "../app/map-alert-selector";
import { NetworkSelector } from "./NetworkSelector";
import { MapViewSelector } from "./MapViewSelector";
import { observeDesktopControlRail } from "../app/desktop-sidebar-state";
import {
  getStationCoordinates,
  projectImpactedLinks,
  projectImpactedStations,
  projectImpactBadges,
  projectImpactArrows,
  projectEstimatedTrainMarkers,
  projectCommutePreview,
  getProjectedSelectionBounds,
  getProjectedImpactGroup,
  getPointAlongPolyline,
} from "../app/geographic-overlays";
import type { EstimatedTrainMarker } from "../app/train-markers";
import {
  OPENFREEMAP_STYLES,
  GEOGRAPHIC_LOAD_TIMEOUT_MS,
  STATION_FOCUS_ZOOM,
  getGeographicBounds,
  getGeographicCenter,
  getGeographicDefaultZoom,
  getGeographicAttribution,
  GEOGRAPHIC_MIN_ZOOM,
  GEOGRAPHIC_MAX_ZOOM,
} from "../app/geographic-config";
import {
  clearGeographicMapViewport,
  readGeographicMapViewport,
  saveGeographicMapViewport,
} from "../app/map-viewport-preference";
import {
  getGeographicMapLifecycle,
  recordGeographicMapLifecycle,
  setGeographicProjectedImpactAnchorResolver,
  setGeographicProjectedSelectionBoundsResolver,
  setGeographicProjectedStationResolver,
} from "../app/geographic-lifecycle";
import { MapOverlapChooser } from "./MapOverlapChooser";
import { GeographicStreetcarCard } from "./GeographicStreetcarCard";
import { GeographicStreetcarVehicleCard } from "./GeographicStreetcarVehicleCard";
import {
  distanceToStreetcarRoute,
  findStreetcarVehicle,
  getStreetcarPositions,
  streetcarPositionsDelayMs,
  streetcarVehicleAgeSeconds,
  streetcarVehicleFeatures,
  streetcarVehicleState,
  STREETCAR_OFF_ROUTE_METERS,
  type StreetcarPositionsRead,
} from "../app/streetcar-positions";
import {
  BUS_VEHICLE_MIN_ZOOM,
  busPositionsArea,
  busPositionsAreaCovers,
  busVehicleFeatures,
  busVehicleFeaturesSignature,
  findBusVehicle,
  getBusPositions,
  isBusOffRoute,
  type BusPositionsArea,
  type BusPositionsRead,
  type BusVehicle,
} from "../app/bus-positions";
import {
  hasBusVehicleLayers,
  installBusVehicleLayers,
  removeBusVehicleLayers,
  setBusVehicleData,
  busVehicleKeyAtPoint,
} from "./geographic-bus-vehicles";
import {
  GO_BUS_VEHICLE_MIN_ZOOM,
  findGoBusVehicle,
  getGoBusPositions,
  goBusPositionsDetail,
  goBusVehicleFeatures,
  goBusVehicleFeaturesSignature,
  goBusVehicleState,
  goBusVehicleStop,
  readGoBusPositionsPreference,
  writeGoBusPositionsPreference,
  type GoBusPositionsRead,
} from "../app/go-bus-positions";
import {
  cachedNightCatalog,
  cachedNightStops,
  loadNightCatalog,
  loadNightStops,
  nightCardRows,
  type NightCatalog,
  type NightStopCatalog,
} from "../app/night-route-catalog";
import {
  NIGHT_PRESS_LAYERS,
  NIGHT_SELECTION_TARGETS,
  NIGHT_STOP_SELECTION_TARGET,
  addMissingNightBadgeImage,
  hasNightLayers,
  installNightLayers,
  installNightSelectionSources,
  installNightStopSelectionSource,
  removeNightLayers,
  removeNightStopSelection,
} from "./geographic-night-layers";
import {
  applySurfaceSelectionLayers,
  drawnSurfaceSelectionLayers,
  surfaceSelectionStopCodeAtPoint,
  surfaceSelectionStopLayers,
} from "./geographic-surface-selection-layers";
import {
  assignSelectedTtcStops,
  mergeSurfaceSelection,
  routeCorridors,
  routeCoordinates,
  surfaceSelectionBounds,
  surfaceSelectionKey,
  type SurfaceMapSelection,
  type SurfaceSelectionLayer,
} from "../app/surface-map-selection";
import {
  goBusVehicleKeyAtPoint,
  hasGoBusVehicleLayers,
  installGoBusVehicleLayers,
  removeGoBusVehicleLayers,
  setGoBusVehicleData,
} from "./geographic-go-bus-vehicles";
import {
  STREETCAR_VEHICLE_LAYER,
  hasStreetcarVehicleLayers,
  installStreetcarVehicleLayers,
  setStreetcarVehicleData,
  streetcarVehicleKeyAtPoint,
} from "./geographic-streetcar-vehicles";
import {
  cachedStreetcarCatalog,
  isStreetcarCorridorFeature,
  isStreetcarStopFeature,
  loadStreetcarCatalog,
  nearestStreetcarStop,
  streetcarCardRows,
  streetcarSchedulePeriodLabel,
  type StreetcarStopFeature,
} from "../app/geographic-surface-catalog";
import {
  STREETCAR_BADGE_LAYER,
  STREETCAR_HIT_LAYER,
  STREETCAR_SELECTION_TARGET,
  STREETCAR_STOP_LAYER,
  hasStreetcarLayers,
  installStreetcarLayers,
  installStreetcarSelectionSources,
  removeStreetcarLayers,
  streetcarStopCodeAtPoint,
  updateStreetcarStopSelection,
} from "./geographic-streetcar-layers";
import {
  BUS_BADGE_LAYER,
  BUS_HIT_LAYER,
  BUS_SELECTION_TARGET,
  BUS_STOP_LAYER,
  addMissingBusBadgeImage,
  busStopCodeAtPoint,
  hasBusLayers,
  hasBusStopLayers,
  installBusLayers,
  installBusSelectionSources,
  installBusStopLayers,
  removeBusLayers,
  removeBusStopLayers,
  updateBusStopSelection,
} from "./geographic-bus-layers";
import {
  GO_BUS_BADGE_LAYER,
  GO_BUS_HIT_LAYER,
  GO_BUS_SELECTION_TARGET,
  GO_BUS_STOP_LAYER,
  addMissingGoBusBadgeImage,
  goBusStopCodeAtPoint,
  hasGoBusLayers,
  hasGoBusStopLayers,
  installGoBusLayers,
  installGoBusSelectionSources,
  installGoBusStopLayers,
  removeGoBusLayers,
  updateGoBusStopSelection,
} from "./geographic-go-bus-layers";
import {
  cachedGoBusCatalog,
  cachedGoBusStops,
  goBusCardRows,
  loadGoBusCatalog,
  loadGoBusStops,
  nearestGoBusStop,
  type GoBusCatalog,
  type GoBusStopCatalog,
  type GoBusStopFeature,
} from "../app/go-bus-catalog";
import {
  STREETCAR_POSITIONS_STORAGE_KEY,
  STREETCAR_ROUTES_STORAGE_KEY,
  estimatedTrainsDetail,
  readLayerPreference,
  vehiclePositionsDetail,
  writeLayerPreference,
} from "../app/map-view-layers";
import SquishSwitch from "./SquishSwitch";
import {
  STATION_PLAN_BAY_LAYER,
  addMissingStationBayImage,
  hasStationPlanLayers,
  installStationPlanLayers,
  prepareStationPlanImages,
  requestStationPlans,
  stationBayStopCodeAtPoint,
} from "./geographic-station-plan-layers";
import { STATION_PLANS_LOAD_ZOOM } from "../app/geographic-station-plans";
import {
  BUS_STOPS_LOAD_ZOOM,
  busCardRows,
  cachedBusCatalog,
  cachedBusStops,
  loadBusCatalog,
  loadBusStops,
  nearestBusStop,
  type BusCatalog,
  type BusStopCatalog,
  type BusStopFeature,
} from "../app/geographic-bus-catalog";
import {
  MapChooserFollower,
  chooserBadgeInView,
  type ChooserFollowAnchor,
} from "./map-chooser-follow";
import {
  chooseGeographicChooserLayout,
  geographicChooserLayoutsMatch,
  GEOGRAPHIC_CHOOSER_KEEPOUT_GAP,
  type GeographicOverlapChooserLayout,
} from "./geographic-chooser-placement";
import { overlapChooserSize, streetcarCardSize, streetcarVehicleCardSize } from "./map-chooser-layout";
import { useMapGestureInterruption } from "../hooks/useMapGestureInterruption";
import {
  generateOverlapBadgeSvg,
  getOverlapBadgeKey,
  parseOverlapBadgeKey,
  createSvgImage,
  MAP_BADGE_PIXEL_RATIO,
} from "./map-overlap-svg";
import { countUniqueImpactsByKind } from "../app/map-alert-selector";
import {
  GeographicSelectionAttention,
  type SelectionAttentionFrame,
} from "../app/geographic-selection-attention";
import {
  observeMapChooserKeepouts,
  visibleMapChooserKeepouts,
} from "./map-chooser-keepouts";
import {
  readCommutePreviewInset,
  readMobileImpactInspectorTop,
  readMobilePillBottom,
  readMobileStationSubmenuTop,
} from "../hooks/mobileMapFrame";
import {
  installTransitLayers,
  applyGeographicDynamicState,
  registerTrainMarkerImages,
  updateGeographicDynamicSources,
  updateGeographicLineFilter,
  updateGeographicStationSelection,
  updateGeographicStationHover,
  createGeographicStationHoverAnimator,
  updateGeographicImpactSelection,
  geographicSelectionWidthExpression,
  GEOGRAPHIC_SELECTION_BAND_WIDTHS,
  GEOGRAPHIC_SELECTION_GLOW_WIDTHS,
  GEOGRAPHIC_SELECTION_GLOW_OPACITY,
} from "./geographic-map-operations.ts";
import { getLinkFeatures } from "../app/geographic-catalog";
import { measureDesktopMapInsets } from "../app/desktop-sidebar-state";
import { readMapOccludedInsets } from "./map-camera/useMapFraming";
import { DEFAULT_STATION_LABEL_PLACEMENT, stationLabelPlacements } from "../app/geographic-station-label-placement";

export {
  installTransitLayers,
  applyDynamicDataAndFilters,
  applyGeographicDynamicState,
  updateGeographicDynamicSources,
  updateGeographicLineFilter,
  updateGeographicStationSelection,
  updateGeographicImpactSelection,
} from "./geographic-map-operations.ts";

const GEOGRAPHIC_IMPACT_BADGE_MIN_HIT_DIAMETER_PX = 44;

export type GeographicNetworkMapProps = {
  network: NetworkId;
  networkFadeRef?: RefObject<MapFadeController | null>;
  isDark: boolean;
  highContrast: boolean;
  selectedStationId?: string | null;
  onSelectStationId?: (stationId: string | null) => void;
  /** The TTC surface stop whose departures are open (plan 13, S3). */
  selectedSurfaceStopCode?: string | null;
  onSelectSurfaceStop?: (stopCode: string | null) => void;
  /**
   * Stops or a route an open panel shows on the map (plan 14, U4: a route
   * panel's View on Map, a notice's View). Drawn with the open stop in the
   * neutral selected style, and framed once.
   */
  surfaceSelection?: SurfaceMapSelection | null;
  selection?: ImpactSelection;
  onSelectImpact?: (selection: ImpactSelection) => void;
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
  filteredLineId?: string | null;
  onFilterLineId?: (lineId: string | null) => void;
  networkSegments?: NetworkSegment[];
  stationNodeImpacts?: StationNodeImpact[];
  activeAlerts?: ActiveAlert[];
  plannedClosures?: PlannedClosure[];
  recenterSignal?: number;
  zoomInSignal?: number;
  zoomOutSignal?: number;
  reducedMotion?: boolean;
  onReady?: () => void;
  onSwitchToDiagram?: () => void;
  isMapActive?: boolean;
  onNetworkChange?: (network: NetworkId) => void;
  mapView?: MapViewPreference;
  onMapViewChange?: (view: MapViewPreference) => void;
  estimatedTrainsEnabled?: boolean;
  estimatedTrainMarkers?: EstimatedTrainMarker[];
  selectionAttentionGeneration?: number;
  /** Shared intro key; linked planned/current hops keep it so the map keeps breathing. */
  selectionIntroKey?: string | null;
  mobilePerformanceMode?: boolean;
  layoutResetSignal?: number;
  /** TTC buses (plan 13, S5): the rider's toggle, off by default. Drawn on the TTC network only. */
  busesEnabled?: boolean;
  /** The layer deck's Buses switch; without it the deck shows no bus switch. */
  onToggleBuses?: () => void;
  /** GO buses (plan 13, S6): the rider's toggle, off by default. Drawn on the GO/UP network only. */
  goBusesEnabled?: boolean;
  /** The GO/UP layer deck's GO Buses switch. */
  onToggleGoBuses?: () => void;
  /**
   * The shell's estimated train markers switch, also shown in the Map View's
   * layer deck on both networks (one setting, so both always agree).
   */
  trainMarkersControl?: {
    checked: boolean;
    disabled: boolean;
    pending: boolean;
    status: string;
    ariaLabel: string;
    onToggle: () => void;
  };
};

const EMPTY_SEGMENTS: NetworkSegment[] = [];
const EMPTY_STATION_IMPACTS: StationNodeImpact[] = [];
const EMPTY_ALERTS: ActiveAlert[] = [];
const EMPTY_PLANNED_CLOSURES: PlannedClosure[] = [];
const EMPTY_TRAIN_MARKERS: EstimatedTrainMarker[] = [];

declare global {
  interface Window {
    __geographicMapDebug?: { map: MapLibreMap };
    /** Dev only (LineWatchShell): shows a surface selection on the Map View. */
    __linewatchSurfaceSelectionDebug?: {
      show: (selection: SurfaceMapSelection | null, owner: "route" | "notice") => void;
    };
  }
}

type GeographicOverlapChooserState = {
  markerId: string;
  targetId: string;
  targetType: "segment" | "station";
  label: string;
  impacts: MapImpact[];
  coordinate: [number, number];
};

/**
 * A press on a streetcar or bus line (the routes there and where the card
 * points), or on a live car (S4), which the card names by its key in the
 * latest read.
 */
type GeographicStreetcarCardState =
  | {
    kind: "routes";
    mode: "streetcar" | "bus" | "go-bus" | "night";
    routes: string[];
    coordinate: [number, number];
    /** The nearest stop on these routes, offered as a way into its departures (S3). */
    nearestStop: StreetcarStopFeature | BusStopFeature | GoBusStopFeature | null;
  }
  | { kind: "vehicle"; key: string; coordinate: [number, number] }
  /** A live bus (S8). */
  | { kind: "bus-vehicle"; key: string; coordinate: [number, number] }
  /** A live GO bus (S9), on GO/UP. */
  | { kind: "go-bus-vehicle"; key: string; coordinate: [number, number] };

/** Pole numbers the streetcar layer draws; a shared pole shows its streetcar label only. */
const streetcarStopCodeSets = new WeakMap<object, Set<string>>();
function streetcarStopCodeSet(catalog: ReturnType<typeof cachedStreetcarCatalog>): Set<string> {
  if (!catalog) return new Set();
  let codes = streetcarStopCodeSets.get(catalog);
  if (!codes) {
    codes = new Set(catalog.features.flatMap((feature) => (
      feature.properties.featureType === "streetcar-stop" && "stopCode" in feature.properties && feature.properties.stopCode
        ? [feature.properties.stopCode]
        : []
    )));
    streetcarStopCodeSets.set(catalog, codes);
  }
  return codes;
}

/** Pole numbers in a stop file, built once per file. */
const stopCodeSets = new WeakMap<object, Set<string>>();
function stopCodeSetOf(stops: { features: ReadonlyArray<{ properties: { stopCode: string } }> }): Set<string> {
  let codes = stopCodeSets.get(stops);
  if (!codes) {
    codes = new Set(stops.features.map((feature) => feature.properties.stopCode));
    stopCodeSets.set(stops, codes);
  }
  return codes;
}

type SurfaceSelectionFiles = {
  streetcars: ReturnType<typeof cachedStreetcarCatalog>;
  busCorridors: BusCatalog | null;
  busStops: BusStopCatalog | null;
  nightCorridors: NightCatalog | null;
  nightStops: NightStopCatalog | null;
  goCorridors: GoBusCatalog | null;
  goStops: GoBusStopCatalog | null;
};

/**
 * The points a selection covers (its stops and its route's corridors), or
 * null while a file it needs is still loading.
 */
function surfaceSelectionPoints(
  network: NetworkId,
  selection: SurfaceMapSelection,
  files: SurfaceSelectionFiles,
): Array<[number, number]> | null {
  const points: Array<[number, number]> = [];
  const route = selection.route;
  const stopsIn = (features: ReadonlyArray<{ geometry: { coordinates: [number, number] }; properties: { stopCode?: string } }>, codes: readonly string[]) => {
    const wanted = new Set(codes);
    for (const feature of features) if (wanted.has(feature.properties.stopCode ?? "")) points.push(feature.geometry.coordinates);
  };
  if (network === "regional") {
    if (selection.stopCodes.length > 0) {
      if (!files.goStops) return null;
      stopsIn(files.goStops.features, selection.stopCodes);
    }
    if (route?.layer === "go-bus") {
      if (!files.goCorridors) return null;
      points.push(...routeCoordinates(files.goCorridors.features, route.route));
    }
    return points;
  }
  const assigned = assignSelectedTtcStops(selection.stopCodes, {
    streetcar: files.streetcars ? streetcarStopCodeSet(files.streetcars) : null,
    bus: files.busStops ? stopCodeSetOf(files.busStops) : null,
    night: files.nightStops ? stopCodeSetOf(files.nightStops) : null,
  });
  if (assigned.needs) return null;
  if (files.streetcars) stopsIn(files.streetcars.features.filter(isStreetcarStopFeature), assigned.streetcar);
  if (files.busStops) stopsIn(files.busStops.features, assigned.bus);
  if (files.nightStops) stopsIn(files.nightStops.features, assigned.night);
  const corridors = route?.layer === "streetcar" ? files.streetcars?.features.filter(isStreetcarCorridorFeature)
    : route?.layer === "bus" ? files.busCorridors?.features
    : route?.layer === "night" ? files.nightCorridors?.features
    : [];
  if (!corridors) return null;
  if (route) points.push(...routeCoordinates(corridors, route.route));
  return points;
}

/**
 * Phone padding for a framed route or stops: alert View's rule, with the
 * stop or route sheet in the inspector's place.
 */
function geographicMobileSurfaceSelectionPadding(container: HTMLElement) {
  const height = container.clientHeight;
  const top = Math.max(104, Math.ceil(readMobilePillBottom(container) + 16));
  const bottom = Math.max(96, Math.ceil(height - readMobileStationSubmenuTop(container, height) + 24));
  // Never below the minimum visible height: a tall sheet gives way first.
  const available = Math.max(0, height - GEOGRAPHIC_FOCUS_MIN_VISIBLE_PX);
  const scale = top + bottom > available && top + bottom > 0 ? available / (top + bottom) : 1;
  return { top: Math.floor(top * scale), bottom: Math.floor(bottom * scale), left: 72, right: 72 };
}

/** Routes on the streetcar lines under a press, in route order (MapLibre returns array properties as JSON). */
function streetcarRoutesFromFeatures(features: Array<{ properties?: Record<string, unknown> | null }>): string[] {
  const routes = new Set<string>();
  for (const feature of features) {
    const value = feature.properties?.routes;
    const list = typeof value === "string" ? (() => {
      try { return JSON.parse(value) as unknown; } catch { return []; }
    })() : value;
    if (Array.isArray(list)) for (const route of list) if (typeof route === "string") routes.add(route);
  }
  return [...routes].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

const GEOGRAPHIC_MOBILE_SELECTION_MAX_ZOOM = 14.75;

/** Every layer that can draw a surface selection (plan 14, U4). */
const SURFACE_SELECTION_PREFIXES = [
  STREETCAR_SELECTION_TARGET, BUS_SELECTION_TARGET, ...NIGHT_SELECTION_TARGETS, NIGHT_STOP_SELECTION_TARGET, GO_BUS_SELECTION_TARGET,
].map((target) => target.prefix);

/** Layers a press acts on; the cursor shows a pointer over them. */
const GEOGRAPHIC_POINTER_LAYERS = [
  "transit-planned-station-selection",
  "transit-impact-badges",
  "transit-station-impacts",
  "transit-impacts-line",
  "transit-impact-arrows",
  STREETCAR_HIT_LAYER,
  STREETCAR_STOP_LAYER,
  STREETCAR_VEHICLE_LAYER,
  BUS_HIT_LAYER,
  BUS_STOP_LAYER,
  GO_BUS_HIT_LAYER,
  GO_BUS_STOP_LAYER,
  STATION_PLAN_BAY_LAYER,
  ...[STREETCAR_SELECTION_TARGET, BUS_SELECTION_TARGET, NIGHT_STOP_SELECTION_TARGET, GO_BUS_SELECTION_TARGET]
    .flatMap((target) => surfaceSelectionStopLayers(target.prefix)),
];

function geographicMobileSelectionPadding(container: HTMLElement) {
  const topPillBottom = readMobilePillBottom(container);
  const inspectorTop = readMobileImpactInspectorTop(container, container.clientHeight);

  return {
    top: Math.max(104, Math.ceil(topPillBottom + 16)),
    bottom: Math.max(96, Math.ceil(container.clientHeight - inspectorTop + 24)),
    left: 72,
    right: 72,
  };
}

/** Room kept beyond a framed alert for its badges and direction glyphs. */
const GEOGRAPHIC_FOCUS_OVERLAY_MARGIN_PX = 16;
/** A focus frame never shrinks the visible map below this, per axis. */
const GEOGRAPHIC_FOCUS_MIN_VISIBLE_PX = 160;

/**
 * Desktop focus padding: the edges the sidebar, toolbar and legend cover (the
 * System Map's `readMapOccludedInsets`), so a framed alert or station sits in
 * the part of the map left showing. The default camera stays full width.
 */
function geographicDesktopFocusPadding(container: HTMLElement) {
  const { insets } = readMapOccludedInsets(
    container,
    container.clientHeight,
    false,
    measureDesktopMapInsets(container),
    { selection: null, selectedStationId: null },
  );
  const fit = (start: number, end: number, size: number) => {
    const total = start + end;
    const available = Math.max(0, size - GEOGRAPHIC_FOCUS_MIN_VISIBLE_PX);
    const scale = total > available && total > 0 ? available / total : 1;
    return [Math.floor(start * scale), Math.floor(end * scale)] as const;
  };
  // Selecting an alert or station widens the sidebar to its detail width
  // over ~300 ms; frame against the width it is heading to, which the shell
  // sets at once, not the width it has now.
  const sidebar = container.closest(".linewatch-shell")?.querySelector<HTMLElement>(
    ".desktop-sidebar-container:not(.desktop-sidebar-container--collapsed)",
  );
  const sidebarTargetWidth = sidebar && sidebar.getAttribute("aria-hidden") !== "true"
    ? Number.parseFloat(sidebar.style.getPropertyValue("--desktop-sidebar-width"))
    : Number.NaN;
  const sidebarLeft = Number.isFinite(sidebarTargetWidth)
    ? Math.max(0, sidebar!.getBoundingClientRect().left + sidebarTargetWidth
      - container.getBoundingClientRect().left + 24)
    : 0;
  const margin = GEOGRAPHIC_FOCUS_OVERLAY_MARGIN_PX;
  const [left, right] = fit(Math.max(insets.left, sidebarLeft) + margin, insets.right + margin, container.clientWidth);
  const [top, bottom] = fit(insets.top + margin, insets.bottom + margin, container.clientHeight);
  return { top, bottom, left, right };
}

function uniqueMapImpacts(impacts: MapImpact[]): MapImpact[] {
  const seen = new Set<string>();
  return impacts.filter((impact) => {
    const key = `${impact.kind}:${impact.cardId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isWebGL2Supported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGL2RenderingContext && canvas.getContext("webgl2"),
    );
  } catch {
    return false;
  }
}

/**
 * The OpenFreeMap vector tiles around the view, into the browser's HTTP
 * cache (their URLs are versioned and cached for years), so a pan draws them
 * without waiting on the network. The raster relief source stops at z6 and
 * is left to MapLibre.
 */
function openMapTilesPrefetchSources(map: MapLibreMap): PrefetchSource[] {
  const source = map.getSource("openmaptiles") as VectorTileSource | undefined;
  const template = source?.tiles?.[0];
  if (!source || !template) return [];
  return [{
    key: template,
    tileSize: source.tileSize,
    minzoom: source.minzoom,
    maxzoom: source.maxzoom,
    roundZoom: false,
    // Vector tiles run to ~100 KB, ten times a diagram tile: a phone's view
    // and its ring is about this many, so a settle costs at most ~1 MB.
    maxTiles: 12,
    load: async (z, x, y) => {
      const response = await fetch(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
      await response.arrayBuffer();
    },
  }];
}

/** Height of a selected stop's pill above its position, kept clear when stops are framed. */
const SELECTED_STOP_PILL_ROOM_PX = 24;
/** Street level: stop pills draw from zoom 15. */
const SURFACE_STOP_FOCUS_ZOOM = 16;
/** GO bus stops are framed a little wider: terminals and highway stops, not street poles. */
const GO_BUS_STOP_FOCUS_ZOOM = 15;

/**
 * Flies to a selected station or stop the same way: at least `minZoom`, centred
 * above the phone's submenu sheet, or in the area the desktop sidebar, toolbar
 * and legend leave showing.
 */
function focusGeographicCamera(
  map: MapLibreMap,
  container: HTMLDivElement | null,
  coords: [number, number],
  minZoom: number,
  reducedMotion: boolean,
) {
  const targetZoom = Math.max(map.getZoom(), minZoom);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const padding = isMobile && container ? {
    top: readMobilePillBottom(container),
    bottom: Math.max(0, container.clientHeight - readMobileStationSubmenuTop(container, container.clientHeight)),
    left: 0,
    right: 0,
  } : undefined;
  // Desktop centres the station in the area the sidebar, toolbar and
  // legend leave showing. An offset, unlike padding, does not persist.
  const desktopPadding = !isMobile && container ? geographicDesktopFocusPadding(container) : null;
  const offset: [number, number] | undefined = desktopPadding
    ? [(desktopPadding.left - desktopPadding.right) / 2, (desktopPadding.top - desktopPadding.bottom) / 2]
    : undefined;
  if (reducedMotion) {
    map.jumpTo({ center: coords, zoom: targetZoom, padding });
    if (offset) map.panBy([-offset[0], -offset[1]], { animate: false });
  } else {
    map.flyTo({ center: coords, zoom: targetZoom, padding, ...(offset ? { offset } : {}), essential: true });
  }
}

/**
 * The stop a live bus's card offers (S8): the nearest bus stop on its route
 * within 300 m, or for a replacement bus the nearest stop of the streetcar
 * route it stands in for. Null until the stop file has loaded.
 */
function busVehicleNearestStop(vehicle: BusVehicle): StreetcarStopFeature | BusStopFeature | null {
  const coordinate: [number, number] = [vehicle.longitude, vehicle.latitude];
  if (vehicle.replacement) {
    const streetcars = cachedStreetcarCatalog();
    return streetcars ? nearestStreetcarStop(streetcars, coordinate, [vehicle.route])?.stop ?? null : null;
  }
  const stops = cachedBusStops();
  return stops ? nearestBusStop(stops, coordinate, [vehicle.route])?.stop ?? null : null;
}

/**
 * One switch in the Map View's layer deck, in the Train Markers switch's
 * design: the mode on top, and below it what the switch controls (or why it
 * cannot show anything now). The switch itself carries on or off.
 */
function MapLayerSwitch({ id, icon, label, detail, checked, disabled = false, pending = false, ariaLabel, title, onChange, dataBusToggle = false }: {
  id: string;
  icon: ReactNode;
  label: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  ariaLabel: string;
  title: string;
  onChange: () => void;
  dataBusToggle?: boolean;
}) {
  return (
    <div
      className="map-layer-switch"
      data-checked={checked ? "true" : "false"}
      data-disabled={disabled ? "true" : undefined}
      data-bus-toggle={dataBusToggle ? "" : undefined}
      title={title}
    >
      <span className="map-layer-switch-icon">{icon}</span>
      <label htmlFor={id} className="map-layer-switch-copy">
        <span className="map-layer-switch-label">{label}</span>
        <span className="map-layer-switch-status">{detail}</span>
      </label>
      <SquishSwitch
        id={id}
        checked={checked}
        disabled={disabled}
        ariaBusy={pending}
        ariaLabel={ariaLabel}
        className="shrink-0"
        trackOnColor="#10b981"
        width={34}
        height={20}
        onChange={onChange}
        title={title}
      />
    </div>
  );
}

export function GeographicNetworkMap({
  network,
  networkFadeRef,
  isDark,
  highContrast,
  selectedStationId,
  onSelectStationId,
  selectedSurfaceStopCode = null,
  onSelectSurfaceStop,
  surfaceSelection = null,
  selection,
  onSelectImpact,
  commutePathPreview,
  onClearCommutePathPreview,
  filteredLineId,
  onFilterLineId,
  networkSegments: propNetworkSegments,
  stationNodeImpacts: propStationNodeImpacts,
  activeAlerts: propActiveAlerts,
  plannedClosures: propPlannedClosures,
  recenterSignal,
  zoomInSignal,
  zoomOutSignal,
  reducedMotion = false,
  onReady,
  onSwitchToDiagram,
  isMapActive = true,
  onNetworkChange,
  mapView,
  onMapViewChange,
  estimatedTrainsEnabled = false,
  estimatedTrainMarkers = EMPTY_TRAIN_MARKERS,
  selectionAttentionGeneration = 0,
  selectionIntroKey = null,
  mobilePerformanceMode = false,
  layoutResetSignal = 0,
  busesEnabled = false,
  onToggleBuses,
  goBusesEnabled = false,
  onToggleGoBuses,
  trainMarkersControl,
}: GeographicNetworkMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const interruptCameraMotion = useCallback(() => {
    // stop() also resets native gestures and discards queued movement/inertia.
    // A drag released outside the tab must not continue when the user returns.
    mapRef.current?.stop();
  }, []);
  useMapGestureInterruption(interruptCameraMotion);
  const attributionRef = useRef<AttributionControl | null>(null);
  const [loadedCatalog, setCatalog] = useState<GeographicCatalog | null>(null);
  const catalog = cachedGeographicCatalog(network) ?? (loadedCatalog?.network === network ? loadedCatalog : null);
  const networkRef = useRef(network);
  const appliedCatalogRef = useRef<GeographicCatalog | null>(null);
  useLayoutEffect(() => { networkRef.current = network; }, [network]);
  const catalogRef = useRef<GeographicCatalog | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const loadStatusRef = useRef(loadStatus);

  // Selection attention animation state & refs
  const selectionAttentionRef = useRef<GeographicSelectionAttention>(new GeographicSelectionAttention());
  const rafIdRef = useRef<number | null>(null);
  const pendingCameraFlightGenRef = useRef<number | null>(null);
  const lastSelectionIntroKeyRef = useRef<string | null>(null);

  const stopAttentionLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const applyAttentionFrame = useCallback((frame: SelectionAttentionFrame) => {
    const map = mapRef.current;
    if (!map || loadStatusRef.current !== "ready") return;

    if (map.getLayer("transit-impacts-selection")) {
      setTransitPaintProperty(map, "transit-impacts-selection", "line-opacity", frame.opacity);
      setTransitPaintProperty(map, "transit-impacts-selection", "line-width",
        geographicSelectionWidthExpression(GEOGRAPHIC_SELECTION_BAND_WIDTHS, frame.widthMultiplier));
    }
    if (map.getLayer("transit-impacts-selection-glow")) {
      setTransitPaintProperty(map, "transit-impacts-selection-glow", "line-opacity",
        GEOGRAPHIC_SELECTION_GLOW_OPACITY * frame.opacity);
      setTransitPaintProperty(map, "transit-impacts-selection-glow", "line-width",
        geographicSelectionWidthExpression(GEOGRAPHIC_SELECTION_GLOW_WIDTHS, frame.widthMultiplier));
    }

    if (map.getLayer("transit-station-impacts-selection")) {
      setTransitPaintProperty(map, "transit-station-impacts-selection", "circle-stroke-opacity", frame.opacity);
      setTransitPaintProperty(map, "transit-station-impacts-selection", "circle-stroke-width", 4 * frame.widthMultiplier);
      setTransitPaintProperty(map, "transit-station-impacts-selection", "circle-radius", [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        9.0 * frame.widthMultiplier,
        14,
        15.0 * frame.widthMultiplier,
        17,
        22.0 * frame.widthMultiplier,
      ]);
    }
  }, []);

  const startAttentionLoop = useCallback(() => {
    stopAttentionLoop();
    const step = (now: number) => {
      const frame = selectionAttentionRef.current.computeFrame(now);
      applyAttentionFrame(frame);
      if (frame.active) {
        rafIdRef.current = requestAnimationFrame(step);
      } else {
        rafIdRef.current = null;
      }
    };
    rafIdRef.current = requestAnimationFrame(step);
  }, [applyAttentionFrame, stopAttentionLoop]);

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [currentZoom, setCurrentZoom] = useState<number>(() => getGeographicDefaultZoom(network));
  const [overlapChooser, setOverlapChooser] = useState<GeographicOverlapChooserState | null>(null);
  const [streetcarCard, setStreetcarCard] = useState<GeographicStreetcarCardState | null>(null);
  // Live streetcar positions (S4): the latest read, and the clock their ages are read against.
  const [streetcarPositions, setStreetcarPositions] = useState<StreetcarPositionsRead | null>(null);
  const [streetcarPositionsNow, setStreetcarPositionsNow] = useState(() => Date.now());
  const streetcarPositionsRef = useRef(streetcarPositions);
  useLayoutEffect(() => {
    streetcarPositionsRef.current = streetcarPositions;
  }, [streetcarPositions]);
  // Live bus positions (S8): the latest read of the area around the view, and its clock.
  const [busPositions, setBusPositions] = useState<BusPositionsRead | null>(null);
  const [busPositionsNow, setBusPositionsNow] = useState(() => Date.now());
  const busPositionsRef = useRef(busPositions);
  useLayoutEffect(() => {
    busPositionsRef.current = busPositions;
  }, [busPositions]);
  // Live GO bus positions (S9): the latest read of the area around the view, and its clock.
  const [goBusPositions, setGoBusPositions] = useState<GoBusPositionsRead | null>(null);
  const [goBusPositionsNow, setGoBusPositionsNow] = useState(() => Date.now());
  const goBusPositionsRef = useRef(goBusPositions);
  useLayoutEffect(() => {
    goBusPositionsRef.current = goBusPositions;
  }, [goBusPositions]);
  // One card is open at a time; the alert chooser and the streetcar card share
  // its placement and follower.
  const chooserAnchor = useMemo(() => {
    if (overlapChooser) {
      return {
        coordinate: overlapChooser.coordinate,
        size: (viewportWidth: number) => overlapChooserSize(overlapChooser.impacts.length, viewportWidth),
      };
    }
    if (streetcarCard?.kind === "go-bus-vehicle") {
      return {
        coordinate: streetcarCard.coordinate,
        size: (viewportWidth: number) => {
          const vehicle = findGoBusVehicle(goBusPositionsRef.current, streetcarCard.key);
          const stops = cachedGoBusStops();
          return streetcarVehicleCardSize(viewportWidth, {
            offRoute: false,
            withStop: Boolean(vehicle && stops && callbacksRef.current.onSelectSurfaceStop
              && goBusVehicleStop(stops, vehicle)),
          });
        },
      };
    }
    if (streetcarCard?.kind === "bus-vehicle") {
      return {
        coordinate: streetcarCard.coordinate,
        size: (viewportWidth: number) => {
          const vehicle = findBusVehicle(busPositionsRef.current, streetcarCard.key);
          return streetcarVehicleCardSize(viewportWidth, {
            offRoute: Boolean(vehicle && isBusOffRoute(cachedBusCatalog(), vehicle)),
            replacement: Boolean(vehicle?.replacement),
            withStop: Boolean(vehicle && callbacksRef.current.onSelectSurfaceStop && busVehicleNearestStop(vehicle)),
          });
        },
      };
    }
    if (streetcarCard?.kind === "vehicle") {
      return {
        coordinate: streetcarCard.coordinate,
        size: (viewportWidth: number) => {
          const vehicle = findStreetcarVehicle(streetcarPositionsRef.current, streetcarCard.key);
          const streetcars = cachedStreetcarCatalog();
          return streetcarVehicleCardSize(viewportWidth, {
            offRoute: Boolean(vehicle && streetcars && distanceToStreetcarRoute(
              streetcars, vehicle.route, [vehicle.longitude, vehicle.latitude],
            ) > STREETCAR_OFF_ROUTE_METERS),
            withStop: Boolean(vehicle && streetcars && callbacksRef.current.onSelectSurfaceStop
              && nearestStreetcarStop(streetcars, [vehicle.longitude, vehicle.latitude], [vehicle.route])),
          });
        },
      };
    }
    if (streetcarCard) {
      return {
        coordinate: streetcarCard.coordinate,
        size: (viewportWidth: number) => {
          if (streetcarCard.mode === "go-bus") {
            const goBuses = cachedGoBusCatalog();
            return streetcarCardSize(
              goBuses ? goBusCardRows(goBuses, streetcarCard.routes) : [],
              viewportWidth,
              Boolean(streetcarCard.nearestStop),
            );
          }
          if (streetcarCard.mode === "night") {
            const night = cachedNightCatalog();
            return streetcarCardSize(night ? nightCardRows(night, streetcarCard.routes) : [], viewportWidth, false);
          }
          if (streetcarCard.mode === "bus") {
            const buses = cachedBusCatalog();
            return streetcarCardSize(
              buses ? busCardRows(buses, streetcarCard.routes) : [],
              viewportWidth,
              Boolean(streetcarCard.nearestStop),
            );
          }
          const streetcars = cachedStreetcarCatalog();
          return streetcarCardSize(
            streetcars ? streetcarCardRows(streetcars, streetcarCard.routes) : [],
            viewportWidth,
            Boolean(streetcarCard.nearestStop),
          );
        },
      };
    }
    return null;
  }, [overlapChooser, streetcarCard]);
  const [overlapChooserLayout, setOverlapChooserLayout] = useState<
    (GeographicOverlapChooserLayout & { followAnchor: ChooserFollowAnchor }) | null
  >(null);
  const [overlapChooserFollower] = useState(() => new MapChooserFollower());
  const overlapChooserLayoutRef = useRef(overlapChooserLayout);
  useLayoutEffect(() => {
    overlapChooserLayoutRef.current = overlapChooserLayout;
  }, [overlapChooserLayout]);
  const [hoveredOverlapImpact, setHoveredOverlapImpact] = useState<MapImpact | null>(null);
  const [hoveredMapTarget, setHoveredMapTarget] = useState<{
    type: "segment" | "station";
    id: string;
  } | null>(null);
  const [styleRevision, setStyleRevision] = useState(0);

  // Style and generation lifecycle guards
  const appliedStyleUrlRef = useRef<string | null>(null);
  const isStyleLoadingRef = useRef<boolean>(false);
  const initGenerationRef = useRef<number>(0);

  const activeFilteredLine = filteredLineId ?? null;
  const isDraggingRef = useRef(false);
  const hoveredStationIdRef = useRef<string | null>(null);
  const hoveredStationNameDrawnRef = useRef(true);
  const stationHoverAnimatorRef = useRef<ReturnType<typeof createGeographicStationHoverAnimator> | null>(null);
  const reducedMotionRef = useRef(reducedMotion);
  useLayoutEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  // Resolve real-time dashboard data with stable references
  const dashboardData = useOptionalDashboardData();
  const resolvedNetworkSegments = useMemo(
    () => propNetworkSegments ?? (dashboardData?.networkSegments ?? EMPTY_SEGMENTS),
    [propNetworkSegments, dashboardData?.networkSegments],
  );
  const resolvedStationNodeImpacts = useMemo(
    () => propStationNodeImpacts ?? (dashboardData?.stationNodeImpacts ?? EMPTY_STATION_IMPACTS),
    [propStationNodeImpacts, dashboardData?.stationNodeImpacts],
  );
  const resolvedActiveAlerts = useMemo(
    () => propActiveAlerts ?? (dashboardData?.activeAlerts ?? EMPTY_ALERTS),
    [propActiveAlerts, dashboardData?.activeAlerts],
  );
  const resolvedPlannedClosures = useMemo(
    () => propPlannedClosures ?? (dashboardData?.plannedClosures ?? EMPTY_PLANNED_CLOSURES),
    [propPlannedClosures, dashboardData?.plannedClosures],
  );

  const lastRecenterSignalRef = useRef(recenterSignal ?? 0);
  const lastZoomInSignalRef = useRef(zoomInSignal ?? 0);
  const lastZoomOutSignalRef = useRef(zoomOutSignal ?? 0);
  const lastSelectedStationIdRef = useRef<string | null>(selectedStationId ?? null);
  // The open stop and what an open panel shows on the map, as one selection
  // (plan 14, U4), drawn by syncSurfaceSelection and framed once.
  const mapSurfaceSelection = mergeSurfaceSelection(selectedSurfaceStopCode, surfaceSelection);
  const surfaceSelectionKeyValue = surfaceSelectionKey(mapSurfaceSelection);
  const surfaceSelectionRef = useRef(mapSurfaceSelection);
  useLayoutEffect(() => {
    surfaceSelectionRef.current = mapSurfaceSelection;
  });
  // A selection already open when the map mounts keeps the restored camera, as a station does.
  const lastFramedSurfaceSelectionRef = useRef(surfaceSelectionKeyValue);
  /** Redraws the selection; set once the layer effects below have defined it. */
  const syncSurfaceSelectionRef = useRef<() => void>(() => {});
  // The Layers row's streetcar switches (plan 13), on unless the rider turned them off.
  const [streetcarRoutesShown, setStreetcarRoutesShown] = useState(() => (
    readLayerPreference(typeof window === "undefined" ? null : window.localStorage, STREETCAR_ROUTES_STORAGE_KEY, true)
  ));
  // The GO/UP deck's Live GPS switch (S9): live GO buses while GO Buses is on.
  const [goBusPositionsShown, setGoBusPositionsShown] = useState(() => (
    readGoBusPositionsPreference(typeof window === "undefined" ? null : window.localStorage)
  ));
  const [streetcarPositionsShown, setStreetcarPositionsShown] = useState(() => (
    readLayerPreference(typeof window === "undefined" ? null : window.localStorage, STREETCAR_POSITIONS_STORAGE_KEY, true)
  ));
  const streetcarRoutesShownRef = useRef(streetcarRoutesShown);
  const lastSelectionRef = useRef<string | null>(null);
  const lastCommutePreviewIdRef = useRef<string | null>(commutePathPreview?.id ?? null);
  const cameraAdjustedByUserRef = useRef(false);

  // A map camera is transient working context. Persist only settled mobile
  // cameras that the rider deliberately moved; selection flights, resizes,
  // refreshes, and desktop sessions must not redefine the next map view.
  const persistCamera = useCallback(() => {
    const map = mapRef.current;
    if (!map || !cameraAdjustedByUserRef.current) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    saveGeographicMapViewport(window.localStorage, network, {
      lng: center.lng,
      lat: center.lat,
      zoom,
    });
  }, [network]);

  // Compute active overlay GeoJSON projections
  const overlayData = useMemo(() => {
    if (!catalog) {
      return {
        impactedLinks: { type: "FeatureCollection" as const, features: [] },
        impactedStations: { type: "FeatureCollection" as const, features: [] },
        impactBadges: { type: "FeatureCollection" as const, features: [] },
        impactArrows: { type: "FeatureCollection" as const, features: [] },
        trainMarkers: { type: "FeatureCollection" as const, features: [] },
        commuteLinks: { type: "FeatureCollection" as const, features: [] },
        commuteStations: { type: "FeatureCollection" as const, features: [] },
      };
    }

    const impactedLinks = projectImpactedLinks(
      catalog,
      resolvedNetworkSegments,
      network,
      {
        plannedClosures: resolvedPlannedClosures,
        activeAlerts: resolvedActiveAlerts,
        delays: dashboardData?.delays,
        selection,
      },
    );
    const impactedStations = projectImpactedStations(catalog, [
      ...resolvedStationNodeImpacts,
      ...plannedAdvisoryStationImpacts(resolvedPlannedClosures, resolvedActiveAlerts, dashboardData?.delays, selection),
    ], network);
    const rawBadges = projectImpactBadges(catalog, impactedLinks.features, impactedStations.features, network, selection);
    const impactBadges = {
      ...rawBadges,
      features: rawBadges.features.map((feature) => {
        const rawImpacts = feature.properties.rawImpacts ?? [{
          kind: feature.properties.impactKind,
          cardId: feature.properties.cardId ?? feature.properties.targetId,
          travelDirection: "bidirectional" as const,
          sourceAlertIds: feature.properties.allCardIds ?? [feature.properties.cardId ?? feature.properties.targetId],
        }];
        const kindCounts = (feature.properties.kindCounts ?? countUniqueImpactsByKind(rawImpacts)) as { kind: MapImpactKind; count: number }[];
        const isSelected = Boolean(
          selection?.id && (feature.properties.allCardIds?.includes(selection.id) || feature.properties.cardId === selection.id)
        );
        const badgeImageKey = getOverlapBadgeKey({
          kindCounts,
          isDark,
          highContrast,
          isSelected,
        });
        return {
          ...feature,
          properties: {
            ...feature.properties,
            badgeImageKey,
            isSelected,
          },
        };
      }),
    };
    const directionalSelection = hoveredOverlapImpact
      ? { kind: hoveredOverlapImpact.kind, id: hoveredOverlapImpact.cardId }
      : selection;
    const impactArrows = projectImpactArrows(catalog, impactedLinks.features, directionalSelection);
    const trainMarkers = projectEstimatedTrainMarkers(
      catalog,
      estimatedTrainMarkers,
      {
        enabled: Boolean(estimatedTrainsEnabled && isOnline),
        isOnline,
        selectedTrainId: selection?.id,
      },
    );
    const commute = projectCommutePreview(catalog, commutePathPreview);

    return {
      impactedLinks,
      impactedStations,
      impactBadges,
      impactArrows,
      trainMarkers,
      commuteLinks: commute.links,
      commuteStations: commute.stations,
    };
  }, [
    catalog,
    resolvedNetworkSegments,
    resolvedStationNodeImpacts,
    resolvedPlannedClosures,
    resolvedActiveAlerts,
    dashboardData?.delays,
    selection,
    hoveredOverlapImpact,
    commutePathPreview,
    network,
    estimatedTrainsEnabled,
    estimatedTrainMarkers,
    isOnline,
    isDark,
    highContrast,
  ]);

  // Stable references to dynamic data & props for map listeners & style reload
  const overlayDataRef = useRef(overlayData);
  const selectedStationIdRef = useRef(selectedStationId);
  const selectionRef = useRef(selection);
  const resolvedPlannedClosuresRef = useRef(resolvedPlannedClosures);
  const activeFilteredLineRef = useRef(activeFilteredLine);
  const highContrastRef = useRef(highContrast);
  const isDarkRef = useRef(isDark);
  const callbacksRef = useRef({
    onReady,
    onSelectStationId,
    onSelectSurfaceStop,
    onSelectImpact,
    onFilterLineId,
    persistCamera,
  });
  const attentionHandlersRef = useRef({
    applyAttentionFrame,
    startAttentionLoop,
    stopAttentionLoop,
  });

  useLayoutEffect(() => {
    loadStatusRef.current = loadStatus;
    overlayDataRef.current = overlayData;
    selectedStationIdRef.current = selectedStationId;
    selectionRef.current = selection;
    resolvedPlannedClosuresRef.current = resolvedPlannedClosures;
    activeFilteredLineRef.current = activeFilteredLine;
    highContrastRef.current = highContrast;
    isDarkRef.current = isDark;
    callbacksRef.current = {
      onReady,
      onSelectStationId,
      onSelectSurfaceStop,
      onSelectImpact,
      onFilterLineId,
      persistCamera,
    };
    attentionHandlersRef.current = {
      applyAttentionFrame,
      startAttentionLoop,
      stopAttentionLoop,
    };
  }, [loadStatus, overlayData, selectedStationId, selection, resolvedPlannedClosures, activeFilteredLine, highContrast, isDark, onReady, onSelectStationId, onSelectSurfaceStop, onSelectImpact, onFilterLineId, persistCamera, applyAttentionFrame, startAttentionLoop, stopAttentionLoop]);

  const activateImpactTarget = useCallback(
    (
      targetType: "segment" | "station",
      targetId: string,
      coordinate: [number, number],
    ) => {
      const data = overlayDataRef.current;
      const group = getProjectedImpactGroup(
        targetType,
        targetId,
        data.impactedLinks.features,
        data.impactedStations.features,
      );
      if (!group) {
        const badge = data.impactBadges.features.find(
          (f) => f.properties.targetType === targetType && f.properties.targetId === targetId,
        );
        if (badge) {
          const raw = badge.properties.rawImpacts ?? [];
          if (raw.length <= 1 && raw[0]) {
            callbacksRef.current.onSelectImpact?.({ kind: raw[0].kind, id: raw[0].cardId });
          } else if (raw.length > 1) {
            setHoveredOverlapImpact(null);
            setOverlapChooser({
              markerId: `geographic-${targetType}-${targetId}`,
              targetId,
              targetType,
              label: badge.properties.label ?? "Alerts",
              impacts: raw.map((r) => ({
                kind: r.kind,
                cardId: r.cardId,
                travelDirection: r.travelDirection ?? "bidirectional",
                sourceAlertIds: r.sourceAlertIds ?? [r.cardId],
              })),
              coordinate,
            });
          }
        }
        return;
      }
      const impacts = uniqueMapImpacts(group.impacts);
      if (impacts.length <= 1) {
        const impact = impacts[0];
        if (impact) {
          callbacksRef.current.onSelectImpact?.({ kind: impact.kind, id: impact.cardId });
        }
        return;
      }
      setHoveredOverlapImpact(null);
      setOverlapChooser({
        markerId: `geographic-${targetType}-${targetId}`,
        targetId,
        targetType,
        label: group.label,
        impacts,
        coordinate,
      });
    },
    [],
  );

  const attachMapListeners = useCallback((map: MapLibreMap) => {
    const impactBadgeAtPoint = (point: ReturnType<MapLibreMap["project"]>) => {
      const exactBadge = map.getLayer("transit-impact-badges")
        ? map.queryRenderedFeatures(point, { layers: ["transit-impact-badges"] })[0]
        : undefined;
      if (exactBadge?.properties?.targetType && exactBadge.properties.targetId) return exactBadge;

      const hitRadius = GEOGRAPHIC_IMPACT_BADGE_MIN_HIT_DIAMETER_PX / 2;
      return overlayDataRef.current.impactBadges.features
        .filter((feature) => (feature.properties.kindCounts?.length ?? 0) === 1)
        .map((feature) => ({
          feature,
          distance: map.project(feature.geometry.coordinates).dist(point),
        }))
        .filter(({ distance }) => distance <= hitRadius)
        .sort((a, b) => a.distance - b.distance)[0]?.feature;
    };

    // The station a press at `point` selects: its marker (a little enlarged)
    // or its name. As on the System Map, an overlap badge or a station alert
    // ring under the point takes the press instead, and a station drawn over
    // a line alert takes it from the line.
    const stationAtPoint = (point: ReturnType<MapLibreMap["project"]>): string | null => {
      if (impactBadgeAtPoint(point)) return null;
      if (map.getLayer("transit-station-impacts")
        && map.queryRenderedFeatures(point, { layers: ["transit-station-impacts"] }).length > 0) return null;
      if (map.getLayer("transit-planned-station-selection")
        && map.queryRenderedFeatures(point, { layers: ["transit-planned-station-selection"] }).length > 0) return null;
      const layers = ["transit-stations-hit", "transit-station-labels", "transit-station-labels-hover"]
        .filter((layerId) => map.getLayer(layerId));
      if (layers.length === 0) return null;
      const stationId = map.queryRenderedFeatures(point, { layers })[0]?.properties?.stationId;
      return typeof stationId === "string" && stationId ? stationId : null;
    };

    // Whether the station's own name is drawn (not lost to a collision).
    const stationNameDrawn = (stationId: string) => {
      const coordinates = catalogRef.current && getStationCoordinates(catalogRef.current, stationId);
      if (!coordinates || !map.getLayer("transit-station-labels")) return false;
      const point = map.project(coordinates);
      return map.queryRenderedFeatures(
        [[point.x - 160, point.y - 80], [point.x + 160, point.y + 80]],
        { layers: ["transit-station-labels"] },
      ).some((feature) => feature.properties?.stationId === stationId);
    };

    // Hover eases in and out like the System Map's; reduced motion jumps.
    stationHoverAnimatorRef.current?.dispose();
    const stationHoverAnimator = createGeographicStationHoverAnimator(map, {
      reducedMotion: () => reducedMotionRef.current
        || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    });
    stationHoverAnimatorRef.current = stationHoverAnimator;

    const setHoveredStation = (stationId: string | null) => {
      if (hoveredStationIdRef.current === stationId) return;
      hoveredStationIdRef.current = stationId;
      stationHoverAnimator.setHovered(stationId);
      hoveredStationNameDrawnRef.current = stationId ? stationNameDrawn(stationId) : true;
      updateGeographicStationHover(map, stationId, selectedStationIdRef.current ?? null, {
        nameDrawn: hoveredStationNameDrawnRef.current,
      });
      const container = containerRef.current;
      if (container) {
        if (stationId) container.dataset.hoveredStation = stationId;
        else delete container.dataset.hoveredStation;
      }
    };

    // Station hover: the same ring and lifted name as the System Map, so a
    // pointer shows which station a press selects. Touch has no hover.
    // Taps send compatibility mouse events; only a hovering pointer shows
    // hover (the System Map's `(hover: hover) and (pointer: fine)`).
    const pointerHovers = typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: hover) and (pointer: fine)")
      : null;
    map.on("mousemove", (e) => {
      if (isDraggingRef.current || (pointerHovers && !pointerHovers.matches)) return;
      const stationId = stationAtPoint(e.point);
      setHoveredStation(stationId);
      if (stationId) {
        setHoveredMapTarget((current) => (current?.type === "segment" ? null : current));
      }
      map.getCanvas().style.cursor = stationId || map.queryRenderedFeatures(e.point, {
        layers: GEOGRAPHIC_POINTER_LAYERS.filter((layerId) => map.getLayer(layerId)),
      }).length > 0 || impactBadgeAtPoint(e.point) ? "pointer" : "";
    });
    map.getCanvasContainer().addEventListener("mouseleave", () => setHoveredStation(null));
    map.on("style.load", () => {
      hoveredStationIdRef.current = null;
      stationHoverAnimator.reset();
      const container = containerRef.current;
      if (container) delete container.dataset.hoveredStation;
    });

    // Hover on Disruption Badges
    map.on("mousemove", "transit-impact-badges", (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      if ((props?.targetType === "segment" || props?.targetType === "station") && props.targetId) {
        setHoveredMapTarget((current) => current?.type === props.targetType && current?.id === props.targetId
          ? current
          : { type: props.targetType, id: props.targetId });
      }
      if (props?.rawImpacts) {
        try {
          const raw = typeof props.rawImpacts === "string" ? JSON.parse(props.rawImpacts) : props.rawImpacts;
          if (Array.isArray(raw) && raw.length > 0) {
            setHoveredOverlapImpact({
              kind: raw[0].kind,
              cardId: raw[0].cardId,
              travelDirection: raw[0].travelDirection ?? "bidirectional",
              sourceAlertIds: raw[0].sourceAlertIds ?? [raw[0].cardId],
            });
            return;
          }
        } catch {}
      }
      if (props?.impactKind && props?.cardId) {
        setHoveredOverlapImpact({
          kind: props.impactKind,
          cardId: props.cardId,
          travelDirection: props.travelDirection ?? "bidirectional",
          sourceAlertIds: props.allCardIds ?? [props.cardId],
        });
      }
    });
    map.on("mouseleave", "transit-impact-badges", () => {
      setHoveredOverlapImpact(null);
      setHoveredMapTarget(null);
    });

    for (const [layerId, type, property] of [
      ["transit-impacts-line", "segment", "segmentId"],
      ["transit-station-impacts", "station", "stationId"],
    ] as const) {
      map.on("mousemove", layerId, (event) => {
        const id = event.features?.[0]?.properties?.[property];
        if (!id) return;
        if (type === "segment" && stationAtPoint(event.point)) return;
        setHoveredMapTarget((current) => current?.type === type && current.id === id
          ? current
          : { type, id });
      });
      map.on("mouseleave", layerId, () => setHoveredMapTarget(null));
    }

    // Bus route badges (S5, S6) and station plan bay badges (S7) are drawn
    // when the map first needs them, only for those in view. MapLibre 6 asks
    // the resolver before drawing; a styleimagemissing listener cannot supply
    // the image for the request that fired it.
    map.setMissingStyleImageResolver((id) => {
      if (addMissingBusBadgeImage(map, id) || addMissingGoBusBadgeImage(map, id) || addMissingNightBadgeImage(map, id)) return;
      addMissingStationBayImage(map, id);
    });
    // Dynamic style image fallback for overlap badges.
    map.on("styleimagemissing", (e) => {
      const id = e.id;
      if (!id || !id.startsWith("overlap-badge:")) return;
      const badgeInfo = parseOverlapBadgeKey(id);
      if (!badgeInfo) return;
      const svg = generateOverlapBadgeSvg(badgeInfo);
      createSvgImage(svg)
        .then((img) => {
          if (map && map.hasImage && !map.hasImage(id)) {
            map.addImage(id, img, { pixelRatio: MAP_BADGE_PIXEL_RATIO });
          }
        })
        .catch(() => {});
    });

    // Click on Station Impacts
    map.on("click", "transit-station-impacts", (e) => {
      if (impactBadgeAtPoint(e.point)) return;
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      if (props?.stationId) {
        activateImpactTarget("station", props.stationId, e.lngLat.toArray());
      }
    });

    // Click on Impacted Segments
    map.on("click", "transit-impacts-line", (e) => {
      if (impactBadgeAtPoint(e.point) || stationAtPoint(e.point)) return;
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      if (props?.segmentId) {
        activateImpactTarget("segment", props.segmentId, e.lngLat.toArray());
      }
    });

    // Click on Impact Direction Arrows
    map.on("click", "transit-impact-arrows", (e) => {
      if (impactBadgeAtPoint(e.point) || stationAtPoint(e.point)) return;
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      if (props && callbacksRef.current.onSelectImpact) {
        callbacksRef.current.onSelectImpact({
          kind: props.impactKind,
          id: props.impactCardId,
        });
      }
    });

    // Station presses (marker or name) are resolved in the map click
    // handler below, through stationAtPoint, so one press selects one thing.

    map.on("click", "transit-planned-station-selection", () => {
      if (selectionRef.current?.kind === "planned-closure") {
        callbacksRef.current.onSelectImpact?.(selectionRef.current);
      }
    });

    // Badge clicks use exact rendered-symbol hits first. Single-circle badges
    // also receive a 44px minimum target so their interaction area does not
    // shrink below the visible marker at low zoom or high pixel density.
    map.on("click", (e) => {
      setStreetcarCard(null);
      const badge = impactBadgeAtPoint(e.point);
      if (badge) {
        activateImpactTarget(
          badge.properties.targetType,
          badge.properties.targetId,
          (badge.geometry as GeoJSON.Point).coordinates as [number, number],
        );
        return;
      }

      const stationId = stationAtPoint(e.point);
      if (stationId) {
        callbacksRef.current.onSelectStationId?.(stationId);
        return;
      }

      // A live streetcar (S4), drawn over stop pills, opens its card: route, report age, next stop.
      const vehicleKey = streetcarVehicleKeyAtPoint(map, e.point);
      if (vehicleKey) {
        setOverlapChooser(null);
        setHoveredOverlapImpact(null);
        const vehicle = findStreetcarVehicle(streetcarPositionsRef.current, vehicleKey);
        setStreetcarCard({
          kind: "vehicle",
          key: vehicleKey,
          coordinate: vehicle ? [vehicle.longitude, vehicle.latitude] : e.lngLat.toArray() as [number, number],
        });
        return;
      }

      // A live bus (S8), drawn under live cars and over stop labels, opens its card.
      const busKey = busVehicleKeyAtPoint(map, e.point);
      if (busKey) {
        setOverlapChooser(null);
        setHoveredOverlapImpact(null);
        const bus = findBusVehicle(busPositionsRef.current, busKey);
        setStreetcarCard({
          kind: "bus-vehicle",
          key: busKey,
          coordinate: bus ? [bus.longitude, bus.latitude] : e.lngLat.toArray() as [number, number],
        });
        return;
      }

      // A live GO bus (S9), on GO/UP, drawn under the train markers, opens its card.
      const goBusKey = goBusVehicleKeyAtPoint(map, e.point);
      if (goBusKey) {
        setOverlapChooser(null);
        setHoveredOverlapImpact(null);
        const bus = findGoBusVehicle(goBusPositionsRef.current, goBusKey);
        setStreetcarCard({
          kind: "go-bus-vehicle",
          key: goBusKey,
          coordinate: bus ? [bus.longitude, bus.latitude] : e.lngLat.toArray() as [number, number],
        });
        return;
      }

      // A stop-number pill opens that stop's departures (streetcar stops are drawn
      // over bus stops); a station plan's bus bay badge (S7) is drawn over both.
      const stopCode = stationBayStopCodeAtPoint(map, e.point)
        ?? streetcarStopCodeAtPoint(map, e.point) ?? busStopCodeAtPoint(map, e.point)
        ?? surfaceSelectionStopCodeAtPoint(map, e.point, NIGHT_STOP_SELECTION_TARGET.prefix)
        ?? goBusStopCodeAtPoint(map, e.point);
      if (stopCode && callbacksRef.current.onSelectSurfaceStop) {
        setOverlapChooser(null);
        setHoveredOverlapImpact(null);
        callbacksRef.current.onSelectSurfaceStop(stopCode);
        return;
      }

      // A streetcar line under the press shows its routes, unless an alert
      // drawn there takes the press (its own click handler acts on it).
      const alertLayers = [
        "transit-station-impacts",
        "transit-impacts-line",
        "transit-impact-arrows",
        "transit-planned-station-selection",
      ].filter((layerId) => map.getLayer(layerId));
      const onAlert = alertLayers.length > 0
        && map.queryRenderedFeatures(e.point, { layers: alertLayers }).length > 0;
      const streetcarLayers = [STREETCAR_HIT_LAYER, STREETCAR_BADGE_LAYER].filter((layerId) => map.getLayer(layerId));
      if (!onAlert && streetcarLayers.length > 0) {
        const routes = streetcarRoutesFromFeatures(map.queryRenderedFeatures(
          [[e.point.x - 3, e.point.y - 3], [e.point.x + 3, e.point.y + 3]],
          { layers: streetcarLayers },
        ));
        if (routes.length > 0) {
          setOverlapChooser(null);
          setHoveredOverlapImpact(null);
          const coordinate = e.lngLat.toArray() as [number, number];
          const streetcars = cachedStreetcarCatalog();
          const nearestStop = streetcars && callbacksRef.current.onSelectSurfaceStop
            ? nearestStreetcarStop(streetcars, coordinate, routes)?.stop ?? null
            : null;
          setStreetcarCard({ kind: "routes", mode: "streetcar", routes, coordinate, nearestStop });
          return;
        }
      }

      // A bus line (S5), drawn under the streetcars, shows its routes the same way.
      const busLayers = [BUS_HIT_LAYER, BUS_BADGE_LAYER].filter((layerId) => map.getLayer(layerId));
      if (!onAlert && busLayers.length > 0) {
        const routes = streetcarRoutesFromFeatures(map.queryRenderedFeatures(
          [[e.point.x - 3, e.point.y - 3], [e.point.x + 3, e.point.y + 3]],
          { layers: busLayers },
        ));
        if (routes.length > 0) {
          setOverlapChooser(null);
          setHoveredOverlapImpact(null);
          const coordinate = e.lngLat.toArray() as [number, number];
          const busStops = cachedBusStops();
          const nearestStop = busStops && callbacksRef.current.onSelectSurfaceStop
            ? nearestBusStop(busStops, coordinate, routes)?.stop ?? null
            : null;
          setStreetcarCard({ kind: "routes", mode: "bus", routes, coordinate, nearestStop });
          return;
        }
      }

      // A night line (S10), drawn under the daytime lines, shows its night routes.
      const nightLayers = NIGHT_PRESS_LAYERS.filter((layerId) => map.getLayer(layerId));
      if (!onAlert && nightLayers.length > 0) {
        const routes = streetcarRoutesFromFeatures(map.queryRenderedFeatures(
          [[e.point.x - 3, e.point.y - 3], [e.point.x + 3, e.point.y + 3]],
          { layers: nightLayers },
        ));
        if (routes.length > 0) {
          setOverlapChooser(null);
          setHoveredOverlapImpact(null);
          setStreetcarCard({ kind: "routes", mode: "night", routes, coordinate: e.lngLat.toArray() as [number, number], nearestStop: null });
          return;
        }
      }

      // A GO bus line (S6), drawn under the GO/UP rail lines, shows its routes the same way.
      const goBusLayers = [GO_BUS_HIT_LAYER, GO_BUS_BADGE_LAYER].filter((layerId) => map.getLayer(layerId));
      if (!onAlert && goBusLayers.length > 0) {
        const routes = streetcarRoutesFromFeatures(map.queryRenderedFeatures(
          [[e.point.x - 3, e.point.y - 3], [e.point.x + 3, e.point.y + 3]],
          { layers: goBusLayers },
        ));
        if (routes.length > 0) {
          setOverlapChooser(null);
          setHoveredOverlapImpact(null);
          const coordinate = e.lngLat.toArray() as [number, number];
          const goStops = cachedGoBusStops();
          const nearestStop = goStops && callbacksRef.current.onSelectSurfaceStop
            ? nearestGoBusStop(goStops, coordinate, routes)?.stop ?? null
            : null;
          setStreetcarCard({ kind: "routes", mode: "go-bus", routes, coordinate, nearestStop });
          return;
        }
      }

      // Empty map background clicks clear selection and filters.
      const interactiveLayers = [
        "transit-station-impacts",
        "transit-impacts-line",
        "transit-impact-arrows",
        "transit-stations-outer",
        "transit-stations-hit",
        "transit-station-labels",
        "transit-planned-station-selection",
      ].filter((l) => map.getLayer(l));

      const features = map.queryRenderedFeatures(e.point, { layers: interactiveLayers });
      if (features.length === 0) {
        callbacksRef.current.onSelectSurfaceStop?.(null);
        callbacksRef.current.onSelectStationId?.(null);
        callbacksRef.current.onSelectImpact?.(null as unknown as ImpactSelection);
      }
    });

    // The pointer cursor is set by the map mousemove handler above.

    map.on("dragstart", () => {
      cameraAdjustedByUserRef.current = true;
      isDraggingRef.current = true;
      setHoveredMapTarget(null);
      setHoveredStation(null);
    });

    map.on("dragend", () => {
      window.setTimeout(() => {
        isDraggingRef.current = false;
      }, 80);
    });

    // The selection flash keeps its cadence through user pans and zooms.
    map.on("zoomstart", (e) => {
      if (e.originalEvent) cameraAdjustedByUserRef.current = true;
    });

    map.on("zoom", () => {
      if (sliderRef.current) {
        sliderRef.current.value = String(map.getZoom());
      }
    });

    map.on("moveend", () => {
      recordGeographicMapLifecycle("moveend");
      if (sliderRef.current) {
        sliderRef.current.value = String(map.getZoom());
      }
      setCurrentZoom(map.getZoom());
      callbacksRef.current.persistCamera();

      if (pendingCameraFlightGenRef.current !== null) {
        const flightGen = pendingCameraFlightGenRef.current;
        pendingCameraFlightGenRef.current = null;
        const frame = selectionAttentionRef.current.onCameraFlightEnd(flightGen);
        attentionHandlersRef.current.applyAttentionFrame(frame);
        if (frame.active) {
          attentionHandlersRef.current.startAttentionLoop();
        }
      }
    });
  }, [activateImpactTarget]);

  // Main Map lifecycle: owns creation, initial catalog acquisition, listeners, and cleanup.
  // Network switches update transit layers without recreating the base map or camera.
  useEffect(() => {
    const network = networkRef.current;
    let cancelled = false;
    let timeoutId: number | null = null;
    let stopPrefetch: (() => void) | null = null;
    const currentGeneration = ++initGenerationRef.current;

    // Bounded loading timeout (12s engineering default)
    timeoutId = window.setTimeout(() => {
      if (!cancelled && currentGeneration === initGenerationRef.current) {
        setLoadStatus("error");
        recordGeographicMapLifecycle("error", "timeout");
        setErrorMessage("Map loading timed out (12 seconds). Check your internet connection.");
      }
    }, GEOGRAPHIC_LOAD_TIMEOUT_MS);

    async function init() {
      try {
        if (!containerRef.current) return;
        setLoadStatus("loading");
        recordGeographicMapLifecycle("loading", "init");

        // MapLibre 6 requires WebGL2; keep the diagram fallback available.
        if (!isWebGL2Supported()) {
          if (!cancelled && currentGeneration === initGenerationRef.current) {
            setLoadStatus("error");
            recordGeographicMapLifecycle("error", "webgl-unsupported");
            setErrorMessage("WebGL2 is not available on this device or browser. Use Diagram to view the network.");
          }
          return;
        }

        const loadedCatalog = await loadGeographicCatalog(network);
        if (cancelled || currentGeneration !== initGenerationRef.current) return;
        catalogRef.current = loadedCatalog;
        setCatalog(loadedCatalog);

        // Restore saved camera or fallback to network bounds
        const mobile = window.matchMedia("(max-width: 767px)").matches;
        const savedCamera = mobile
          ? readGeographicMapViewport(window.localStorage, network)
          : null;

        const initialCenter = savedCamera
          ? ([savedCamera.lng, savedCamera.lat] as [number, number])
          : getGeographicCenter(network);
        const initialZoom = savedCamera ? savedCamera.zoom : getGeographicDefaultZoom(network);
        setCurrentZoom(initialZoom);

        const initialStyleUrl = isDarkRef.current ? OPENFREEMAP_STYLES.dark : OPENFREEMAP_STYLES.light;
        appliedStyleUrlRef.current = initialStyleUrl;

        // Next.js does not emit MapLibre's worker and its shared module together.
        // predev/prebuild copies the installed pair to this versioned path.
        setWorkerUrl(`/assets/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);
        recordGeographicMapLifecycle("constructor", `network:${network}`);
        const map = new MapLibreMap({
          container: containerRef.current,
          style: initialStyleUrl,
          center: initialCenter,
          zoom: initialZoom,
          minZoom: GEOGRAPHIC_MIN_ZOOM,
          maxZoom: GEOGRAPHIC_MAX_ZOOM,
          pitch: 0,
          maxPitch: 0,
          dragRotate: false,
          touchPitch: false,
          attributionControl: false,
        });

        // Disable pitch and rotation interactions
        map.touchZoomRotate.disableRotation();
        mapRef.current = map;
        // Dev-only handle for scripted checks (never return the map itself from page.evaluate).
        if (process.env.NODE_ENV !== "production") window.__geographicMapDebug = { map };
        attributionRef.current = new AttributionControl({ compact: false, customAttribution: getGeographicAttribution(network) });
        map.addControl(attributionRef.current, "bottom-right");
        if (networkFadeRef) networkFadeRef.current = createGeographicMapFade(map);
        stopPrefetch = installTilePrefetch(map, () => openMapTilesPrefetchSources(map));

        map.on("load", () => {
          if (cancelled || currentGeneration !== initGenerationRef.current) return;
          if (timeoutId !== null) window.clearTimeout(timeoutId);

          installTransitLayers(
            map,
            loadedCatalog!,
            network,
            isDarkRef.current,
            highContrastRef.current,
            { streetcarRoutes: streetcarRoutesShownRef.current },
          );
          applyGeographicDynamicState(map, {
            overlayData: overlayDataRef.current,
            activeFilteredLine: activeFilteredLineRef.current,
            selectedStationId: selectedStationIdRef.current ?? null,
            selection: selectionRef.current ?? null,
            plannedClosures: resolvedPlannedClosuresRef.current,
          });

          appliedCatalogRef.current = loadedCatalog;
          attachMapListeners(map);

          setLoadStatus("ready");
          recordGeographicMapLifecycle("ready", "map loaded");
          if (networkRef.current === network) callbacksRef.current.onReady?.();
        });

        map.on("error", (e) => {
          // Normal tile errors during usable state must not trigger a full error overlay or return to loading
          if (loadStatusRef.current !== "ready") {
            if (e.error?.message?.includes("style") || e.error?.message?.includes("Failed to fetch")) {
              if (!cancelled && currentGeneration === initGenerationRef.current) {
                setLoadStatus("error");
                recordGeographicMapLifecycle("error", "style error");
                setErrorMessage("Failed to load map style from OpenFreeMap.");
              }
            }
          }
        });

        const canvas = map.getCanvas();
        canvas.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          if (!cancelled && currentGeneration === initGenerationRef.current) {
            setLoadStatus("error");
            recordGeographicMapLifecycle("error", "webglcontextlost");
            setErrorMessage("WebGL graphics context was lost. Please retry or use Diagram.");
          }
        });
      } catch (err: unknown) {
        if (!cancelled && currentGeneration === initGenerationRef.current) {
          setLoadStatus("error");
          recordGeographicMapLifecycle("error", err instanceof Error ? err.message : "init error");
          setErrorMessage(err instanceof Error ? err.message : "Failed to load map.");
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      stopPrefetch?.();
      if (mapRef.current) {
        recordGeographicMapLifecycle("removal", "cleanup");
        stationHoverAnimatorRef.current?.dispose();
        stationHoverAnimatorRef.current = null;
        mapRef.current.remove();
        mapRef.current = null;
        appliedStyleUrlRef.current = null;
        appliedCatalogRef.current = null;
        attributionRef.current = null;
        if (networkFadeRef) networkFadeRef.current = null;
      }
    };
  }, [retryCount, attachMapListeners, networkFadeRef]);

  // Catalog fetching is independent of the WebGL instance's lifetime.
  useEffect(() => {
    if (catalog) return;
    let cancelled = false;
    void loadGeographicCatalog(network).then(next => {
      if (!cancelled) setCatalog(next);
    }, () => {
      if (!cancelled && loadStatusRef.current !== "ready") {
        setLoadStatus("error");
        setErrorMessage("Unable to load map routes. Please retry or use Diagram.");
      }
    });
    return () => { cancelled = true; };
  }, [catalog, network]);

  // Install only destination transit layers; base style, canvas, and camera survive.
  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || isStyleLoadingRef.current || !catalog || appliedCatalogRef.current === catalog) return;
    stopAttentionLoop();
    selectionAttentionRef.current = new GeographicSelectionAttention();
    cameraAdjustedByUserRef.current = false;
    setOverlapChooser(null);
    setStreetcarCard(null);
    setHoveredOverlapImpact(null);
    setHoveredMapTarget(null);
    for (const layer of map.getStyle().layers) {
      if (layer.id.startsWith("transit-")) map.removeLayer(layer.id);
    }
    catalogRef.current = catalog;
    installTransitLayers(map, catalog, network, isDarkRef.current, highContrastRef.current, {
      overlayData: overlayDataRef.current, activeFilteredLine: activeFilteredLineRef.current,
      selectedStationId: selectedStationIdRef.current ?? null,
      selection: selectionRef.current ?? null, plannedClosures: resolvedPlannedClosuresRef.current,
      streetcarRoutes: streetcarRoutesShownRef.current,
    });
    appliedCatalogRef.current = catalog;
    if (attributionRef.current) map.removeControl(attributionRef.current);
    attributionRef.current = new AttributionControl({ compact: false, customAttribution: getGeographicAttribution(network) });
    map.addControl(attributionRef.current, "bottom-right");

    // Source workers must finish before the new overlays begin their fade.
    let cancelled = false;
    let awaitingRender = false;
    const sourceIds = map.getStyle().layers.filter(layer => layer.id.startsWith("transit-") && "source" in layer)
      .map(layer => (layer as { source: string }).source);
    const rendered = () => {
      if (cancelled || mapRef.current !== map || networkRef.current !== network) return;
      if (sourceIds.every(id => map.isSourceLoaded(id))) callbacksRef.current.onReady?.();
      else {
        awaitingRender = false;
        map.on("sourcedata", ready);
      }
    };
    const ready = () => {
      if (awaitingRender || !sourceIds.every(id => map.isSourceLoaded(id))) return;
      awaitingRender = true;
      map.off("sourcedata", ready);
      map.once("render", rendered);
      map.triggerRepaint();
    };
    map.on("sourcedata", ready);
    ready();
    return () => {
      cancelled = true;
      map.off("sourcedata", ready);
      map.off("render", rendered);
    };
  }, [catalog, network, loadStatus, styleRevision, stopAttentionLoop]);

  // Update dynamic overlay sources in-place whenever live data or commute changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || isStyleLoadingRef.current) return;
    updateGeographicDynamicSources(map, overlayData);
  }, [overlayData, loadStatus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || isStyleLoadingRef.current) return;

    let segmentIds: string[] = [];
    let stationIds: string[] = [];
    if (overlapChooser) {
      const impactId = hoveredOverlapImpact?.cardId;
      if (impactId) {
        segmentIds = overlayData.impactedLinks.features
          .filter((feature) => feature.properties.allCardIds.includes(impactId))
          .map((feature) => feature.properties.segmentId);
        stationIds = overlayData.impactedStations.features
          .filter((feature) => feature.properties.allCardIds?.includes(impactId))
          .map((feature) => feature.properties.stationId);
      }
    } else if (hoveredMapTarget?.type === "segment") {
      segmentIds = [hoveredMapTarget.id];
    } else if (hoveredMapTarget?.type === "station") {
      stationIds = [hoveredMapTarget.id];
    }

    const filterFor = (property: "segmentId" | "stationId", ids: string[]): Parameters<MapLibreMap["setFilter"]>[1] => (
      ids.length > 0
        ? ["in", ["get", property], ["literal", [...new Set(ids)]]]
        : ["==", ["get", property], ""]
    );
    for (const layerId of ["transit-impacts-hover-edge", "transit-impacts-hover-core"]) {
      if (map.getLayer(layerId)) map.setFilter(layerId, filterFor("segmentId", segmentIds));
    }
    if (map.getLayer("transit-station-impacts-hover")) {
      map.setFilter("transit-station-impacts-hover", filterFor("stationId", stationIds));
    }

    const container = containerRef.current;
    if (container) {
      if (segmentIds.length === 1) container.dataset.hoveredImpactSegment = segmentIds[0];
      else delete container.dataset.hoveredImpactSegment;
      if (stationIds.length === 1) container.dataset.hoveredImpactStation = stationIds[0];
      else delete container.dataset.hoveredImpactStation;
    }
  }, [hoveredMapTarget, hoveredOverlapImpact, loadStatus, overlapChooser, overlayData, styleRevision]);

  // React to line/corridor filtering changes via paint properties
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;
    updateGeographicLineFilter(map, activeFilteredLine);
  }, [activeFilteredLine, loadStatus]);

  // Streetcars load only for the TTC network, after the map is usable. Later
  // installs (theme or network changes) read the cached catalog themselves.
  const [streetcarCatalog, setStreetcarCatalog] = useState(cachedStreetcarCatalog);
  useEffect(() => {
    if (loadStatus !== "ready" || network !== "ttc") return;
    let cancelled = false;
    loadStreetcarCatalog().then((loaded) => {
      if (cancelled) return;
      setStreetcarCatalog(loaded);
      const map = mapRef.current;
      if (!map || isStyleLoadingRef.current || appliedCatalogRef.current?.network !== "ttc" || hasStreetcarLayers(map)) return;
      if (!streetcarRoutesShownRef.current) return;
      installStreetcarLayers(map, loaded, { dark: isDarkRef.current, activeFilteredLine: activeFilteredLineRef.current });
      installTransitOpacity(map);
    }, () => {
      // Streetcars are an optional layer; the subway map stays usable without them.
    });
    return () => { cancelled = true; };
  }, [loadStatus, network, styleRevision]);

  // TTC buses (S5): while the toggle is on, on the TTC network, the corridors
  // load once and install (again after a style change); the stop file loads
  // near stop zoom, or when a stop opens. Off removes the layers and sources.
  const busesShown = busesEnabled && network === "ttc";
  const busesShownRef = useRef(busesShown);
  if (!busesShown && streetcarCard?.kind === "routes" && (streetcarCard.mode === "bus" || streetcarCard.mode === "night")) {
    setStreetcarCard(null);
  }
  useLayoutEffect(() => {
    busesShownRef.current = busesShown;
  }, [busesShown]);
  const [busCatalog, setBusCatalog] = useState(cachedBusCatalog);
  const [nightCatalog, setNightCatalog] = useState(cachedNightCatalog);
  const [busStops, setBusStops] = useState(cachedBusStops);
  const syncBusLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || isStyleLoadingRef.current || loadStatusRef.current !== "ready") return;
    if (!busesShownRef.current || appliedCatalogRef.current?.network !== "ttc") {
      removeNightLayers(map);
      removeBusLayers(map);
      // A selected bus or night route or stop still draws on its own.
      syncSurfaceSelectionRef.current();
      return;
    }
    let installed = false;
    // The night network (S10) shows with Bus Routes, under the daytime lines.
    const nightRoutes = cachedNightCatalog();
    if (nightRoutes && !hasNightLayers(map)) {
      installNightLayers(map, nightRoutes, { dark: isDarkRef.current, activeFilteredLine: activeFilteredLineRef.current });
      installed = true;
    }
    const corridors = cachedBusCatalog();
    if (!corridors) {
      if (installed) installTransitOpacity(map);
      return;
    }
    if (!hasBusLayers(map)) {
      installBusLayers(map, corridors, { dark: isDarkRef.current, activeFilteredLine: activeFilteredLineRef.current });
      installed = true;
    }
    const stops = cachedBusStops();
    if (stops && !hasBusStopLayers(map)) {
      installBusStopLayers(map, stops, {
        activeFilteredLine: activeFilteredLineRef.current,
        selectedStopCodes: surfaceSelectionRef.current?.stopCodes ?? [],
        streetcarStopCodes: streetcarRoutesShownRef.current ? streetcarStopCodeSet(cachedStreetcarCatalog()) : new Set(),
      });
      installed = true;
    }
    if (installed) installTransitOpacity(map);
  }, []);
  useEffect(() => {
    if (loadStatus !== "ready") return;
    syncBusLayers();
    if (!busesShown) return;
    let cancelled = false;
    loadBusCatalog().then((loaded) => {
      if (cancelled) return;
      setBusCatalog(loaded);
      syncBusLayers();
    }, () => {
      // Buses are an optional layer; the map stays usable without them.
    });
    loadNightCatalog().then((loaded) => {
      if (cancelled) return;
      setNightCatalog(loaded);
      syncBusLayers();
    }, () => {
      // Night routes are optional; the daytime layers draw without them.
    });
    return () => { cancelled = true; };
  }, [busesShown, loadStatus, styleRevision, syncBusLayers]);
  const wantBusStops = busesShown && (currentZoom >= BUS_STOPS_LOAD_ZOOM || Boolean(mapSurfaceSelection?.stopCodes.length)
    || streetcarCard?.kind === "bus-vehicle");
  useEffect(() => {
    if (loadStatus !== "ready" || !wantBusStops) return;
    let cancelled = false;
    loadBusStops().then((loaded) => {
      if (cancelled) return;
      setBusStops(loaded);
      syncBusLayers();
    }, () => {
      // Without the stop file the bus lines still draw.
    });
    return () => { cancelled = true; };
  }, [loadStatus, syncBusLayers, wantBusStops]);
  // Station floor plans (S7): no switch. Once the TTC Map View nears plan
  // zoom the map is given the file's URL (MapLibre's worker fetches and
  // parses it, 91 KB gzipped), then installTransitLayers draws plans after
  // every style change or network switch.
  const stationPlansWanted = network === "ttc" && currentZoom >= STATION_PLANS_LOAD_ZOOM;
  useEffect(() => {
    if (loadStatus !== "ready" || !stationPlansWanted) return;
    requestStationPlans();
    void prepareStationPlanImages();
    const map = mapRef.current;
    if (!map || isStyleLoadingRef.current || appliedCatalogRef.current?.network !== "ttc" || hasStationPlanLayers(map)) return;
    if (installStationPlanLayers(map, { dark: isDarkRef.current })) installTransitOpacity(map);
  }, [loadStatus, stationPlansWanted, styleRevision]);

  // The Streetcar Routes switch adds or removes the routes and their stops;
  // live cars and the catalog's lookups stay. A shared pole moves to the bus
  // layer's label while streetcar routes are off.
  useLayoutEffect(() => {
    streetcarRoutesShownRef.current = streetcarRoutesShown;
  }, [streetcarRoutesShown]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || network !== "ttc" || !streetcarCatalog || isStyleLoadingRef.current) return;
    if (appliedCatalogRef.current?.network !== "ttc") return;
    if (streetcarRoutesShown === hasStreetcarLayers(map)) return;
    if (streetcarRoutesShown) {
      installStreetcarLayers(map, streetcarCatalog, {
        dark: isDarkRef.current,
        activeFilteredLine: activeFilteredLineRef.current,
        selectedStopCodes: surfaceSelectionRef.current?.stopCodes ?? [],
      });
      installTransitOpacity(map);
    } else {
      removeStreetcarLayers(map);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the routes' card closes with them
      setStreetcarCard((card) => (card?.kind === "routes" && card.mode === "streetcar" ? null : card));
    }
    if (hasBusStopLayers(map)) {
      removeBusStopLayers(map);
      syncBusLayers();
    }
  }, [loadStatus, network, streetcarCatalog, streetcarRoutesShown, styleRevision, syncBusLayers]);

  // GO buses (S6): while the toggle is on, on the GO/UP network, the corridors
  // and the stop file (18 KB gzipped) load once and install (again after a
  // style change). Off removes the layers and sources. GO buses are wayfinding
  // only: nothing here reads or affects GO/UP rail status.
  const goBusesShown = goBusesEnabled && network === "regional";
  const goBusesShownRef = useRef(goBusesShown);
  if (!goBusesShown && streetcarCard?.kind === "routes" && streetcarCard.mode === "go-bus") setStreetcarCard(null);
  useLayoutEffect(() => {
    goBusesShownRef.current = goBusesShown;
  }, [goBusesShown]);
  const [goBusCatalog, setGoBusCatalog] = useState(cachedGoBusCatalog);
  const [goBusStops, setGoBusStops] = useState(cachedGoBusStops);
  const syncGoBusLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || isStyleLoadingRef.current || loadStatusRef.current !== "ready") return;
    if (!goBusesShownRef.current || appliedCatalogRef.current?.network !== "regional") {
      removeGoBusLayers(map);
      // A selected GO bus route or stop still draws on its own.
      syncSurfaceSelectionRef.current();
      return;
    }
    const corridors = cachedGoBusCatalog();
    if (!corridors) return;
    let installed = false;
    if (!hasGoBusLayers(map)) {
      installGoBusLayers(map, corridors, { dark: isDarkRef.current, activeFilteredLine: activeFilteredLineRef.current });
      installed = true;
    }
    const stops = cachedGoBusStops();
    if (stops && !hasGoBusStopLayers(map)) {
      installGoBusStopLayers(map, stops, {
        activeFilteredLine: activeFilteredLineRef.current,
        selectedStopCodes: surfaceSelectionRef.current?.stopCodes ?? [],
      });
      installed = true;
    }
    if (installed) installTransitOpacity(map);
  }, []);
  useEffect(() => {
    if (loadStatus !== "ready") return;
    syncGoBusLayers();
    if (!goBusesShown) return;
    let cancelled = false;
    Promise.all([loadGoBusCatalog(), loadGoBusStops().catch(() => null)]).then(([corridors, stops]) => {
      if (cancelled) return;
      setGoBusCatalog(corridors);
      if (stops) setGoBusStops(stops);
      syncGoBusLayers();
    }, () => {
      // GO buses are an optional layer; the map stays usable without them.
    });
    return () => { cancelled = true; };
  }, [goBusesShown, loadStatus, styleRevision, syncGoBusLayers]);
  // Neutral selection (plan 14, U4): the open stop and what an open panel
  // shows on the map. A selected route gets an outline under its line and
  // selected stops the selected pill, at every zoom. A layer whose switch is
  // off draws only the selection, from its sources holding only the selected
  // features; the switch is unchanged, and clearing the selection removes them.
  const [nightStops, setNightStops] = useState(cachedNightStops);
  const syncSurfaceSelection = useCallback(() => {
    const map = mapRef.current;
    if (!map || isStyleLoadingRef.current || loadStatusRef.current !== "ready") return;
    const selection = surfaceSelectionRef.current;
    const stopCodes = selection?.stopCodes ?? [];
    const routeOn = (layer: SurfaceSelectionLayer) => (selection?.route?.layer === layer ? selection.route.route : null);
    const dark = isDarkRef.current;
    const network = appliedCatalogRef.current?.network;
    if (network === "ttc") {
      const streetcars = cachedStreetcarCatalog();
      const busStopFile = cachedBusStops();
      const nightStopFile = cachedNightStops();
      const assigned = assignSelectedTtcStops(stopCodes, {
        streetcar: streetcars ? streetcarStopCodeSet(streetcars) : null,
        bus: busStopFile ? stopCodeSetOf(busStopFile) : null,
        night: nightStopFile ? stopCodeSetOf(nightStopFile) : null,
      });

      const streetcarRoute = routeOn("streetcar");
      const streetcarsOn = streetcarRoutesShownRef.current;
      if (!streetcarsOn) {
        if (streetcars && (streetcarRoute || assigned.streetcar.length > 0)) {
          installStreetcarSelectionSources(map, streetcars, { route: streetcarRoute, stopCodes: assigned.streetcar });
        } else {
          removeStreetcarLayers(map);
        }
      } else {
        updateStreetcarStopSelection(map, stopCodes);
      }
      applySurfaceSelectionLayers(map, STREETCAR_SELECTION_TARGET, {
        route: streetcarRoute, stopCodes: assigned.streetcar, routeLine: !streetcarsOn, dark,
      });

      const busRoute = routeOn("bus");
      const busesOn = busesShownRef.current;
      if (!busesOn) {
        const corridors = cachedBusCatalog();
        if ((busRoute && corridors) || assigned.bus.length > 0) {
          const codes = new Set(assigned.bus);
          installBusSelectionSources(map, {
            corridors: busRoute && corridors ? routeCorridors(corridors.features, busRoute) : [],
            stops: busStopFile ? busStopFile.features.filter((feature) => codes.has(feature.properties.stopCode)) : [],
          });
        } else {
          removeBusLayers(map);
        }
      } else {
        updateBusStopSelection(map, stopCodes);
      }
      applySurfaceSelectionLayers(map, BUS_SELECTION_TARGET, {
        route: busRoute, stopCodes: assigned.bus, routeLine: !busesOn, dark,
      });

      const nightRoute = routeOn("night");
      const nightRoutes = cachedNightCatalog();
      if (!busesOn) {
        if (nightRoute && nightRoutes) installNightSelectionSources(map, nightRoutes, nightRoute);
        else removeNightLayers(map);
      }
      for (const target of NIGHT_SELECTION_TARGETS) {
        applySurfaceSelectionLayers(map, target, { route: nightRoute, stopCodes: [], routeLine: !busesOn, dark });
      }
      // Night-only poles have no layer of their own: only a selected one draws.
      if (assigned.night.length > 0 && nightStopFile) {
        const codes = new Set(assigned.night);
        installNightStopSelectionSource(map, nightStopFile.features.filter((feature) => codes.has(feature.properties.stopCode)));
        applySurfaceSelectionLayers(map, NIGHT_STOP_SELECTION_TARGET, {
          route: null, stopCodes: assigned.night, routeLine: false, dark,
        });
      } else {
        removeNightStopSelection(map);
      }
    } else if (network === "regional") {
      const goRoute = routeOn("go-bus");
      const goStopFile = cachedGoBusStops();
      const goStopCodes = goStopFile ? stopCodes.filter((code) => stopCodeSetOf(goStopFile).has(code)) : [];
      const goBusesOn = goBusesShownRef.current;
      if (!goBusesOn) {
        const corridors = cachedGoBusCatalog();
        if ((goRoute && corridors) || goStopCodes.length > 0) {
          const codes = new Set(goStopCodes);
          installGoBusSelectionSources(map, {
            corridors: goRoute && corridors ? routeCorridors(corridors.features, goRoute) : [],
            stops: goStopFile ? goStopFile.features.filter((feature) => codes.has(feature.properties.stopCode)) : [],
          });
        } else {
          removeGoBusLayers(map);
        }
      } else {
        updateGoBusStopSelection(map, stopCodes);
      }
      applySurfaceSelectionLayers(map, GO_BUS_SELECTION_TARGET, {
        route: goRoute, stopCodes: goStopCodes, routeLine: !goBusesOn, dark,
      });
    }
    if (selection) installTransitOpacity(map);
    const container = containerRef.current;
    if (container) {
      const drawn = drawnSurfaceSelectionLayers(map, SURFACE_SELECTION_PREFIXES);
      if (drawn.length > 0) container.dataset.surfaceSelectionLayers = drawn.join(" ");
      else delete container.dataset.surfaceSelectionLayers;
    }
  }, []);
  useLayoutEffect(() => {
    syncSurfaceSelectionRef.current = syncSurfaceSelection;
  }, [syncSurfaceSelection]);
  // Again after every install the selection reads from (theme, network, switches, files).
  useEffect(() => {
    if (loadStatus !== "ready") return;
    syncSurfaceSelection();
  }, [
    busCatalog, busStops, busesShown, goBusCatalog, goBusStops, goBusesShown, loadStatus, network, nightCatalog,
    nightStops, streetcarCatalog, streetcarRoutesShown, styleRevision, surfaceSelectionKeyValue, syncSurfaceSelection,
  ]);

  // The files a selection needs, loaded even with its layer's switch off: a
  // stop the streetcar file lacks needs the bus stops, then the night-only poles.
  const selectedRouteLayer = mapSurfaceSelection?.route?.layer ?? null;
  const ttcStopFileNeeded = network === "ttc" && mapSurfaceSelection
    ? assignSelectedTtcStops(mapSurfaceSelection.stopCodes, {
      streetcar: streetcarCatalog ? streetcarStopCodeSet(streetcarCatalog) : null,
      bus: busStops ? stopCodeSetOf(busStops) : null,
      night: nightStops ? stopCodeSetOf(nightStops) : null,
    }).needs
    : null;
  const goStopFileNeeded = network === "regional" && Boolean(mapSurfaceSelection?.stopCodes.length);
  useEffect(() => {
    if (loadStatus !== "ready") return;
    let cancelled = false;
    const keep = <T,>(set: (value: T) => void) => (value: T) => { if (!cancelled) set(value); };
    const optional = () => {
      // The panel works without the map's selection; the map stays usable.
    };
    if (ttcStopFileNeeded === "bus") loadBusStops().then(keep(setBusStops), optional);
    if (ttcStopFileNeeded === "night") loadNightStops().then(keep(setNightStops), optional);
    if (network === "ttc" && selectedRouteLayer === "bus") loadBusCatalog().then(keep(setBusCatalog), optional);
    if (network === "ttc" && selectedRouteLayer === "night") loadNightCatalog().then(keep(setNightCatalog), optional);
    if (network === "regional" && selectedRouteLayer === "go-bus") loadGoBusCatalog().then(keep(setGoBusCatalog), optional);
    if (goStopFileNeeded) loadGoBusStops().then(keep(setGoBusStops), optional);
    return () => { cancelled = true; };
  }, [goStopFileNeeded, loadStatus, network, selectedRouteLayer, ttcStopFileNeeded]);

  // A new selection is framed once its files are in: one stop is flown to
  // like a station, at street level; a route or several stops are fitted with
  // alert View's padding (full-width map, toolbar, legend and sheet kept clear).
  // The camera moves whether or not the selection's layer is switched on.
  useEffect(() => {
    const map = mapRef.current;
    const selection = surfaceSelectionRef.current;
    if (!surfaceSelectionKeyValue || !selection) {
      lastFramedSurfaceSelectionRef.current = "";
      return;
    }
    if (!map || loadStatus !== "ready" || surfaceSelectionKeyValue === lastFramedSurfaceSelectionRef.current) return;
    if (appliedCatalogRef.current?.network !== network) return;
    const target = surfaceSelectionPoints(network, selection, {
      streetcars: streetcarCatalog, busCorridors: busCatalog, busStops, nightCorridors: nightCatalog, nightStops,
      goCorridors: goBusCatalog, goStops: goBusStops,
    });
    if (!target) return; // a file it needs is still loading
    lastFramedSurfaceSelectionRef.current = surfaceSelectionKeyValue;
    if (target.length === 0) return;
    if (!selection.route && target.length === 1) {
      const zoom = network === "regional" ? GO_BUS_STOP_FOCUS_ZOOM : SURFACE_STOP_FOCUS_ZOOM;
      focusGeographicCamera(map, containerRef.current, target[0], zoom, reducedMotion);
      return;
    }
    const bounds = surfaceSelectionBounds(target);
    const container = containerRef.current;
    if (!bounds || !container) return;
    const isMobile = window.innerWidth < 768;
    const padding = isMobile ? geographicMobileSurfaceSelectionPadding(container) : geographicDesktopFocusPadding(container);
    // A stop's pill stands above its position: keep the top one clear of the chrome.
    if (selection.stopCodes.length > 0) padding.top += SELECTED_STOP_PILL_ROOM_PX;
    // fitBounds adds its padding to the camera's own (a phone stop or station
    // flight leaves the sheet's there); ask only for what that does not cover.
    const held = map.getPadding();
    recordGeographicMapLifecycle("focus", `surface:${surfaceSelectionKeyValue}`);
    map.fitBounds(bounds, {
      padding: {
        top: Math.max(0, padding.top - (held.top ?? 0)),
        bottom: Math.max(0, padding.bottom - (held.bottom ?? 0)),
        left: Math.max(0, padding.left - (held.left ?? 0)),
        right: Math.max(0, padding.right - (held.right ?? 0)),
      },
      maxZoom: selection.route ? (isMobile ? GEOGRAPHIC_MOBILE_SELECTION_MAX_ZOOM : 15) : SURFACE_STOP_FOCUS_ZOOM,
      animate: !reducedMotion,
    });
  }, [
    busCatalog, busStops, goBusCatalog, goBusStops, loadStatus, network, nightCatalog, nightStops, reducedMotion,
    streetcarCatalog, surfaceSelectionKeyValue,
  ]);

  // Live streetcar positions (S4), read while the TTC Map View is open and the
  // page is visible, at the server's cadence; a disabled source is not asked again.
  useEffect(() => {
    if (loadStatus !== "ready" || network !== "ttc" || !streetcarCatalog) return;
    if (!streetcarPositionsShown) {
      // Turned off: the cars go, and nothing is read until they are turned back on.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the last read with the switch
      setStreetcarPositions(null);
      setStreetcarCard((card) => (card?.kind === "vehicle" ? null : card));
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    const read = async () => {
      window.clearTimeout(timer);
      controller?.abort();
      if (cancelled || document.visibilityState === "hidden") return;
      const current = new AbortController();
      controller = current;
      let result: Awaited<ReturnType<typeof getStreetcarPositions>>;
      try {
        result = await getStreetcarPositions({ signal: current.signal });
      } catch {
        return;
      }
      if (cancelled || controller !== current) return;
      if (result.kind === "ok") {
        const next = result.read;
        setStreetcarPositions(next);
        setStreetcarPositionsNow(next.receivedAt);
        // A car that is no longer reported closes its card.
        setStreetcarCard((card) => (
          card?.kind === "vehicle" && !findStreetcarVehicle(next, card.key) ? null : card
        ));
      }
      const delay = streetcarPositionsDelayMs(result);
      if (delay !== null) timer = window.setTimeout(() => { void read(); }, delay);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void read();
    };
    void read();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadStatus, network, streetcarCatalog, streetcarPositionsShown]);

  // Ages grow between reads: cars turn stale, then drop off, without a new read.
  useEffect(() => {
    if (!streetcarPositions || streetcarPositions.data.vehicles.length === 0) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setStreetcarPositionsNow(now);
      setStreetcarCard((card) => {
        if (card?.kind !== "vehicle") return card;
        const vehicle = findStreetcarVehicle(streetcarPositions, card.key);
        return vehicle && streetcarVehicleState(vehicle, streetcarPositions, now) !== "expired" ? card : null;
      });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [streetcarPositions]);

  const selectedStreetcarVehicleKey = streetcarCard?.kind === "vehicle" ? streetcarCard.key : null;
  const streetcarVehicleData = useMemo(() => (
    network === "ttc"
      ? streetcarVehicleFeatures(streetcarPositions, streetcarCatalog, streetcarPositionsNow, selectedStreetcarVehicleKey)
      : null
  ), [network, selectedStreetcarVehicleKey, streetcarCatalog, streetcarPositions, streetcarPositionsNow]);

  // Cars go above the streetcar lines; installed with them, then fed each read.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || network !== "ttc" || !streetcarCatalog || !streetcarVehicleData) return;
    if (isStyleLoadingRef.current || appliedCatalogRef.current?.network !== "ttc") return;
    if (hasStreetcarVehicleLayers(map)) {
      setStreetcarVehicleData(map, streetcarVehicleData);
      return;
    }
    installStreetcarVehicleLayers(map, {
      dark: isDarkRef.current,
      activeFilteredLine: activeFilteredLineRef.current,
      color: streetcarCatalog.routes.find((route) => route.drawn)?.color,
      data: streetcarVehicleData,
    });
    installTransitOpacity(map);
  }, [loadStatus, network, streetcarCatalog, streetcarVehicleData, styleRevision]);

  const streetcarVehicleCard = useMemo(() => {
    if (streetcarCard?.kind !== "vehicle" || !streetcarPositions || !streetcarCatalog) return null;
    const vehicle = findStreetcarVehicle(streetcarPositions, streetcarCard.key);
    if (!vehicle) return null;
    const state = streetcarVehicleState(vehicle, streetcarPositions, streetcarPositionsNow);
    if (state === "expired") return null;
    return {
      vehicle,
      state,
      ageSeconds: streetcarVehicleAgeSeconds(vehicle, streetcarPositions, streetcarPositionsNow),
      offRoute: distanceToStreetcarRoute(streetcarCatalog, vehicle.route, [vehicle.longitude, vehicle.latitude])
        > STREETCAR_OFF_ROUTE_METERS,
      nearestStop: nearestStreetcarStop(streetcarCatalog, [vehicle.longitude, vehicle.latitude], [vehicle.route])?.stop
        ?? null,
    };
  }, [streetcarCard, streetcarCatalog, streetcarPositions, streetcarPositionsNow]);

  // Live buses (S8): with Bus Routes and Vehicles on, on the TTC network, from
  // the bus zoom. Only the area around the view is read, again when the view
  // leaves it, at the server's cadence while the page is visible; a disabled
  // source is not asked again until the view or switches change.
  const busPositionsWanted = busesShown && streetcarPositionsShown && currentZoom >= BUS_VEHICLE_MIN_ZOOM;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || network !== "ttc") return;
    if (!busPositionsWanted) {
      // Off or zoomed out: the buses go, and nothing is read.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the last read with the switch or zoom
      setBusPositions(null);
      setStreetcarCard((card) => (card?.kind === "bus-vehicle" ? null : card));
      return;
    }
    let cancelled = false;
    let disabled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let requestedArea: BusPositionsArea | null = null;
    const view = (): BusPositionsArea => {
      const bounds = map.getBounds();
      return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    };
    const read = async () => {
      window.clearTimeout(timer);
      controller?.abort();
      if (cancelled || document.visibilityState === "hidden") return;
      const current = new AbortController();
      controller = current;
      const area = busPositionsArea(view());
      requestedArea = area;
      let result: Awaited<ReturnType<typeof getBusPositions>>;
      try {
        result = await getBusPositions({ area, signal: current.signal });
      } catch {
        return;
      }
      if (cancelled || controller !== current) return;
      if (result.kind === "ok") {
        const next = result.read;
        disabled = next.data.state === "disabled";
        setBusPositions(next);
        setBusPositionsNow(next.receivedAt);
        // A bus that is no longer reported (or has left the area) closes its card.
        setStreetcarCard((card) => (
          card?.kind === "bus-vehicle" && !findBusVehicle(next, card.key) ? null : card
        ));
      }
      const delay = streetcarPositionsDelayMs(result);
      if (delay !== null) timer = window.setTimeout(() => { void read(); }, delay);
    };
    const onMoveEnd = () => {
      if (!disabled && !busPositionsAreaCovers(requestedArea, view())) void read();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void read();
    };
    void read();
    map.on("moveend", onMoveEnd);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller?.abort();
      map.off("moveend", onMoveEnd);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [busPositionsWanted, loadStatus, network]);

  // Bus ages grow between reads, as cars' do.
  useEffect(() => {
    if (!busPositions || busPositions.data.vehicles.length === 0) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setBusPositionsNow(now);
      setStreetcarCard((card) => {
        if (card?.kind !== "bus-vehicle") return card;
        const vehicle = findBusVehicle(busPositions, card.key);
        return vehicle && streetcarVehicleState(vehicle, busPositions, now) !== "expired" ? card : null;
      });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [busPositions]);

  const selectedBusVehicleKey = streetcarCard?.kind === "bus-vehicle" ? streetcarCard.key : null;
  const busVehicleData = useMemo(
    () => busVehicleFeatures(busPositions, busPositionsNow, selectedBusVehicleKey),
    [busPositions, busPositionsNow, selectedBusVehicleKey],
  );
  // What the map last drew: an age tick that changes no bus's state or the
  // selection leaves the source alone (about 1,400 buses citywide at peak).
  const busVehicleSignatureRef = useRef<string | null>(null);
  const busVehiclesShown = busesShown && streetcarPositionsShown;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || isStyleLoadingRef.current) return;
    if (!busVehiclesShown) {
      removeBusVehicleLayers(map);
      busVehicleSignatureRef.current = null;
      return;
    }
    if (appliedCatalogRef.current?.network !== "ttc") return;
    const signature = busVehicleFeaturesSignature(busVehicleData);
    if (hasBusVehicleLayers(map)) {
      if (signature !== busVehicleSignatureRef.current) {
        setBusVehicleData(map, busVehicleData);
        busVehicleSignatureRef.current = signature;
      }
      return;
    }
    installBusVehicleLayers(map, {
      dark: isDarkRef.current,
      activeFilteredLine: activeFilteredLineRef.current,
      data: busVehicleData,
    });
    busVehicleSignatureRef.current = signature;
    installTransitOpacity(map);
  }, [busVehicleData, busVehiclesShown, loadStatus, styleRevision]);

  const busVehicleCard = useMemo(() => {
    if (streetcarCard?.kind !== "bus-vehicle" || !busPositions) return null;
    const vehicle = findBusVehicle(busPositions, streetcarCard.key);
    if (!vehicle) return null;
    const state = streetcarVehicleState(vehicle, busPositions, busPositionsNow);
    if (state === "expired") return null;
    return {
      vehicle,
      state,
      ageSeconds: streetcarVehicleAgeSeconds(vehicle, busPositions, busPositionsNow),
      offRoute: isBusOffRoute(busCatalog, vehicle),
      nearestStop: busStops || streetcarCatalog ? busVehicleNearestStop(vehicle) : null,
    };
  }, [busCatalog, busPositions, busPositionsNow, busStops, streetcarCard, streetcarCatalog]);

  // Live GO buses (S9): with GO Buses and the GO/UP Live GPS switch on, on
  // GO/UP, from the GO bus vehicle zoom. Read like TTC buses: the area around
  // the view, again when the view leaves it, at the server's cadence while
  // visible; a disabled source is not asked again until the view or switches
  // change. GO buses never feed the train markers or GO/UP rail status.
  const goBusVehiclesShown = goBusesShown && goBusPositionsShown;
  const goBusPositionsWanted = goBusVehiclesShown && currentZoom >= GO_BUS_VEHICLE_MIN_ZOOM;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || network !== "regional") return;
    if (!goBusPositionsWanted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the last read with the switch or zoom
      setGoBusPositions(null);
      setStreetcarCard((card) => (card?.kind === "go-bus-vehicle" ? null : card));
      return;
    }
    let cancelled = false;
    let disabled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let requestedArea: BusPositionsArea | null = null;
    const view = (): BusPositionsArea => {
      const bounds = map.getBounds();
      return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    };
    const read = async () => {
      window.clearTimeout(timer);
      controller?.abort();
      if (cancelled || document.visibilityState === "hidden") return;
      const current = new AbortController();
      controller = current;
      const area = busPositionsArea(view());
      requestedArea = area;
      let result: Awaited<ReturnType<typeof getGoBusPositions>>;
      try {
        result = await getGoBusPositions({ area, signal: current.signal });
      } catch {
        return;
      }
      if (cancelled || controller !== current) return;
      if (result.kind === "ok") {
        const next = result.read;
        disabled = next.data.state === "disabled";
        setGoBusPositions(next);
        setGoBusPositionsNow(next.receivedAt);
        setStreetcarCard((card) => (
          card?.kind === "go-bus-vehicle" && !findGoBusVehicle(next, card.key) ? null : card
        ));
      }
      const delay = streetcarPositionsDelayMs(result);
      if (delay !== null) timer = window.setTimeout(() => { void read(); }, delay);
    };
    const onMoveEnd = () => {
      if (!disabled && !busPositionsAreaCovers(requestedArea, view())) void read();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void read();
    };
    void read();
    map.on("moveend", onMoveEnd);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller?.abort();
      map.off("moveend", onMoveEnd);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [goBusPositionsWanted, loadStatus, network]);

  // GO bus ages grow between reads.
  useEffect(() => {
    if (!goBusPositions || goBusPositions.data.vehicles.length === 0) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setGoBusPositionsNow(now);
      setStreetcarCard((card) => {
        if (card?.kind !== "go-bus-vehicle") return card;
        const vehicle = findGoBusVehicle(goBusPositions, card.key);
        return vehicle && goBusVehicleState(vehicle, goBusPositions, now) !== "expired" ? card : null;
      });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [goBusPositions]);

  const selectedGoBusVehicleKey = streetcarCard?.kind === "go-bus-vehicle" ? streetcarCard.key : null;
  const goBusVehicleData = useMemo(
    () => goBusVehicleFeatures(goBusPositions, goBusPositionsNow, selectedGoBusVehicleKey),
    [goBusPositions, goBusPositionsNow, selectedGoBusVehicleKey],
  );
  const goBusVehicleSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || isStyleLoadingRef.current) return;
    if (!goBusVehiclesShown) {
      removeGoBusVehicleLayers(map);
      goBusVehicleSignatureRef.current = null;
      return;
    }
    if (appliedCatalogRef.current?.network !== "regional") return;
    const signature = goBusVehicleFeaturesSignature(goBusVehicleData);
    if (hasGoBusVehicleLayers(map)) {
      if (signature !== goBusVehicleSignatureRef.current) {
        setGoBusVehicleData(map, goBusVehicleData);
        goBusVehicleSignatureRef.current = signature;
      }
      return;
    }
    installGoBusVehicleLayers(map, {
      dark: isDarkRef.current,
      activeFilteredLine: activeFilteredLineRef.current,
      data: goBusVehicleData,
    });
    goBusVehicleSignatureRef.current = signature;
    installTransitOpacity(map);
  }, [goBusVehicleData, goBusVehiclesShown, loadStatus, styleRevision]);

  const goBusVehicleCard = useMemo(() => {
    if (streetcarCard?.kind !== "go-bus-vehicle" || !goBusPositions) return null;
    const vehicle = findGoBusVehicle(goBusPositions, streetcarCard.key);
    if (!vehicle) return null;
    const state = goBusVehicleState(vehicle, goBusPositions, goBusPositionsNow);
    if (state === "expired") return null;
    const summary = goBusCatalog?.routes.find((route) => route.route === vehicle.route) ?? null;
    return {
      vehicle,
      state,
      ageSeconds: streetcarVehicleAgeSeconds(vehicle, goBusPositions, goBusPositionsNow),
      route: summary,
      stop: goBusStops ? goBusVehicleStop(goBusStops, vehicle) : null,
    };
  }, [goBusCatalog, goBusPositions, goBusPositionsNow, goBusStops, streetcarCard]);

  // React to theme changes: compare applied style and only replace when genuinely changed
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    const targetStyle = isDark ? OPENFREEMAP_STYLES.dark : OPENFREEMAP_STYLES.light;
    if (appliedStyleUrlRef.current === targetStyle) {
      return;
    }

    isStyleLoadingRef.current = true;
    appliedStyleUrlRef.current = targetStyle;

    // Register rehydration before replacement
    map.once("style.load", () => {
      isStyleLoadingRef.current = false;
      if (catalogRef.current && mapRef.current === map) {
        installTransitLayers(
          map,
          catalogRef.current,
          catalogRef.current.network,
          isDark,
          highContrastRef.current,
          { streetcarRoutes: streetcarRoutesShownRef.current },
        );
        applyGeographicDynamicState(map, {
          overlayData: overlayDataRef.current,
          activeFilteredLine: activeFilteredLineRef.current,
          selectedStationId: selectedStationIdRef.current ?? null,
          selection: selectionRef.current ?? null,
          plannedClosures: resolvedPlannedClosuresRef.current,
        });
        appliedCatalogRef.current = catalogRef.current;
        setStyleRevision((current) => current + 1);
      }
    });

    recordGeographicMapLifecycle("setStyle", isDark ? "dark" : "light");
    map.setStyle(targetStyle);
  }, [isDark, loadStatus, network]);

  // React to high contrast changes without style reload
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    if (map.getLayer("transit-routes-casing")) {
      setTransitPaintProperty(map, "transit-routes-casing", "line-opacity", highContrast ? 1.0 : 0.85);
    }
    if (map.getLayer("transit-impact-arrows-casing")) {
      setTransitPaintProperty(map,
        "transit-impact-arrows-casing",
        "icon-color",
        highContrast ? "#0f172a" : ["coalesce", ["get", "casingColor"], "#0f172a"],
      );
    }
    if (map.getLayer("transit-impact-arrows")) {
      setTransitPaintProperty(map,
        "transit-impact-arrows",
        "icon-color",
        highContrast ? "#ffffff" : ["coalesce", ["get", "coreColor"], "#ffffff"],
      );
    }
  }, [highContrast, loadStatus]);

  // High contrast and mobile performance mode restyle the train glyph
  // (train-markers.css) without a style reload; redraw its images.
  useEffect(() => {
    const map = mapRef.current;
    const activeCatalog = catalogRef.current;
    if (!map || loadStatus !== "ready" || !activeCatalog || isStyleLoadingRef.current) return;
    registerTrainMarkerImages(map, [...new Set(getLinkFeatures(activeCatalog).map((link) => link.properties.lineId))]);
  }, [highContrast, loadStatus, mobilePerformanceMode]);

  // React to station selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    updateGeographicStationSelection(map, selectedStationId ?? null);
    updateGeographicStationHover(map, hoveredStationIdRef.current, selectedStationId ?? null, {
      nameDrawn: hoveredStationNameDrawnRef.current,
    });
    const container = containerRef.current;
    if (container) {
      if (selectedStationId) container.dataset.selectedStation = selectedStationId;
      else delete container.dataset.selectedStation;
    }

    // If selection changed to a new station, focus camera
    if (selectedStationId && selectedStationId !== lastSelectedStationIdRef.current) {
      if (catalogRef.current) {
        const coords = getStationCoordinates(catalogRef.current, selectedStationId);
        if (coords) focusGeographicCamera(map, containerRef.current, coords, STATION_FOCUS_ZOOM, reducedMotion);
      }
    }
    lastSelectedStationIdRef.current = selectedStationId ?? null;
  }, [selectedStationId, loadStatus, reducedMotion]);

  // React to impact selection changes (focus camera on affected corridor/station and drive attention controller)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    updateGeographicImpactSelection(map, selection ?? null, resolvedPlannedClosures);

    if (!selection) {
      lastSelectionRef.current = null;
      lastSelectionIntroKeyRef.current = null;
      pendingCameraFlightGenRef.current = null;
      stopAttentionLoop();
      selectionAttentionRef.current.reset();
      const idleFrame = selectionAttentionRef.current.computeFrame();
      applyAttentionFrame(idleFrame);
      return;
    }

    const currentSelectionKey = `${selection.kind}:${selection.id}:${selectionAttentionGeneration}`;
    let hasCameraFlight = false;

    if (currentSelectionKey !== lastSelectionRef.current) {
      const selectedPlannedClosure = selection.kind === "planned-closure"
        ? resolvedPlannedClosures.find((closure) => closure.id === selection.id)
        : undefined;
      const plannedStationIds = selectedPlannedClosure?.previewStationIds ?? [];
      const impactBounds = getProjectedSelectionBounds(
        selection,
        overlayData.impactedLinks.features,
        overlayData.impactedStations.features,
      );
      const stationCoordinates = plannedStationIds.flatMap((stationId) => {
        const coordinate = catalogRef.current && getStationCoordinates(catalogRef.current, stationId);
        return coordinate ? [coordinate] : [];
      });
      const coordinates = [...stationCoordinates, ...(impactBounds ? [impactBounds[0], impactBounds[1]] : [])];
      const bounds: [[number, number], [number, number]] | null = coordinates.length > 0
        ? [
            [Math.min(...coordinates.map((coordinate) => coordinate[0])), Math.min(...coordinates.map((coordinate) => coordinate[1]))],
            [Math.max(...coordinates.map((coordinate) => coordinate[0])), Math.max(...coordinates.map((coordinate) => coordinate[1]))],
          ]
        : null;
      if (bounds) {
        recordGeographicMapLifecycle("focus", currentSelectionKey);
        const container = containerRef.current;
        map.fitBounds(bounds, {
          padding: container && window.innerWidth >= 768
            ? geographicDesktopFocusPadding(container)
            : { top: 90, bottom: 90, left: 60, right: 60 },
          maxZoom: 15.0,
          animate: !reducedMotion,
        });
        lastSelectionRef.current = currentSelectionKey;

        if (!reducedMotion && map.isMoving()) {
          hasCameraFlight = true;
          pendingCameraFlightGenRef.current = selectionAttentionGeneration;
        }
      }
    }

    const isDocHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    const staticFallback = Boolean(reducedMotion || mobilePerformanceMode || isDocHidden);

    const continueAttention = Boolean(selectionIntroKey && selectionIntroKey === lastSelectionIntroKeyRef.current);
    lastSelectionIntroKeyRef.current = selectionIntroKey;
    const frame = selectionAttentionRef.current.requestAttention(
      {
        id: selection.id,
        kind: selection.kind,
        generation: selectionAttentionGeneration,
        hasCameraFlight,
        continueAttention,
      },
      staticFallback,
    );
    applyAttentionFrame(frame);
    if (frame.active) {
      startAttentionLoop();
    } else {
      stopAttentionLoop();
    }
  }, [
    selection,
    selectionAttentionGeneration,
    selectionIntroKey,
    loadStatus,
    overlayData.impactedLinks,
    overlayData.impactedStations,
    resolvedPlannedClosures,
    reducedMotion,
    mobilePerformanceMode,
    applyAttentionFrame,
    startAttentionLoop,
    stopAttentionLoop,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 768 || !selection) return;
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    const frameId = window.requestAnimationFrame(() => {
      map.resize();
      const container = containerRef.current;
      if (!container) return;
      const bounds = getProjectedSelectionBounds(
        selection,
        overlayDataRef.current.impactedLinks.features,
        overlayDataRef.current.impactedStations.features,
      );
      if (!bounds) return;
      map.fitBounds(bounds, {
        padding: geographicMobileSelectionPadding(container),
        maxZoom: GEOGRAPHIC_MOBILE_SELECTION_MAX_ZOOM,
        animate: !reducedMotion,
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [layoutResetSignal, loadStatus, reducedMotion, selection]);

  // Invisibility fallback handler
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibilityChange = () => {
      if (!selectionRef.current) return;
      const isDocHidden = document.visibilityState === "hidden";
      const staticFallback = Boolean(reducedMotion || mobilePerformanceMode || isDocHidden);
      const frame = selectionAttentionRef.current.requestAttention(
        {
          id: selectionRef.current.id,
          kind: selectionRef.current.kind,
          generation: selectionAttentionGeneration,
          hasCameraFlight: false,
        },
        staticFallback,
      );
      applyAttentionFrame(frame);
      if (frame.active) {
        startAttentionLoop();
      } else {
        stopAttentionLoop();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reducedMotion, mobilePerformanceMode, selectionAttentionGeneration, applyAttentionFrame, startAttentionLoop, stopAttentionLoop]);

  useEffect(() => {
    setGeographicProjectedImpactAnchorResolver((key) => {
      const map = mapRef.current;
      if (!map || loadStatusRef.current !== "ready") return null;
      const separator = key.indexOf(":");
      if (separator < 0) return null;
      const targetType = key.slice(0, separator);
      const targetId = key.slice(separator + 1);
      const data = overlayDataRef.current;
      const badge = data.impactBadges.features.find(
        (feature) => feature.properties.targetType === targetType && feature.properties.targetId === targetId,
      );
      if (badge) {
        const point = map.project(badge.geometry.coordinates);
        const container = map.getContainer();
        const inViewport =
          point.x >= 0 && point.x <= container.clientWidth && point.y >= 0 && point.y <= container.clientHeight;
        const hasLayer = Boolean(map.getLayer("transit-impact-badges"));
        const isRendered = hasLayer && (
          map.queryRenderedFeatures(point, { layers: ["transit-impact-badges"] })
            .some((f) => f.properties?.targetType === targetType && f.properties?.targetId === targetId) ||
          map.queryRenderedFeatures([[point.x - 16, point.y - 16], [point.x + 16, point.y + 16]], { layers: ["transit-impact-badges"] })
            .some((f) => f.properties?.targetType === targetType && f.properties?.targetId === targetId)
        );
        return inViewport && (isRendered || hasLayer) ? { x: point.x, y: point.y } : null;
      }
      if (targetType === "segment") {
        const link = data.impactedLinks.features.find((feature) => feature.properties.segmentId === targetId);
        if (link) {
          const point = map.project(getPointAlongPolyline(link.geometry.coordinates, 0.5));
          const isRendered = Boolean(map.getLayer("transit-impacts-line")) && map
            .queryRenderedFeatures(point, { layers: ["transit-impacts-line"] })
            .some((feature) => feature.properties?.segmentId === targetId);
          return isRendered ? { x: point.x, y: point.y } : null;
        }
      }
      if (targetType === "station") {
        const station = data.impactedStations.features.find((feature) => feature.properties.stationId === targetId);
        if (station) {
          const point = map.project(station.geometry.coordinates);
          const isRendered = Boolean(map.getLayer("transit-station-impacts")) && map
            .queryRenderedFeatures(point, { layers: ["transit-station-impacts"] })
            .some((feature) => feature.properties?.stationId === targetId);
          return isRendered ? { x: point.x, y: point.y } : null;
        }
      }
      return null;
    });
    return () => setGeographicProjectedImpactAnchorResolver(null);
  }, []);

  useEffect(() => {
    setGeographicProjectedSelectionBoundsResolver((key) => {
      const map = mapRef.current;
      if (!map || loadStatusRef.current !== "ready") return null;
      const separator = key.indexOf(":");
      if (separator < 0) return null;
      const id = key.slice(separator + 1);
      const data = overlayDataRef.current;
      const coordinates = [
        ...data.impactedLinks.features
          .filter((feature) => feature.properties.allCardIds.includes(id))
          .flatMap((feature) => feature.geometry.coordinates),
        ...data.impactedStations.features
          .filter((feature) => (feature.properties.allCardIds ?? [feature.properties.cardId]).includes(id))
          .map((feature) => feature.geometry.coordinates),
      ];
      if (coordinates.length === 0) return null;
      const points = coordinates.map((coordinate) => map.project(coordinate));
      return {
        left: Math.min(...points.map((point) => point.x)),
        top: Math.min(...points.map((point) => point.y)),
        right: Math.max(...points.map((point) => point.x)),
        bottom: Math.max(...points.map((point) => point.y)),
      };
    });
    return () => setGeographicProjectedSelectionBoundsResolver(null);
  }, []);

  useEffect(() => {
    setGeographicProjectedStationResolver((stationId) => {
      const map = mapRef.current;
      const catalog = catalogRef.current;
      if (!map || !catalog || loadStatusRef.current !== "ready") return null;
      const coordinates = getStationCoordinates(catalog, stationId);
      if (!coordinates) return null;
      const marker = map.project(coordinates);
      // A point inside the name's first letters for each of its placements
      // (offset in ems of the layer's text-size: 14px at zoom 9, 16 at 12, 18
      // at 14, 21 at 16, then 0.9 em further out); the first point that
      // hits the drawn name is where MapLibre placed it.
      const zoom = map.getZoom();
      const stops: Array<[number, number]> = [[9, 14], [12, 16], [14, 18], [16, 21]];
      const upper = stops.findIndex(([stopZoom]) => zoom <= stopZoom);
      const labelSize = upper <= 0
        ? stops[upper < 0 ? stops.length - 1 : 0][1]
        : stops[upper - 1][1] + (stops[upper][1] - stops[upper - 1][1])
          * ((zoom - stops[upper - 1][0]) / (stops[upper][0] - stops[upper - 1][0]));
      const placements = stationLabelPlacements(catalog).get(stationId) ?? [DEFAULT_STATION_LABEL_PLACEMENT];
      const label = !map.getLayer("transit-station-labels") ? null : placements
        .map(({ offset: [offsetX, offsetY] }) => {
          const length = Math.hypot(offsetX, offsetY) || 1;
          return {
            x: marker.x + labelSize * (offsetX + (offsetX / length) * 0.9),
            y: marker.y + labelSize * (offsetY + (offsetY / length) * 0.9),
          };
        })
        .find((point) => map
          .queryRenderedFeatures([point.x, point.y], { layers: ["transit-station-labels"] })
          .some((feature) => feature.properties?.stationId === stationId)) ?? null;
      return { marker: { x: marker.x, y: marker.y }, label };
    });
    return () => setGeographicProjectedStationResolver(null);
  }, []);

  useEffect(() => {
    const stats = getGeographicMapLifecycle();
    stats.isMoving = () => mapRef.current?.isMoving() ?? false;
    stats.getCamera = () => {
      const map = mapRef.current;
      if (!map) return null;
      const center = map.getCenter();
      return { lng: center.lng, lat: center.lat, zoom: map.getZoom() };
    };
    return () => {
      stats.isMoving = () => false;
      stats.getCamera = () => null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || !chooserAnchor || loadStatus !== "ready") {
      setOverlapChooserLayout(null);
      return;
    }

    // Solve the chooser only while the map is at rest. While it moves, the
    // follower keeps the card on its badge from MapLibre's move events, and
    // the solve after `moveend` glides it to its new spot.
    let frameId: number | null = null;
    let opening = true;
    const followBadge = () => {
      const point = map.project(chooserAnchor.coordinate);
      overlapChooserFollower.followPoint({ x: point.x, y: point.y });
    };
    const updateLayout = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (!opening && map.isMoving()) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const point = map.project(chooserAnchor.coordinate);
        const badgeInView = chooserBadgeInView(point, { width, height });
        const compact = width <= 640;
        const requestedChooserSize = chooserAnchor.size(width);
        const containerRect = container.getBoundingClientRect();
        const visibleKeepoutElements = visibleMapChooserKeepouts()
          .filter((element) => !element.contains(container));
        const topChromeBottom = visibleKeepoutElements
          .filter((element) => element.matches(".mobile-app-topbar, .map-utility-cluster"))
          .map((element) => element.getBoundingClientRect().bottom)
          .filter((bottom) => bottom > containerRect.top && bottom < containerRect.bottom)
          .reduce((bottom, nextBottom) => Math.max(bottom, nextBottom), containerRect.top);
        const keepouts = visibleKeepoutElements
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => (
            rect.right > containerRect.left
            && rect.left < containerRect.right
            && rect.bottom > containerRect.top
            && rect.top < containerRect.bottom
          ))
          .map((rect) => ({
            left: Math.max(0, rect.left - containerRect.left - GEOGRAPHIC_CHOOSER_KEEPOUT_GAP),
            top: Math.max(0, rect.top - containerRect.top - GEOGRAPHIC_CHOOSER_KEEPOUT_GAP),
            right: Math.min(width, rect.right - containerRect.left + GEOGRAPHIC_CHOOSER_KEEPOUT_GAP),
            bottom: Math.min(height, rect.bottom - containerRect.top + GEOGRAPHIC_CHOOSER_KEEPOUT_GAP),
          }));
        if (topChromeBottom > containerRect.top) {
          keepouts.push({
            left: 0,
            top: 0,
            right: width,
            bottom: Math.min(height, topChromeBottom - containerRect.top + GEOGRAPHIC_CHOOSER_KEEPOUT_GAP),
          });
        }
        const current = opening ? null : overlapChooserLayoutRef.current;
        const next = {
          ...chooseGeographicChooserLayout({
            anchor: point,
            viewportSize: { width, height },
            requestedSize: requestedChooserSize,
            keepouts,
            margin: compact ? 12 : 16,
            // Keep the open card's spot beside its badge while that spot is valid.
            preferred: current
              ? {
                  offsetX: current.layout.left - current.followAnchor.badge.x,
                  offsetY: current.layout.top - current.followAnchor.badge.y,
                  width: current.chooserSize.width,
                  height: current.chooserSize.height,
                }
              : null,
          }),
          followAnchor: { badge: { x: point.x, y: point.y } },
        };
        const wasOpening = opening;
        opening = false;
        setOverlapChooserLayout((current) => {
          if (!current || wasOpening) return next;
          // A badge panned off screen keeps its card attached to it.
          if (!badgeInView) return current;
          return geographicChooserLayoutsMatch(current, next) ? current : next;
        });
      });
    };

    updateLayout();
    map.on("move", followBadge);
    map.on("moveend", updateLayout);
    map.on("resize", updateLayout);
    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(container);
    const stopObservingKeepouts = observeMapChooserKeepouts(updateLayout);
    return () => {
      map.off("move", followBadge);
      map.off("moveend", updateLayout);
      map.off("resize", updateLayout);
      stopObservingKeepouts();
      resizeObserver.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [loadStatus, chooserAnchor, overlapChooserFollower]);

  // React to commute preview changes (focus camera on commute route)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || !commutePathPreview) return;

    if (commutePathPreview.id !== lastCommutePreviewIdRef.current && catalogRef.current) {
      const coords: [number, number][] = [];
      for (const stId of commutePathPreview.stationIds) {
        const c = getStationCoordinates(catalogRef.current, stId);
        if (c) coords.push(c);
      }
      if (coords.length > 0) {
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        for (const [lng, lat] of coords) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        map.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          {
            padding: { top: 110, bottom: Math.max(110, readCommutePreviewInset(containerRef.current)), left: 80, right: 80 },
            maxZoom: 13,
            animate: !reducedMotion,
          },
        );
      }
    }
    lastCommutePreviewIdRef.current = commutePathPreview.id;
  }, [commutePathPreview, loadStatus, reducedMotion]);

  // Recenter signal reaction (fits current network bounds)
  useEffect(() => {
    if (recenterSignal === undefined || recenterSignal === lastRecenterSignalRef.current) return;
    lastRecenterSignalRef.current = recenterSignal;

    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    cameraAdjustedByUserRef.current = false;
    clearGeographicMapViewport(window.localStorage, network);
    map.fitBounds(getGeographicBounds(network), {
      padding: { top: 70, bottom: 90, left: 40, right: 40 },
      animate: !reducedMotion,
    });
  }, [recenterSignal, loadStatus, network, reducedMotion]);

  // Zoom In signal reaction
  useEffect(() => {
    if (zoomInSignal === undefined || zoomInSignal === lastZoomInSignalRef.current) return;
    lastZoomInSignalRef.current = zoomInSignal;

    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;
    cameraAdjustedByUserRef.current = true;
    map.zoomIn({ animate: !reducedMotion });
  }, [zoomInSignal, loadStatus, reducedMotion]);

  // Zoom Out signal reaction
  useEffect(() => {
    if (zoomOutSignal === undefined || zoomOutSignal === lastZoomOutSignalRef.current) return;
    lastZoomOutSignalRef.current = zoomOutSignal;

    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;
    cameraAdjustedByUserRef.current = true;
    map.zoomOut({ animate: !reducedMotion });
  }, [zoomOutSignal, loadStatus, reducedMotion]);

  // Container ResizeObserver: coalesced to at most one animation frame
  // Calls map.resize only when container dimensions actually change
  useEffect(() => {
    const container = containerRef.current;
    if (!container || loadStatus !== "ready") return;

    let lastWidth = container.clientWidth;
    let lastHeight = container.clientHeight;
    let resizeRafId: number | null = null;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 && height === 0) continue;
        if (Math.abs(width - lastWidth) > 0.5 || Math.abs(height - lastHeight) > 0.5) {
          lastWidth = width;
          lastHeight = height;
          if (resizeRafId !== null) {
            cancelAnimationFrame(resizeRafId);
          }
          resizeRafId = requestAnimationFrame(() => {
            resizeRafId = null;
            const map = mapRef.current;
            if (map) {
              recordGeographicMapLifecycle("resize", `${Math.round(width)}x${Math.round(height)}`);
              map.resize();
            }
          });
        }
      }
    });

    observer.observe(container);

    return () => {
      if (resizeRafId !== null) {
        cancelAnimationFrame(resizeRafId);
      }
      observer.disconnect();
    };
  }, [loadStatus]);

  // Resize when map becomes active
  useEffect(() => {
    if (isMapActive && mapRef.current && loadStatus === "ready") {
      mapRef.current.resize();
    }
  }, [isMapActive, loadStatus]);

  // The top toolbar keeps clear of the right-hand buttons as the System Map's
  // does (captions drop, then a second row), now that the TTC Map View adds a
  // Bus Routes switch there (S5).
  const controlRailRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => observeDesktopControlRail(controlRailRef.current), []);

  // The layer deck unrolls from under the toolbar as the Map View opens on
  // either network (once the map is ready and shown), and again after a
  // network switch with that network's switches; its switches fade in one
  // after another. Web Animations only (no stylesheet keyframes); nothing
  // under reduced motion.
  const layerDeckRef = useRef<HTMLDivElement | null>(null);
  const layerDeckExitRef = useRef<Promise<void> | null>(null);
  const layerDeckExitAnimationsRef = useRef<Animation[]>([]);
  const mapReady = loadStatus === "ready";
  // Until its entrance can play (the map still loading), the deck stays rolled
  // up with its switches hidden, so it never shows open and then snaps shut to
  // animate in. A map that fails to load shows the deck at once; so does
  // reduced motion (the app setting here, the system setting in map-controls.css).
  const layerDeckWaiting = !reducedMotion && loadStatus === "loading";
  useLayoutEffect(() => {
    const deck = layerDeckRef.current;
    layerDeckExitRef.current = null;
    // A roll-up still holding the old network's deck closed gives way to the new deck.
    layerDeckExitAnimationsRef.current.forEach((animation) => animation.cancel());
    layerDeckExitAnimationsRef.current = [];
    if (!mapReady || !deck || reducedMotion || typeof deck.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const easing = "cubic-bezier(0.2, 0.8, 0.2, 1)";
    const animations = [
      deck.animate([
        { clipPath: "inset(0 -12px 100% -12px)", transform: "translateY(-4px)" },
        { clipPath: "inset(0 -12px 0 -12px)", transform: "none" },
      ], { duration: 280, easing }),
      ...[...deck.querySelectorAll<HTMLElement>(".map-layer-switch")].map((item, index) => item.animate([
        { opacity: 0, transform: "translateY(-6px)" },
        { opacity: 1, transform: "none" },
      ], { duration: 240, delay: 90 + index * 45, easing, fill: "backwards" })),
    ];
    return () => animations.forEach((animation) => animation.cancel());
  }, [mapReady, network, reducedMotion]);

  // The inverse, as the rider leaves the Map View for the System Map, or
  // switches network: the switches fade out right to left, then the deck
  // rolls back up into the toolbar. Resolves when it has finished (at once
  // without motion).
  const playLayerDeckExit = useCallback((): Promise<void> => {
    if (layerDeckExitRef.current) return layerDeckExitRef.current;
    const deck = layerDeckRef.current;
    if (!deck || reducedMotion || typeof deck.animate !== "function"
      || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return Promise.resolve();
    }
    const easing = "cubic-bezier(0.4, 0, 1, 1)";
    const items = [...deck.querySelectorAll<HTMLElement>(".map-layer-switch")].reverse();
    const animations = [
      ...items.map((item, index) => item.animate([
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(-6px)" },
      ], { duration: 150, delay: index * 30, easing, fill: "forwards" })),
      deck.animate([
        { clipPath: "inset(0 -12px 0 -12px)", transform: "none" },
        { clipPath: "inset(0 -12px 100% -12px)", transform: "translateY(-4px)" },
      ], { duration: 200, delay: 70, easing, fill: "forwards" }),
    ];
    layerDeckExitAnimationsRef.current = animations;
    const done = Promise.all(animations.map((animation) => animation.finished)).then(() => undefined, () => undefined);
    layerDeckExitRef.current = done;
    // If the rider stays (a switch that did not happen), the deck comes back.
    void done.then(() => window.setTimeout(() => {
      if (layerDeckExitRef.current === done) layerDeckExitRef.current = null;
      animations.forEach((animation) => animation.cancel());
    }, 1200));
    return done;
  }, [reducedMotion]);
  const handleMapViewTransitionStart = useCallback((next: MapViewPreference) => {
    if (next !== "geographic") void playLayerDeckExit();
  }, [playLayerDeckExit]);
  const handleMapViewChange = useCallback((next: MapViewPreference) => {
    if (!onMapViewChange) return;
    if (next === "geographic") {
      onMapViewChange(next);
      return;
    }
    void playLayerDeckExit().then(() => onMapViewChange(next));
  }, [onMapViewChange, playLayerDeckExit]);
  const handleNetworkChange = useCallback((next: NetworkId) => {
    // Each network has its own deck: the old one rolls up alongside the
    // network fade (the switch is not held for it) and the new one unrolls.
    if (next !== network) void playLayerDeckExit();
    onNetworkChange?.(next);
  }, [network, onNetworkChange, playLayerDeckExit]);

  const networkBounds = getGeographicBounds(network);

  return (
    <div
      className="geographic-network-map w-full h-full relative overflow-hidden"
      data-status={loadStatus}
      data-network={network}
      data-high-contrast={highContrast ? "true" : undefined}
      data-buses={busesShown ? "on" : undefined}
      data-go-buses={goBusesShown ? "on" : undefined}
    >
      <div
        ref={containerRef}
        className={`w-full h-full ${loadStatus === "ready" ? "visible" : "invisible"}`}
        tabIndex={0}
        role="region"
        aria-label={network === "regional" ? "Regional Rail Geographic Map" : "TTC Geographic Map"}
      />

      {overlapChooser && overlapChooserLayout ? (
        <MapOverlapChooser
          selectionKey={selection ? `${selection.kind}:${selection.id}:${selectionAttentionGeneration}` : selectedStationId ? `station:${selectedStationId}` : commutePathPreview ? `commute:${commutePathPreview.id}:${commutePathPreview.legId}` : null}
          markerId={overlapChooser.markerId}
          label={overlapChooser.label}
          impacts={overlapChooser.impacts}
          layout={overlapChooserLayout.layout}
          follower={overlapChooserFollower}
          followAnchor={overlapChooserLayout.followAnchor}
          onSelectImpact={(nextSelection) => onSelectImpact?.(nextSelection)}
          onHoverImpact={setHoveredOverlapImpact}
          onClose={(restoreFocus) => {
            setOverlapChooser(null);
            setHoveredOverlapImpact(null);
            if (restoreFocus) containerRef.current?.focus({ preventScroll: true });
          }}
          reducedMotion={reducedMotion}
          viewportOrientation="standard"
          viewportSize={overlapChooserLayout.viewportSize}
        />
      ) : null}

      {streetcarCard?.kind === "routes" && !overlapChooser && overlapChooserLayout
        && (streetcarCard.mode === "go-bus" ? goBusCatalog : streetcarCard.mode === "night" ? nightCatalog
          : streetcarCard.mode === "bus" ? busCatalog : streetcarCatalog) ? (
        <GeographicStreetcarCard
          mode={streetcarCard.mode}
          rows={streetcarCard.mode === "go-bus"
            ? goBusCardRows(goBusCatalog!, streetcarCard.routes)
            : streetcarCard.mode === "night"
              ? nightCardRows(nightCatalog!, streetcarCard.routes)
              : streetcarCard.mode === "bus"
              ? busCardRows(busCatalog!, streetcarCard.routes)
              : streetcarCardRows(streetcarCatalog!, streetcarCard.routes)}
          nearestStop={streetcarCard.nearestStop}
          onOpenStop={(stopCode) => {
            setStreetcarCard(null);
            onSelectSurfaceStop?.(stopCode);
          }}
          periodLabel={streetcarSchedulePeriodLabel((streetcarCard.mode === "go-bus"
            ? goBusCatalog!
            : streetcarCard.mode === "night" ? nightCatalog!
              : streetcarCard.mode === "bus" ? busCatalog! : streetcarCatalog!).source)}
          selectionKey={selection ? `${selection.kind}:${selection.id}:${selectionAttentionGeneration}` : selectedStationId ? `station:${selectedStationId}` : commutePathPreview ? `commute:${commutePathPreview.id}:${commutePathPreview.legId}` : null}
          layout={overlapChooserLayout.layout}
          follower={overlapChooserFollower}
          followAnchor={overlapChooserLayout.followAnchor}
          viewportSize={overlapChooserLayout.viewportSize}
          reducedMotion={reducedMotion}
          onClose={(restoreFocus) => {
            setStreetcarCard(null);
            if (restoreFocus) containerRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}

      {streetcarVehicleCard && !overlapChooser && overlapChooserLayout ? (
        <GeographicStreetcarVehicleCard
          key={streetcarCard?.kind === "vehicle" ? streetcarCard.key : undefined}
          vehicle={streetcarVehicleCard.vehicle}
          state={streetcarVehicleCard.state}
          ageSeconds={streetcarVehicleCard.ageSeconds}
          offRoute={streetcarVehicleCard.offRoute}
          nearestStop={streetcarVehicleCard.nearestStop}
          onOpenStop={onSelectSurfaceStop ? (stopCode) => {
            setStreetcarCard(null);
            onSelectSurfaceStop(stopCode);
          } : undefined}
          selectionKey={selection ? `${selection.kind}:${selection.id}:${selectionAttentionGeneration}` : selectedStationId ? `station:${selectedStationId}` : commutePathPreview ? `commute:${commutePathPreview.id}:${commutePathPreview.legId}` : null}
          layout={overlapChooserLayout.layout}
          follower={overlapChooserFollower}
          followAnchor={overlapChooserLayout.followAnchor}
          viewportSize={overlapChooserLayout.viewportSize}
          reducedMotion={reducedMotion}
          onClose={(restoreFocus) => {
            setStreetcarCard(null);
            if (restoreFocus) containerRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}

      {busVehicleCard && !overlapChooser && overlapChooserLayout ? (
        <GeographicStreetcarVehicleCard
          key={streetcarCard?.kind === "bus-vehicle" ? streetcarCard.key : undefined}
          mode="bus"
          replacement={busVehicleCard.vehicle.replacement}
          vehicle={busVehicleCard.vehicle}
          state={busVehicleCard.state}
          ageSeconds={busVehicleCard.ageSeconds}
          offRoute={busVehicleCard.offRoute}
          nearestStop={busVehicleCard.nearestStop}
          onOpenStop={onSelectSurfaceStop ? (stopCode) => {
            setStreetcarCard(null);
            onSelectSurfaceStop(stopCode);
          } : undefined}
          selectionKey={selection ? `${selection.kind}:${selection.id}:${selectionAttentionGeneration}` : selectedStationId ? `station:${selectedStationId}` : commutePathPreview ? `commute:${commutePathPreview.id}:${commutePathPreview.legId}` : null}
          layout={overlapChooserLayout.layout}
          follower={overlapChooserFollower}
          followAnchor={overlapChooserLayout.followAnchor}
          viewportSize={overlapChooserLayout.viewportSize}
          reducedMotion={reducedMotion}
          onClose={(restoreFocus) => {
            setStreetcarCard(null);
            if (restoreFocus) containerRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}

      {goBusVehicleCard && !overlapChooser && overlapChooserLayout ? (
        <GeographicStreetcarVehicleCard
          key={streetcarCard?.kind === "go-bus-vehicle" ? streetcarCard.key : undefined}
          mode="go-bus"
          vehicle={goBusVehicleCard.vehicle}
          goRoute={goBusVehicleCard.route}
          nextStop={goBusVehicleCard.stop?.next ?? false}
          state={goBusVehicleCard.state}
          ageSeconds={goBusVehicleCard.ageSeconds}
          offRoute={false}
          nearestStop={goBusVehicleCard.stop?.stop ?? null}
          onOpenStop={onSelectSurfaceStop ? (stopCode) => {
            setStreetcarCard(null);
            onSelectSurfaceStop(stopCode);
          } : undefined}
          selectionKey={selection ? `${selection.kind}:${selection.id}:${selectionAttentionGeneration}` : selectedStationId ? `station:${selectedStationId}` : commutePathPreview ? `commute:${commutePathPreview.id}:${commutePathPreview.legId}` : null}
          layout={overlapChooserLayout.layout}
          follower={overlapChooserFollower}
          followAnchor={overlapChooserLayout.followAnchor}
          viewportSize={overlapChooserLayout.viewportSize}
          reducedMotion={reducedMotion}
          onClose={(restoreFocus) => {
            setStreetcarCard(null);
            if (restoreFocus) containerRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}

      {/* Desktop Top center map controls */}
      <div
        ref={controlRailRef}
        className="map-control-rail desktop-map-control-rail absolute top-14 sm:top-5 left-1/2 -translate-x-1/2 z-30 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto"
        data-map-chooser-keepout
      >
        <div className="map-control-recenter-container">
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (map) {
                cameraAdjustedByUserRef.current = false;
                clearGeographicMapViewport(window.localStorage, network);
                map.fitBounds(networkBounds, {
                  padding: { top: 70, bottom: 90, left: 40, right: 40 },
                  animate: !reducedMotion,
                });
              }
            }}
            className="map-control-button group"
            title="Center view"
            aria-label="Center map view"
          >
            <Locate size={22} className="map-control-recenter-icon" />
            <span className="map-control-recenter-desktop-label text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Center
            </span>
          </button>
          <span className="map-control-recenter-mobile-label">Center</span>
        </div>

        <div className="map-control-zoom-group">
          <div className="map-control-divider" aria-hidden="true" />
          <button
            type="button"
            onClick={() => {
              cameraAdjustedByUserRef.current = true;
              mapRef.current?.zoomOut({ animate: !reducedMotion });
            }}
            className="map-control-button group"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Out</span>
          </button>

          <div className="map-control-slider flex items-center justify-center mx-0.5 sm:mx-1">
            <input
              ref={sliderRef}
              type="range"
              min={GEOGRAPHIC_MIN_ZOOM}
              max={GEOGRAPHIC_MAX_ZOOM}
              step="0.1"
              value={currentZoom}
              onChange={(e) => {
                const targetZoom = parseFloat(e.target.value);
                cameraAdjustedByUserRef.current = true;
                setCurrentZoom(targetZoom);
                mapRef.current?.setZoom(targetZoom);
              }}
              className="w-16 md:w-20 accent-slate-900 dark:accent-white hover:accent-blue-600 dark:hover:accent-blue-400 cursor-pointer h-1.5 rounded-lg appearance-none bg-slate-900/20 dark:bg-white/30 transition-all outline-none"
              title="Zoom level"
              aria-label="Zoom level slider"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              cameraAdjustedByUserRef.current = true;
              mapRef.current?.zoomIn({ animate: !reducedMotion });
            }}
            className="map-control-button group"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">In</span>
          </button>
        </div>

        {onNetworkChange && (
          <div className="desktop-map-control-network-group hidden md:flex items-center">
            <div className="map-control-divider" aria-hidden="true" />
            <NetworkSelector network={network} onChange={handleNetworkChange} ariaLabel="Map network switcher" />
          </div>
        )}

        {onMapViewChange && (
          <div className="desktop-map-control-view-group hidden md:flex items-center">
            <div className="map-control-divider" aria-hidden="true" />
            <MapViewSelector
              view={mapView ?? "geographic"}
              onChange={handleMapViewChange}
              onTransitionStart={handleMapViewTransitionStart}
            />
          </div>
        )}

        {(network === "ttc" || network === "regional") && (
          <div
            ref={layerDeckRef}
            id="map-view-layers-row"
            className="map-view-layers-row"
            data-network={network}
            data-deck-waiting={layerDeckWaiting ? "true" : undefined}
            data-map-chooser-keepout
            role="group"
            aria-label="Map layers"
          >
            {trainMarkersControl ? (
              <MapLayerSwitch
                id="map-layer-train-markers"
                icon={<TrainFrontTunnel size={20} aria-hidden="true" />}
                label="Train Markers"
                detail={estimatedTrainsDetail(trainMarkersControl.checked, trainMarkersControl.status)}
                checked={trainMarkersControl.checked}
                disabled={trainMarkersControl.disabled}
                pending={trainMarkersControl.pending}
                ariaLabel={trainMarkersControl.ariaLabel}
                title="Estimated Train Markers"
                onChange={trainMarkersControl.onToggle}
              />
            ) : null}
            {network === "regional" && onToggleGoBuses ? (
              <MapLayerSwitch
                id="map-layer-go-bus-routes"
                icon={<Bus size={20} aria-hidden="true" />}
                label="GO Buses"
                detail="Routes"
                checked={goBusesEnabled}
                ariaLabel="Show GO bus routes and stops"
                title="GO Bus Routes"
                onChange={onToggleGoBuses}
                dataBusToggle
              />
            ) : null}
            {network === "regional" && onToggleGoBuses ? (
              <MapLayerSwitch
                id="map-layer-go-bus-positions"
                icon={<SatelliteDish size={20} aria-hidden="true" />}
                label="Live GPS"
                detail={goBusPositionsDetail(
                  goBusesEnabled,
                  goBusPositionsShown,
                  goBusPositionsWanted ? goBusPositions?.data.state ?? null : null,
                )}
                checked={goBusPositionsShown}
                ariaLabel="Show live GO bus GPS positions"
                title={goBusesEnabled
                  ? `Live GO Buses (from zoom ${GO_BUS_VEHICLE_MIN_ZOOM})`
                  : "Live GO Buses (with GO Buses on)"}
                onChange={() => setGoBusPositionsShown((current) => {
                  writeGoBusPositionsPreference(window.localStorage, !current);
                  return !current;
                })}
              />
            ) : null}
            {network === "ttc" ? (<>
            <MapLayerSwitch
              id="map-layer-streetcar-routes"
              icon={<Route size={20} aria-hidden="true" />}
              label="Streetcars"
              detail="Routes"
              checked={streetcarRoutesShown}
              ariaLabel="Show TTC streetcar routes and stops"
              title="Streetcar Routes"
              onChange={() => setStreetcarRoutesShown((current) => {
                writeLayerPreference(window.localStorage, STREETCAR_ROUTES_STORAGE_KEY, !current);
                return !current;
              })}
            />
            {onToggleBuses ? (
              <MapLayerSwitch
                id="map-layer-bus-routes"
                icon={<Bus size={20} aria-hidden="true" />}
                label="Buses"
                detail="Routes"
                checked={busesEnabled}
                ariaLabel="Show TTC bus routes and stops"
                title="Bus Routes"
                onChange={onToggleBuses}
                dataBusToggle
              />
            ) : null}
            <MapLayerSwitch
              id="map-layer-streetcar-positions"
              icon={<SatelliteDish size={20} aria-hidden="true" />}
              label="Live GPS"
              detail={vehiclePositionsDetail(
                streetcarPositionsShown,
                streetcarPositions?.data.state ?? null,
                busPositionsWanted ? busPositions?.data.state ?? null : null,
                busesEnabled,
              )}
              checked={streetcarPositionsShown}
              ariaLabel="Show live streetcar and bus GPS positions"
              title={busesEnabled ? `Live Vehicles (buses from zoom ${BUS_VEHICLE_MIN_ZOOM})` : "Live Vehicles"}
              onChange={() => setStreetcarPositionsShown((current) => {
                writeLayerPreference(window.localStorage, STREETCAR_POSITIONS_STORAGE_KEY, !current);
                return !current;
              })}
            />
            </>) : null}
          </div>
        )}
      </div>


      {/* Floating Commute Path Preview Banner */}
      {commutePathPreview && !selection && (
        <div
          role="status"
          aria-live="polite"
          className="geographic-commute-preview-banner absolute bottom-16 sm:bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900/90 dark:bg-slate-800/90 text-white text-xs font-semibold shadow-xl backdrop-blur-xs border border-cyan-500/30"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>Viewing <strong><CommuteRouteLabel label={commutePathPreview.routeLabel} /></strong></span>
          </span>
          {onClearCommutePathPreview && (
            <button
              type="button"
              onClick={onClearCommutePathPreview}
              className="px-2 py-1 rounded-md text-[11px] font-bold bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Error Recovery Overlay */}
      {loadStatus === "error" && (
        <div className="geographic-map-error-overlay absolute inset-0 z-30 flex flex-col items-center justify-center p-4 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xs">
          <div className="geographic-map-error-card max-w-md w-full p-6 rounded-2xl shadow-xl border border-red-500/20 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-3">
              <AlertCircle size={28} />
            </div>
            <h3 className="text-lg font-bold mb-1">Unable to Load Map</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
              {errorMessage || "The geographic basemap service could not be loaded. You can retry or switch back to Diagram view."}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  setLoadStatus("loading");
                  setRetryCount((c) => c + 1);
                }}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCw size={16} />
                <span>Retry</span>
              </button>
              {onSwitchToDiagram && (
                <button
                  type="button"
                  onClick={onSwitchToDiagram}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Layers size={16} />
                  <span>Use Diagram</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
