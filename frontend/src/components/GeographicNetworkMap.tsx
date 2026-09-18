"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl, { type Map as MapLibreMap, type ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2, AlertCircle, RefreshCw, Layers, Locate, ZoomIn, ZoomOut, X } from "lucide-react";
import type { GeographicCatalog } from "../app/geographic-catalog";
import type { NetworkId } from "../app/regional-data";
import type { MapViewPreference } from "../app/visual-preferences";
import type {
  ImpactSelection,
  NetworkSegment,
  StationNodeImpact,
} from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import { useOptionalDashboardData } from "../app/DataContext";
import { NetworkSelector } from "./NetworkSelector";
import { MapViewSelector } from "./MapViewSelector";
import {
  partitionCatalogFeatures,
  getStationCoordinates,
  projectImpactedLinks,
  projectImpactedStations,
  projectImpactBadges,
  projectCommutePreview,
  getSelectionBounds,
} from "../app/geographic-overlays";
import {
  OPENFREEMAP_STYLES,
  GEOGRAPHIC_LOAD_TIMEOUT_MS,
  STATION_FOCUS_ZOOM,
  ALL_LINE_COLORS,
  getCatalogUrl,
  getGeographicBounds,
  getGeographicCenter,
  getGeographicDefaultZoom,
  getGeographicAttribution,
} from "../app/geographic-config";
import {
  readGeographicMapViewport,
  saveGeographicMapViewport,
} from "../app/map-viewport-preference";

export type GeographicNetworkMapProps = {
  network: "ttc" | "regional";
  isDark: boolean;
  highContrast: boolean;
  selectedStationId?: string | null;
  onSelectStationId?: (stationId: string | null) => void;
  selection?: ImpactSelection;
  onSelectImpact?: (selection: ImpactSelection) => void;
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
  filteredLineId?: string | null;
  onFilterLineId?: (lineId: string | null) => void;
  networkSegments?: NetworkSegment[];
  stationNodeImpacts?: StationNodeImpact[];
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
};

const LINE_NAMES: Record<string, string> = {
  "line-1": "Line 1 (Yonge-University)",
  "line-2": "Line 2 (Bloor-Danforth)",
  "line-4": "Line 4 (Sheppard)",
  "line-5": "Line 5 (Eglinton)",
  "line-6": "Line 6 (Finch West)",
  "regional-br": "Barrie Corridor",
  "regional-ki": "Kitchener Corridor",
  "regional-le": "Lakeshore East Corridor",
  "regional-lw": "Lakeshore West Corridor",
  "regional-mi": "Milton Corridor",
  "regional-rh": "Richmond Hill Corridor",
  "regional-st": "Stouffville Corridor",
  "regional-up": "UP Express Corridor",
};

const EMPTY_SEGMENTS: NetworkSegment[] = [];
const EMPTY_STATION_IMPACTS: StationNodeImpact[] = [];

function isWebGLSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

export function GeographicNetworkMap({
  network,
  isDark,
  highContrast,
  selectedStationId,
  onSelectStationId,
  selection,
  onSelectImpact,
  commutePathPreview,
  onClearCommutePathPreview,
  filteredLineId,
  onFilterLineId,
  networkSegments: propNetworkSegments,
  stationNodeImpacts: propStationNodeImpacts,
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
}: GeographicNetworkMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [catalog, setCatalog] = useState<GeographicCatalog | null>(null);
  const catalogRef = useRef<GeographicCatalog | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Internal line filter state when not controlled via props
  const [internalFilteredLineId, setInternalFilteredLineId] = useState<string | null>(null);
  const activeFilteredLine = filteredLineId !== undefined ? filteredLineId : internalFilteredLineId;

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

  const lastRecenterSignalRef = useRef(recenterSignal ?? 0);
  const lastZoomInSignalRef = useRef(zoomInSignal ?? 0);
  const lastZoomOutSignalRef = useRef(zoomOutSignal ?? 0);
  const lastSelectedStationIdRef = useRef<string | null>(selectedStationId ?? null);
  const lastSelectionRef = useRef<string | null>(selection ? `${selection.kind}:${selection.id}` : null);
  const lastCommutePreviewIdRef = useRef<string | null>(commutePathPreview?.id ?? null);

  // Persist camera on movement end
  const persistCamera = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    const storage = window.matchMedia("(max-width: 767px)").matches
      ? window.localStorage
      : window.sessionStorage;
    saveGeographicMapViewport(storage, network, {
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
        commuteLinks: { type: "FeatureCollection" as const, features: [] },
        commuteStations: { type: "FeatureCollection" as const, features: [] },
      };
    }

    const impactedLinks = projectImpactedLinks(catalog, resolvedNetworkSegments, network);
    const impactedStations = projectImpactedStations(catalog, resolvedStationNodeImpacts, network);
    const impactBadges = projectImpactBadges(catalog, impactedLinks.features, impactedStations.features, network);
    const commute = projectCommutePreview(catalog, commutePathPreview);

    return {
      impactedLinks,
      impactedStations,
      impactBadges,
      commuteLinks: commute.links,
      commuteStations: commute.stations,
    };
  }, [catalog, resolvedNetworkSegments, resolvedStationNodeImpacts, commutePathPreview, network]);

  // Install all transit, overlay, and interactive layers onto the MapLibre style
  const installTransitLayers = useCallback((map: MapLibreMap, activeCatalog: GeographicCatalog, dark: boolean) => {
    const { links, stations } = partitionCatalogFeatures(activeCatalog);
    const impactedLinks = projectImpactedLinks(activeCatalog, resolvedNetworkSegments, network);
    const impactedStations = projectImpactedStations(activeCatalog, resolvedStationNodeImpacts, network);
    const impactBadges = projectImpactBadges(activeCatalog, impactedLinks.features, impactedStations.features, network);
    const commute = projectCommutePreview(activeCatalog, commutePathPreview);

    // 1. Static Links Source
    if (map.getSource("transit-links")) {
      (map.getSource("transit-links") as maplibregl.GeoJSONSource).setData(links);
    } else {
      map.addSource("transit-links", { type: "geojson", data: links });
    }

    // 2. Static Stations Source
    if (map.getSource("transit-stations")) {
      (map.getSource("transit-stations") as maplibregl.GeoJSONSource).setData(stations);
    } else {
      map.addSource("transit-stations", { type: "geojson", data: stations });
    }

    // 3. Impacted Links Source
    if (map.getSource("transit-impacts")) {
      (map.getSource("transit-impacts") as maplibregl.GeoJSONSource).setData(impactedLinks);
    } else {
      map.addSource("transit-impacts", { type: "geojson", data: impactedLinks });
    }

    // 4. Impacted Stations Source
    if (map.getSource("transit-impact-stations")) {
      (map.getSource("transit-impact-stations") as maplibregl.GeoJSONSource).setData(impactedStations);
    } else {
      map.addSource("transit-impact-stations", { type: "geojson", data: impactedStations });
    }

    // 5. Impact Badges Source
    if (map.getSource("transit-impact-badges")) {
      (map.getSource("transit-impact-badges") as maplibregl.GeoJSONSource).setData(impactBadges);
    } else {
      map.addSource("transit-impact-badges", { type: "geojson", data: impactBadges });
    }

    // 6. Commute Links Source
    if (map.getSource("transit-commute-links")) {
      (map.getSource("transit-commute-links") as maplibregl.GeoJSONSource).setData(commute.links);
    } else {
      map.addSource("transit-commute-links", { type: "geojson", data: commute.links });
    }

    // 7. Commute Stations Source
    if (map.getSource("transit-commute-stations")) {
      (map.getSource("transit-commute-stations") as maplibregl.GeoJSONSource).setData(commute.stations);
    } else {
      map.addSource("transit-commute-stations", { type: "geojson", data: commute.stations });
    }

    // Match expression for route line colors across both networks
    const routeColorExpr = [
      "match",
      ["get", "lineId"],
      ...Object.entries(ALL_LINE_COLORS).flat(),
      "#888888",
    ] as unknown as ExpressionSpecification;

    // Match expression for station stroke colors
    const stationStrokeColorExpr = [
      "match",
      ["at", 0, ["get", "lineIds"]],
      ...Object.entries(ALL_LINE_COLORS).flat(),
      "#475569",
    ] as unknown as ExpressionSpecification;

    // Parallel offset expression to visually separate UP Express and Kitchener Line along shared tracks
    const routeOffsetExpr = (
      network === "regional"
        ? [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0,
            13,
            ["match", ["get", "lineId"], "regional-up", 3, "regional-ki", -3, 0],
            16,
            ["match", ["get", "lineId"], "regional-up", 5, "regional-ki", -5, 0],
          ]
        : 0
    ) as unknown as ExpressionSpecification;

    // --- LAYER 1: Base route casing line layer ---
    if (!map.getLayer("transit-routes-casing")) {
      map.addLayer({
        id: "transit-routes-casing",
        type: "line",
        source: "transit-links",
        paint: {
          "line-color": dark ? "#000000" : "#ffffff",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            3.5,
            14,
            7.5,
            17,
            11.5,
          ],
          "line-opacity": highContrast ? 1.0 : 0.85,
          "line-offset": routeOffsetExpr,
        },
      });
    }

    // --- LAYER 2: Color-coded transit routes ---
    if (!map.getLayer("transit-routes")) {
      map.addLayer({
        id: "transit-routes",
        type: "line",
        source: "transit-links",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": routeColorExpr,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            2.2,
            14,
            5.0,
            17,
            8.0,
          ],
          "line-offset": routeOffsetExpr,
          "line-opacity": activeFilteredLine
            ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2]
            : 1.0,
        },
      });
    }

    // --- LAYER 3: Commute path highlight stroke ---
    if (!map.getLayer("transit-commute-line")) {
      map.addLayer({
        id: "transit-commute-line",
        type: "line",
        source: "transit-commute-links",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#38bdf8",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            5.5,
            14,
            9.0,
            17,
            14.0,
          ],
          "line-opacity": 0.85,
        },
      });
    }

    // --- LAYER 4: Impacted segments wide glow casing ---
    if (!map.getLayer("transit-impacts-casing")) {
      map.addLayer({
        id: "transit-impacts-casing",
        type: "line",
        source: "transit-impacts",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["get", "impactColor"],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            6.0,
            14,
            11.0,
            17,
            16.0,
          ],
          "line-opacity": 0.35,
          "line-offset": routeOffsetExpr,
        },
      });
    }

    // --- LAYER 5: Impacted segments main overlay line ---
    if (!map.getLayer("transit-impacts-line")) {
      map.addLayer({
        id: "transit-impacts-line",
        type: "line",
        source: "transit-impacts",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["get", "impactColor"],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            3.2,
            14,
            6.5,
            17,
            9.5,
          ],
          "line-dasharray": [
            "case",
            ["get", "isDashed"],
            ["literal", [2.5, 1.8]],
            ["literal", [1, 0]],
          ],
          "line-offset": routeOffsetExpr,
        },
      });
    }

    // --- LAYER 6: Selection halo for selected impact ---
    if (!map.getLayer("transit-impacts-selection")) {
      map.addLayer({
        id: "transit-impacts-selection",
        type: "line",
        source: "transit-impacts",
        filter: ["==", ["get", "impactCardId"], selection?.id ?? ""],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#38bdf8",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            7.5,
            14,
            13.0,
            17,
            18.0,
          ],
          "line-opacity": 0.9,
          "line-offset": routeOffsetExpr,
        },
      });
    }

    // --- LAYER 7: Station outer circle ring ---
    if (!map.getLayer("transit-stations-outer")) {
      map.addLayer({
        id: "transit-stations-outer",
        type: "circle",
        source: "transit-stations",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            network === "regional" ? 3.0 : 2.5,
            12,
            network === "regional" ? 4.5 : 4.0,
            15,
            network === "regional" ? 7.5 : 6.5,
          ],
          "circle-color": dark ? "#0f172a" : "#ffffff",
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            1.2,
            14,
            2.5,
            17,
            3.5,
          ],
          "circle-stroke-color": stationStrokeColorExpr,
          "circle-opacity": activeFilteredLine
            ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
            : 1.0,
          "circle-stroke-opacity": activeFilteredLine
            ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
            : 1.0,
        },
      });
    }

    // --- LAYER 8: Station inner dot ---
    if (!map.getLayer("transit-stations-inner")) {
      map.addLayer({
        id: "transit-stations-inner",
        type: "circle",
        source: "transit-stations",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            1.2,
            14,
            2.8,
            17,
            4.2,
          ],
          "circle-color": dark ? "#ffffff" : "#0f172a",
          "circle-opacity": activeFilteredLine
            ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
            : 1.0,
        },
      });
    }

    // --- LAYER 9: Station node impact indicator rings ---
    if (!map.getLayer("transit-station-impacts")) {
      map.addLayer({
        id: "transit-station-impacts",
        type: "circle",
        source: "transit-impact-stations",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            7.0,
            14,
            12.0,
            17,
            18.0,
          ],
          "circle-color": "transparent",
          "circle-stroke-width": 3,
          "circle-stroke-color": ["get", "impactColor"],
          "circle-stroke-opacity": 0.95,
        },
      });
    }

    // --- LAYER 10: Commute origin and destination station rings ---
    if (!map.getLayer("transit-commute-stations")) {
      map.addLayer({
        id: "transit-commute-stations",
        type: "circle",
        source: "transit-commute-stations",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            8.0,
            14,
            14.0,
            17,
            20.0,
          ],
          "circle-color": "transparent",
          "circle-stroke-width": 3.5,
          "circle-stroke-color": "#38bdf8",
          "circle-stroke-opacity": 0.95,
        },
      });
    }

    // --- LAYER 11: Selected station indicator ring ---
    if (!map.getLayer("transit-station-selection")) {
      map.addLayer({
        id: "transit-station-selection",
        type: "circle",
        source: "transit-stations",
        filter: ["==", ["get", "stationId"], selectedStationId ?? ""],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            7.0,
            14,
            14.0,
            17,
            20.0,
          ],
          "circle-color": "transparent",
          "circle-stroke-width": 3.5,
          "circle-stroke-color": "#38bdf8",
          "circle-stroke-opacity": 0.95,
        },
      });
    }

    // --- LAYER 12: Disruption Badges Background Circle ---
    if (!map.getLayer("transit-impact-badges-bg")) {
      map.addLayer({
        id: "transit-impact-badges-bg",
        type: "circle",
        source: "transit-impact-badges",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            9.0,
            13,
            12.0,
            17,
            15.0,
          ],
          "circle-color": ["get", "impactColor"],
          "circle-stroke-width": 2,
          "circle-stroke-color": dark ? "#0f172a" : "#ffffff",
          "circle-stroke-opacity": 0.95,
        },
      });
    }

    // --- LAYER 13: Disruption Badges Text Label ---
    if (!map.getLayer("transit-impact-badges-label")) {
      map.addLayer({
        id: "transit-impact-badges-label",
        type: "symbol",
        source: "transit-impact-badges",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            9.5,
            13,
            11.0,
            17,
            13.0,
          ],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });
    }

    // --- LAYER 14: Station Names (progressive zoom reveal) ---
    if (!map.getLayer("transit-station-labels")) {
      map.addLayer({
        id: "transit-station-labels",
        type: "symbol",
        source: "transit-stations",
        minzoom: network === "regional" ? 10.5 : 12.0,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10.5,
            9.5,
            13,
            11.5,
            16,
            13.5,
          ],
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": dark ? "#f8fafc" : "#0f172a",
          "text-halo-color": dark ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.9)",
          "text-halo-width": 2,
        },
      });
    }
  }, [network, activeFilteredLine, selectedStationId, selection, commutePathPreview, resolvedNetworkSegments, resolvedStationNodeImpacts, highContrast]);

  // Main Map initialization and catalog loading
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    // Bounded loading timeout (12s engineering default)
    timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setLoadStatus("error");
        setErrorMessage("Map loading timed out (12 seconds). Check your internet connection.");
      }
    }, GEOGRAPHIC_LOAD_TIMEOUT_MS);

    async function init() {
      try {
        if (!containerRef.current) return;
        setLoadStatus("loading");

        // WebGL capability check
        if (!isWebGLSupported()) {
          if (!cancelled) {
            setLoadStatus("error");
            setErrorMessage("WebGL is not supported on this device or browser.");
          }
          return;
        }

        // Fetch geographic catalog for current network
        const catalogUrl = getCatalogUrl(network);
        const res = await fetch(catalogUrl);
        if (!res.ok) {
          throw new Error(`Failed to load geographic catalog: HTTP ${res.status}`);
        }
        const loadedCatalog: GeographicCatalog = await res.json();
        if (cancelled) return;
        catalogRef.current = loadedCatalog;
        setCatalog(loadedCatalog);

        // Restore saved camera or fallback to network bounds
        const storage = window.matchMedia("(max-width: 767px)").matches
          ? window.localStorage
          : window.sessionStorage;
        const savedCamera = readGeographicMapViewport(storage, network);

        const initialCenter = savedCamera
          ? ([savedCamera.lng, savedCamera.lat] as [number, number])
          : getGeographicCenter(network);
        const initialZoom = savedCamera ? savedCamera.zoom : getGeographicDefaultZoom(network);

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: isDark ? OPENFREEMAP_STYLES.dark : OPENFREEMAP_STYLES.light,
          center: initialCenter,
          zoom: initialZoom,
          pitch: 0,
          maxPitch: 0,
          dragRotate: false,
          touchPitch: false,
          attributionControl: {
            compact: false,
            customAttribution: getGeographicAttribution(network),
          },
        });

        // Disable pitch and rotation interactions
        map.touchZoomRotate.disableRotation();

        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          if (timeoutId !== null) window.clearTimeout(timeoutId);

          installTransitLayers(map, loadedCatalog, isDark);

          // Click on Disruption Badges
          map.on("click", "transit-impact-badges-bg", (e) => {
            if (!e.features || e.features.length === 0) return;
            const props = e.features[0].properties;
            if (props && onSelectImpact) {
              onSelectImpact({
                kind: props.impactKind,
                id: props.cardId,
              });
            }
          });

          // Click on Impacted Segments
          map.on("click", "transit-impacts-line", (e) => {
            if (!e.features || e.features.length === 0) return;
            const props = e.features[0].properties;
            if (props && onSelectImpact) {
              onSelectImpact({
                kind: props.impactKind,
                id: props.impactCardId,
              });
            }
          });

          // Station click handler
          map.on("click", "transit-stations-outer", (e) => {
            if (!e.features || e.features.length === 0) return;
            const stationId = e.features[0].properties?.stationId;
            if (stationId && onSelectStationId) {
              onSelectStationId(stationId);
            }
          });

          // Route click handler for line/corridor filtering
          map.on("click", "transit-routes", (e) => {
            if (!e.features || e.features.length === 0) return;
            const clickedLineId = e.features[0].properties?.lineId as string | undefined;
            if (!clickedLineId) return;

            const nextFilter = activeFilteredLine === clickedLineId ? null : clickedLineId;
            if (onFilterLineId) {
              onFilterLineId(nextFilter);
            } else {
              setInternalFilteredLineId(nextFilter);
            }
          });

          // Empty map background click clears selection and filters
          map.on("click", (e) => {
            const interactiveLayers = [
              "transit-impact-badges-bg",
              "transit-impacts-line",
              "transit-stations-outer",
              "transit-routes",
            ].filter((l) => map.getLayer(l));

            const features = map.queryRenderedFeatures(e.point, { layers: interactiveLayers });
            if (features.length === 0) {
              if (onSelectStationId) onSelectStationId(null);
              if (onSelectImpact) onSelectImpact(null);
              if (onFilterLineId) {
                onFilterLineId(null);
              } else {
                setInternalFilteredLineId(null);
              }
            }
          });

          // Pointer cursor on interactive features
          const pointerLayers = [
            "transit-stations-outer",
            "transit-impact-badges-bg",
            "transit-impacts-line",
            "transit-routes",
          ];
          for (const layerId of pointerLayers) {
            map.on("mouseenter", layerId, () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", layerId, () => {
              map.getCanvas().style.cursor = "";
            });
          }

          map.on("moveend", persistCamera);

          setLoadStatus("ready");
          onReady?.();
        });

        map.on("error", (e) => {
          if (e.error?.message?.includes("style") || e.error?.message?.includes("Failed to fetch")) {
            if (!cancelled) {
              setLoadStatus("error");
              setErrorMessage("Failed to load map style from OpenFreeMap.");
            }
          }
        });

        const canvas = map.getCanvas();
        canvas.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          if (!cancelled) {
            setLoadStatus("error");
            setErrorMessage("WebGL graphics context was lost. Please retry or use Diagram.");
          }
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Failed to load map.");
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (mapRef.current) {
        persistCamera();
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [network, retryCount, isDark, installTransitLayers, onReady, onSelectStationId, onSelectImpact, onFilterLineId, activeFilteredLine, persistCamera]);

  // Update dynamic overlay sources in-place whenever live data or commute changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    if (map.getSource("transit-impacts")) {
      (map.getSource("transit-impacts") as maplibregl.GeoJSONSource).setData(overlayData.impactedLinks);
    }
    if (map.getSource("transit-impact-stations")) {
      (map.getSource("transit-impact-stations") as maplibregl.GeoJSONSource).setData(overlayData.impactedStations);
    }
    if (map.getSource("transit-impact-badges")) {
      (map.getSource("transit-impact-badges") as maplibregl.GeoJSONSource).setData(overlayData.impactBadges);
    }
    if (map.getSource("transit-commute-links")) {
      (map.getSource("transit-commute-links") as maplibregl.GeoJSONSource).setData(overlayData.commuteLinks);
    }
    if (map.getSource("transit-commute-stations")) {
      (map.getSource("transit-commute-stations") as maplibregl.GeoJSONSource).setData(overlayData.commuteStations);
    }
  }, [overlayData, loadStatus]);

  // React to line/corridor filtering changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    if (map.getLayer("transit-routes")) {
      map.setPaintProperty(
        "transit-routes",
        "line-opacity",
        activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2]
          : 1.0,
      );
    }

    if (map.getLayer("transit-stations-outer")) {
      map.setPaintProperty(
        "transit-stations-outer",
        "circle-opacity",
        activeFilteredLine
          ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
          : 1.0,
      );
      map.setPaintProperty(
        "transit-stations-outer",
        "circle-stroke-opacity",
        activeFilteredLine
          ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
          : 1.0,
      );
    }

    if (map.getLayer("transit-stations-inner")) {
      map.setPaintProperty(
        "transit-stations-inner",
        "circle-opacity",
        activeFilteredLine
          ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
          : 1.0,
      );
    }
  }, [activeFilteredLine, loadStatus]);

  // React to theme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    map.setStyle(isDark ? OPENFREEMAP_STYLES.dark : OPENFREEMAP_STYLES.light);
    map.once("style.load", () => {
      if (catalogRef.current) {
        installTransitLayers(map, catalogRef.current, isDark);
      }
    });
  }, [isDark, loadStatus, installTransitLayers]);

  // React to station selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    if (map.getLayer("transit-station-selection")) {
      map.setFilter("transit-station-selection", [
        "==",
        ["get", "stationId"],
        selectedStationId ?? "",
      ]);
    }

    // If selection changed to a new station, focus camera
    if (selectedStationId && selectedStationId !== lastSelectedStationIdRef.current) {
      if (catalogRef.current) {
        const coords = getStationCoordinates(catalogRef.current, selectedStationId);
        if (coords) {
          const targetZoom = Math.max(map.getZoom(), STATION_FOCUS_ZOOM);
          if (reducedMotion) {
            map.jumpTo({ center: coords, zoom: targetZoom });
          } else {
            map.flyTo({ center: coords, zoom: targetZoom, essential: true });
          }
        }
      }
    }
    lastSelectedStationIdRef.current = selectedStationId ?? null;
  }, [selectedStationId, loadStatus, reducedMotion]);

  // React to impact selection changes (focus camera on affected corridor/station)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    if (map.getLayer("transit-impacts-selection")) {
      map.setFilter("transit-impacts-selection", [
        "==",
        ["get", "impactCardId"],
        selection?.id ?? "",
      ]);
    }

    const currentSelectionKey = selection ? `${selection.kind}:${selection.id}` : null;
    if (selection && currentSelectionKey !== lastSelectionRef.current && catalogRef.current) {
      const bounds = getSelectionBounds(
        catalogRef.current,
        selection,
        resolvedNetworkSegments,
        resolvedStationNodeImpacts,
      );
      if (bounds) {
        map.fitBounds(bounds, {
          padding: { top: 90, bottom: 90, left: 60, right: 60 },
          maxZoom: 15.0,
          animate: !reducedMotion,
        });
      }
    }
    lastSelectionRef.current = currentSelectionKey;
  }, [selection, loadStatus, resolvedNetworkSegments, resolvedStationNodeImpacts, reducedMotion]);

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
          { padding: { top: 90, bottom: 90, left: 60, right: 60 }, animate: !reducedMotion },
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
    map.zoomIn({ animate: !reducedMotion });
  }, [zoomInSignal, loadStatus, reducedMotion]);

  // Zoom Out signal reaction
  useEffect(() => {
    if (zoomOutSignal === undefined || zoomOutSignal === lastZoomOutSignalRef.current) return;
    lastZoomOutSignalRef.current = zoomOutSignal;

    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;
    map.zoomOut({ animate: !reducedMotion });
  }, [zoomOutSignal, loadStatus, reducedMotion]);

  // Resize when map is active
  useEffect(() => {
    if (isMapActive && mapRef.current && loadStatus === "ready") {
      mapRef.current.resize();
    }
  }, [isMapActive, loadStatus]);

  const networkBounds = getGeographicBounds(network);

  return (
    <div
      className="geographic-network-map w-full h-full relative overflow-hidden"
      data-status={loadStatus}
      data-network={network}
      data-high-contrast={highContrast ? "true" : undefined}
    >
      <div
        ref={containerRef}
        className="w-full h-full"
        tabIndex={0}
        role="region"
        aria-label={network === "regional" ? "Regional Rail Geographic Map" : "TTC Geographic Map"}
      />

      {/* Desktop Top center map controls */}
      <div
        className="map-control-rail desktop-map-control-rail absolute top-14 sm:top-5 left-1/2 -translate-x-1/2 z-30 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto"
        data-map-chooser-keepout
      >
        <div className="map-control-recenter-container">
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (map) {
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
            onClick={() => mapRef.current?.zoomOut({ animate: !reducedMotion })}
            className="map-control-button group"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Out</span>
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn({ animate: !reducedMotion })}
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
            <NetworkSelector network={network} onChange={onNetworkChange} ariaLabel="Map network switcher" />
          </div>
        )}

        {onMapViewChange && (
          <div className="desktop-map-control-view-group hidden md:flex items-center">
            <div className="map-control-divider" aria-hidden="true" />
            <MapViewSelector view={mapView ?? "geographic"} onChange={onMapViewChange} />
          </div>
        )}
      </div>

      {/* Floating Line/Corridor Filter Indicator */}
      {activeFilteredLine && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-28 sm:top-20 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 dark:bg-slate-800/90 text-white text-xs font-semibold shadow-lg backdrop-blur-xs border border-white/10"
        >
          <span>Filtering: <strong>{LINE_NAMES[activeFilteredLine] ?? activeFilteredLine}</strong></span>
          <button
            type="button"
            onClick={() => {
              if (onFilterLineId) {
                onFilterLineId(null);
              } else {
                setInternalFilteredLineId(null);
              }
            }}
            className="p-0.5 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
            title="Clear corridor filter"
            aria-label="Clear corridor filter"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Floating Commute Path Preview Banner */}
      {commutePathPreview && !selection && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-16 sm:bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900/90 dark:bg-slate-800/90 text-white text-xs font-semibold shadow-xl backdrop-blur-xs border border-cyan-500/30"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>Viewing <strong>{commutePathPreview.routeLabel}</strong></span>
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

      {/* Loading Overlay */}
      {loadStatus === "loading" && (
        <div className="geographic-map-loading-overlay absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/70 dark:bg-slate-950/75 backdrop-blur-xs transition-opacity">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-semibold text-sm">
            <Loader2 className="animate-spin text-blue-500" size={20} />
            <span>Loading {network === "regional" ? "Regional Rail" : "TTC"} Geographic Map…</span>
          </div>
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
