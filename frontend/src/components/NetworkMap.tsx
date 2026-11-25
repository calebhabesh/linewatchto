import type { SurfaceMapSelection } from "../app/surface-map-selection";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { DataProvider, type DashboardData } from "../app/DataContext";
import { mapViewFocusKey } from "../app/map-view-focus";
import { isRepeatMapSelection } from "../app/map-repeat-selection";
import type { GeographicNetworkMapProps } from "./GeographicNetworkMap";
import type { MapFadeController } from "../app/map-surface-transition";
import { loadGeographicCatalog } from "../app/geographic-catalog-loader";
import { MAP_MANIFESTS, NETWORK_MAPS } from "../app/map-manifests";
import { preloadRasterMapSource, rasterMapSource, type RasterMapTheme, type RasterMapDensity } from "./RasterMapPlane";
import type { NetworkId } from "../app/regional-data";
import { prepareSystemMap, RegisteredSystemMap, type RegisteredSystemMapProps } from "./system-map/system-map-registry";
import { NetworkMapLegend, type NetworkMapLegendProps } from "./NetworkMapLegends";
import { SharedMapControlRailProvider } from "./SharedMapControlRail";
import { useAdvancedTrainMarkers } from "../hooks/useAdvancedTrainMarkers";
import { PreloadableGeographicMap } from "./geographic-map-loader";
import type { MapViewPreference } from "../app/visual-preferences";

const EMPTY_MARKERS: NonNullable<RegisteredSystemMapProps["estimatedTrainMarkers"]> = [];

export async function prepareNetworkMap(network: NetworkId, view: "diagram" | "geographic", theme: RasterMapTheme, density: RasterMapDensity) {
  if (view === "geographic") {
    await Promise.all([PreloadableGeographicMap.preload(), loadGeographicCatalog(network)]);
    return;
  }
  const mapId = NETWORK_MAPS[network];
  await Promise.all([
    prepareSystemMap(mapId),
    ...MAP_MANIFESTS[mapId].rasterPlanes.map(plane => preloadRasterMapSource(rasterMapSource(mapId, plane, theme, density))),
  ]);
}

type SystemMapShellProps = RegisteredSystemMapProps;

/**
 * A hidden (preparing or warming) map, or one a view switch is replacing,
 * keeps its last render: the shell's selection, sheets and panels change on
 * every interaction, and re-rendering the map the rider cannot see cost a
 * third of a phone station tap. Its
 * dashboard data still arrives through context; the rest catches up when it
 * is shown.
 */
const FrozenWhileHidden = memo(
  function FrozenWhileHidden({ children }: { hidden: boolean; children: ReactNode }) {
    return children;
  },
  (previous, next) => previous.hidden && next.hidden,
);
/**
 * A switch between the System Map and the Map View (the toggle, or a stop or
 * notice opened on the Map View): the new view mounts out of sight while the
 * old one stays on screen; once the new one has drawn, they crossfade
 * (`revealed`) and the old one unmounts. A switch back during it drops the new view.
 *
 * A selection open before the switch is inherited until it changes: the new
 * view frames it without motion while out of sight, so the maps change in
 * place, and it goes on pulsing without another fast flash. One made with the
 * switch, or during it, is flown to and flashes as usual.
 */
type MapViewHandoff = { from: MapViewPreference; to: MapViewPreference; revealed: boolean };

/** The longest the old view waits for the new one to draw before the switch shows it anyway. */
const MAP_VIEW_HANDOFF_MAX_HOLD_MS = 2500;
const MAP_VIEW_HANDOFF_FADE_MS = 240;

const diagramReadySelector = (network: NetworkId) =>
  `.network-diagram-layer[data-network-map-layer="${network}"][data-map-ready="true"] .map-stage[data-raster-map-ready="true"]`;

type NetworkMapProps = SystemMapShellProps & {
  network: NetworkId;
  mobileAnnouncementVisible: boolean;
  onMapReady?: () => void;
  legendProps: Omit<NetworkMapLegendProps, "mode" | "closingSoon">;
  selectionAttentionGeneration?: number;
  selectionIntroKey?: string | null;
  preparingNetwork?: NetworkId | null;
  diagramData: Record<NetworkId, DashboardData>;
  diagramStations: Record<NetworkId, SystemMapShellProps["stations"]>;
  warmingNetwork?: NetworkId | null;
  onPreparedMapReady?: () => void;
  geographicFadeRef?: RefObject<MapFadeController | null>;
  /** Map View only: the TTC surface stop whose departures are open (plan 13, S3). */
  selectedSurfaceStopCode?: string | null;
  onSelectSurfaceStop?: (stopCode: string | null) => void;
  onOpenSurfaceRoute?: GeographicNetworkMapProps["onOpenSurfaceRoute"];
  /** Map View only: stops or a route an open panel shows (plan 14, U4). */
  surfaceSelection?: SurfaceMapSelection | null;
  /** Map View only: TTC buses (plan 13, S5), the rider's toggle. */
  busesEnabled?: boolean;
  onToggleBuses?: () => void;
  goBusesEnabled?: boolean;
  onToggleGoBuses?: () => void;
  trainMarkersControl?: GeographicNetworkMapProps["trainMarkersControl"];
  layersSheetOpen?: boolean;
  onCloseLayersSheet?: () => void;
  onLayersCustomizedChange?: (customized: boolean) => void;
};

export function NetworkMap({
  network,
  mobileAnnouncementVisible,
  onMapReady,
  legendProps,
  preparingNetwork,
  diagramData,
  diagramStations,
  warmingNetwork,
  onPreparedMapReady,
  geographicFadeRef,
  selectedSurfaceStopCode = null,
  onSelectSurfaceStop,
  onOpenSurfaceRoute,
  surfaceSelection = null,
  busesEnabled = false,
  onToggleBuses,
  goBusesEnabled = false,
  onToggleGoBuses,
  trainMarkersControl,
  layersSheetOpen = false,
  onCloseLayersSheet,
  onLayersCustomizedChange,
  ...shellProps
}: NetworkMapProps) {
  // Timed GO/UP markers keep moving toward their next station between polls.
  const estimatedTrainMarkers = useAdvancedTrainMarkers(
    shellProps.estimatedTrainMarkers ?? EMPTY_MARKERS,
    Boolean(shellProps.estimatedTrainsEnabled),
  );
  const props = estimatedTrainMarkers === shellProps.estimatedTrainMarkers
    ? shellProps
    : { ...shellProps, estimatedTrainMarkers };
  const isMapActive = props.isMapActive ?? (props.mapChromeVisible);

  const view: MapViewPreference = props.mapView === "geographic" ? "geographic" : "diagram";
  const focusKey = mapViewFocusKey({
    network,
    selection: props.selection,
    selectedStationId: props.selectedStationId,
    commutePathPreview: props.commutePathPreview,
    selectionAttentionGeneration: props.selectionAttentionGeneration ?? 0,
    selectedSurfaceStopCode,
    surfaceSelection,
  });
  // The view and focus last rendered, and whether the view inherited that focus.
  const [shown, setShown] = useState({ view, focusKey, inherited: false });
  const [handoff, setHandoff] = useState<MapViewHandoff | null>(null);
  // A map has drawn: before that (a stored view applied just after load) there is nothing to hold on screen.
  const [drawn, setDrawn] = useState(false);
  if (shown.view !== view || shown.focusKey !== focusKey) {
    const switched = shown.view !== view;
    setShown({ view, focusKey, inherited: switched && drawn && focusKey !== null && shown.focusKey === focusKey });
    // Asked back to the view still on screen: the one being prepared is dropped.
    if (switched) setHandoff(!drawn || handoff?.from === view ? null : { from: shown.view, to: view, revealed: false });
  }
  const inheritsSelection = shown.inherited && shown.view === view && shown.focusKey === focusKey;
  const handleMapReady = useCallback(() => {
    setDrawn(true);
    onMapReady?.();
  }, [onMapReady]);
  const reducedMotion = Boolean(props.reducedMotion);
  const revealIncomingView = useCallback(() => {
    const still = reducedMotion || Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    setHandoff(current => !current || current.revealed ? current : still ? null : { ...current, revealed: true });
  }, [reducedMotion]);

  // Hold the old view until the new one has drawn: the Map View reports it
  // (onSettled); a System Map is ready once its network's layer is, with its
  // artwork decoded. A slow source is shown anyway after the cap.
  const diagramLayerRef = useRef<HTMLDivElement | null>(null);
  const geographicLayerRef = useRef<HTMLDivElement | null>(null);
  const holdingFor = handoff && !handoff.revealed ? handoff.to : null;
  useEffect(() => {
    if (!holdingFor) return;
    const cap = window.setTimeout(revealIncomingView, MAP_VIEW_HANDOFF_MAX_HOLD_MS);
    const layer = holdingFor === "diagram" ? diagramLayerRef.current : null;
    const check = () => {
      if (layer?.querySelector(diagramReadySelector(network))) revealIncomingView();
    };
    const observer = layer ? new MutationObserver(check) : null;
    if (layer) observer?.observe(layer, {
      subtree: true, attributes: true, attributeFilter: ["data-map-ready", "data-raster-map-ready"],
    });
    const firstCheck = layer ? window.requestAnimationFrame(check) : null;
    return () => {
      window.clearTimeout(cap);
      observer?.disconnect();
      if (firstCheck !== null) window.cancelAnimationFrame(firstCheck);
    };
  }, [holdingFor, network, revealIncomingView]);

  // Then the two crossfade and the old one unmounts. The Map View is the opaque
  // one, so it always does the fading, in or out, above a still System Map. Its
  // toolbar is left out: the two toolbars share a place and swap at once.
  const fading = handoff?.revealed ? handoff : null;
  useLayoutEffect(() => {
    if (!fading) return;
    const finish = () => setHandoff(current => current === fading ? null : current);
    const frames = fading.to === "geographic" ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
    const faded = geographicLayerRef.current?.querySelectorAll(".geographic-network-map > :not(.map-control-rail)") ?? [];
    const animations = [...faded].map(element => element.animate(frames, {
      duration: MAP_VIEW_HANDOFF_FADE_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both",
    }));
    void Promise.all(animations.map(animation => animation.finished)).then(finish, () => undefined);
    return () => animations.forEach(animation => animation.cancel());
  }, [fading]);

  const roleOf = (layerView: MapViewPreference) =>
    !handoff ? undefined : layerView === handoff.from ? "leaving" as const : handoff.revealed ? undefined : "entering" as const;
  const layerAttributes = (layerView: MapViewPreference) => {
    const role = roleOf(layerView);
    return {
      className: "map-view-layer",
      "data-map-view-layer": layerView,
      "data-map-view-handoff": role,
      "data-map-view-fading": handoff?.revealed ? "true" : undefined,
      "aria-hidden": role ? true : undefined,
      inert: Boolean(role),
    };
  };
  const diagramRole = roleOf("diagram");
  const geographicRole = roleOf("geographic");
  const geographicShown = view === "geographic" || handoff?.from === "geographic";
  // The System Map's toolbar sits outside its layer (SharedMapControlRailProvider):
  // it stays while that map is on screen, and hands over when the other view shows.
  const diagramRail = diagramRole === "entering" || (diagramRole === "leaving" && handoff?.revealed)
    ? "hidden" as const : diagramRole === "leaving" ? "held" as const : "shown" as const;

  return (
    <SharedMapControlRailProvider network={network} railState={diagramRail}>
      {view === "diagram" || handoff?.from === "diagram" ? (
        <div ref={diagramLayerRef} {...layerAttributes("diagram")}>
          <FrozenWhileHidden hidden={diagramRole === "leaving"}>
            <DiagramNetworkMaps network={network} preparingNetwork={preparingNetwork} warmingNetwork={warmingNetwork}
              diagramData={diagramData} diagramStations={diagramStations}
              onMapReady={handleMapReady} onPreparedMapReady={onPreparedMapReady}
              props={diagramRole === "leaving" ? { ...props, mapView: "diagram" } : { ...props, inheritsSelection, viewSwitching: Boolean(handoff) }} />
          </FrozenWhileHidden>
        </div>
      ) : null}
      {geographicShown ? (
        <div ref={geographicLayerRef} {...layerAttributes("geographic")}>
          <FrozenWhileHidden hidden={geographicRole === "leaving"}>
            <PreloadableGeographicMap
              network={network}
              networkFadeRef={geographicFadeRef}
              isDark={props.isDark}
              highContrast={Boolean(props.highContrast)}
              selectedStationId={props.selectedStationId}
              onSelectStationId={props.onSelectStationId}
              selectedSurfaceStopCode={selectedSurfaceStopCode}
              onSelectSurfaceStop={onSelectSurfaceStop}
              onOpenSurfaceRoute={onOpenSurfaceRoute}
              surfaceSelection={surfaceSelection}
              selection={props.selection}
              onSelectImpact={(next) => {
                if (!isRepeatMapSelection(props, next)) props.onSelectImpact(next);
              }}
              commutePathPreview={props.commutePathPreview}
              onClearCommutePathPreview={props.onClearCommutePathPreview}
              recenterSignal={props.recenterSignal}
              zoomInSignal={props.zoomInSignal}
              zoomOutSignal={props.zoomOutSignal}
              reducedMotion={props.reducedMotion}
              onReady={handleMapReady}
              viewHandoff={geographicRole}
              inheritsSelection={inheritsSelection && view === "geographic"}
              onSettled={revealIncomingView}
              onSwitchToDiagram={() => props.onMapViewChange?.("diagram")}
              isMapActive={isMapActive}
              onNetworkChange={props.onNetworkChange}
              mapView={geographicRole === "leaving" ? "geographic" : props.mapView}
              onMapViewChange={props.onMapViewChange}
              estimatedTrainsEnabled={props.estimatedTrainsEnabled}
              estimatedTrainMarkers={props.estimatedTrainMarkers}
              selectionAttentionGeneration={props.selectionAttentionGeneration}
              selectionIntroKey={props.selectionIntroKey}
              mobilePerformanceMode={props.mobilePerformanceMode}
              layoutResetSignal={props.layoutResetSignal}
              busesEnabled={busesEnabled}
              onToggleBuses={onToggleBuses}
              goBusesEnabled={goBusesEnabled}
              onToggleGoBuses={onToggleGoBuses}
              trainMarkersControl={trainMarkersControl}
              layersSheetOpen={layersSheetOpen}
              onCloseLayersSheet={onCloseLayersSheet}
              onLayersCustomizedChange={onLayersCustomizedChange}
            />
          </FrozenWhileHidden>
        </div>
      ) : null}
      <NetworkMapLegend mode={network} closingSoon={mobileAnnouncementVisible} {...legendProps} />
    </SharedMapControlRailProvider>
  );
}

function DiagramNetworkMaps({ network, preparingNetwork, warmingNetwork, diagramData, diagramStations, onMapReady, onPreparedMapReady, props }: {
  network: NetworkId;
  preparingNetwork?: NetworkId | null;
  warmingNetwork?: NetworkId | null;
  diagramData: Record<NetworkId, DashboardData>;
  diagramStations: Record<NetworkId, SystemMapShellProps["stations"]>;
  onMapReady?: () => void;
  onPreparedMapReady?: () => void;
  props: SystemMapShellProps;
}) {
  const [mountedNetworks, setMountedNetworks] = useState<NetworkId[]>([network]);
  const networks = Array.from(new Set([...mountedNetworks, network,
    ...(preparingNetwork ? [preparingNetwork] : []), ...(warmingNetwork ? [warmingNetwork] : [])]));
  if (networks.length !== mountedNetworks.length) setMountedNetworks(networks);
  const [readyNetworks, setReadyNetworks] = useState({ ttc: false, regional: false });
  // Keep the prepared hit targets intact across swaps. Visibility pauses hidden
  // motion in CSS; changing reducedMotion here would rebuild the SVG overlays.
  const callbacks = useRef(props);
  useLayoutEffect(() => { callbacks.current = props; });
  const selectImpact = useCallback<SystemMapShellProps["onSelectImpact"]>((selection) => {
    if (!isRepeatMapSelection(callbacks.current, selection)) callbacks.current.onSelectImpact(selection);
  }, []);
  const selectStation = useCallback<SystemMapShellProps["onSelectStationId"]>(station => callbacks.current.onSelectStationId(station), []);
  const changeNetwork = useCallback((next: NetworkId) => callbacks.current.onNetworkChange?.(next), []);
  const changeView = useCallback<NonNullable<SystemMapShellProps["onMapViewChange"]>>(view => callbacks.current.onMapViewChange?.(view), []);
  const clearCommute = useCallback(() => callbacks.current.onClearCommutePathPreview?.(), []);
  const markReady = useCallback((ready: NetworkId) =>
    setReadyNetworks(current => current[ready] ? current : { ...current, [ready]: true }), []);
  const readyCallbacks = useMemo(() => ({ ttc: () => markReady("ttc"), regional: () => markReady("regional") }), [markReady]);
  const isMapActive = props.isMapActive ?? props.mapChromeVisible;
  useEffect(() => {
    if (readyNetworks[network]) onMapReady?.();
    if (preparingNetwork && readyNetworks[preparingNetwork]) onPreparedMapReady?.();
  }, [readyNetworks, network, preparingNetwork, onMapReady, onPreparedMapReady]);
  // Each network's map from the registry; a hidden (preparing) one keeps no selection.
  const renderDiagram = (diagramNetwork: NetworkId, preparing: boolean) => (
    <RegisteredSystemMap
      mapId={NETWORK_MAPS[diagramNetwork]}
      {...props}
      stations={diagramStations[diagramNetwork]}
      onSelectImpact={selectImpact}
      onSelectStationId={selectStation}
      onClearCommutePathPreview={clearCommute}
      onNetworkChange={props.onNetworkChange ? changeNetwork : undefined}
      onMapViewChange={props.onMapViewChange ? changeView : undefined}
      estimatedTrainMarkers={props.estimatedTrainsEnabled ? props.estimatedTrainMarkers : EMPTY_MARKERS}
      selection={preparing ? null : props.selection}
      selectedStationId={preparing ? null : props.selectedStationId}
      commutePathPreview={preparing ? null : props.commutePathPreview}
      inheritsSelection={!preparing && Boolean(props.inheritsSelection)}
      deferInitialEntrance={preparing ? false : props.deferInitialEntrance}
      isMapActive={!preparing && isMapActive}
      cameraCommandsEnabled={!preparing}
      onReady={readyCallbacks[diagramNetwork]}
    />
  );

  return networks.map(diagramNetwork => {
    const preparing = diagramNetwork !== network;
    return (
      <div key={diagramNetwork} className="network-diagram-layer" data-network-map-layer={diagramNetwork}
        data-map-ready={readyNetworks[diagramNetwork] ? "true" : undefined}
        data-map-variant={`${props.highContrast ? "high-contrast" : props.isDark ? "dark" : "light"}:${props.mobilePerformanceMode ? "mobile" : "balanced"}`}
        data-preparing={preparing ? "true" : undefined} aria-hidden={preparing || undefined} inert={preparing}>
        <DataProvider data={diagramData[diagramNetwork]}>
          <FrozenWhileHidden hidden={preparing}>
            {renderDiagram(diagramNetwork, preparing)}
          </FrozenWhileHidden>
        </DataProvider>
      </div>
    );
  });
}
