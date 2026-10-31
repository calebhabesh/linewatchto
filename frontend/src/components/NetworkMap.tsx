import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { DataProvider, type DashboardData } from "../app/DataContext";
import { isRepeatMapSelection } from "../app/map-repeat-selection";
import type { MapFadeController } from "../app/map-surface-transition";
import { loadGeographicCatalog } from "../app/geographic-catalog-loader";
import { MAP_MANIFESTS, NETWORK_MAPS } from "../app/map-manifests";
import { preloadRasterMapSource, rasterMapSource, type RasterMapTheme, type RasterMapDensity } from "./RasterMapPlane";
import dynamic from "next/dynamic";
import type { NetworkId } from "../app/regional-data";
import { prepareSystemMap, RegisteredSystemMap, type RegisteredSystemMapProps } from "./system-map/system-map-registry";
import { NetworkMapLegend, type NetworkMapLegendProps } from "./NetworkMapLegends";
import { SharedMapControlRailProvider } from "./SharedMapControlRail";
import { useAdvancedTrainMarkers } from "../hooks/useAdvancedTrainMarkers";

const EMPTY_MARKERS: NonNullable<RegisteredSystemMapProps["estimatedTrainMarkers"]> = [];

const loadGeographicMap = () => import("./GeographicNetworkMap");

const GeographicNetworkMap = dynamic(
  () => loadGeographicMap().then((mod) => mod.GeographicNetworkMap),
  { ssr: false },
);

export async function prepareNetworkMap(network: NetworkId, view: "diagram" | "geographic", theme: RasterMapTheme, density: RasterMapDensity) {
  if (view === "geographic") {
    await Promise.all([loadGeographicMap(), loadGeographicCatalog(network)]);
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
 * A hidden (preparing or warming) map keeps its last render: the shell's
 * selection, sheets and panels change on every interaction, and re-rendering
 * the map the rider cannot see cost a third of a phone station tap. Its
 * dashboard data still arrives through context; the rest catches up when it
 * is shown.
 */
const FrozenWhileHidden = memo(
  function FrozenWhileHidden({ children }: { hidden: boolean; children: ReactNode }) {
    return children;
  },
  (previous, next) => previous.hidden && next.hidden,
);
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
  const isGeographic = props.mapView === "geographic";

  if (isGeographic) {
    return (
      <>
        <GeographicNetworkMap
          network={network}
          networkFadeRef={geographicFadeRef}
          isDark={props.isDark}
          highContrast={Boolean(props.highContrast)}
          selectedStationId={props.selectedStationId}
          onSelectStationId={props.onSelectStationId}
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
          onReady={onMapReady}
          onSwitchToDiagram={() => props.onMapViewChange?.("diagram")}
          isMapActive={isMapActive}
          onNetworkChange={props.onNetworkChange}
          mapView={props.mapView}
          onMapViewChange={props.onMapViewChange}
          estimatedTrainsEnabled={props.estimatedTrainsEnabled}
          estimatedTrainMarkers={props.estimatedTrainMarkers}
          selectionAttentionGeneration={props.selectionAttentionGeneration}
          selectionIntroKey={props.selectionIntroKey}
          mobilePerformanceMode={props.mobilePerformanceMode}
          layoutResetSignal={props.layoutResetSignal}
        />
        <NetworkMapLegend
          mode={network}
          closingSoon={mobileAnnouncementVisible}
          {...legendProps}
        />
      </>
    );
  }

  return (
    <SharedMapControlRailProvider network={network}>
      <DiagramNetworkMaps network={network} preparingNetwork={preparingNetwork} warmingNetwork={warmingNetwork}
        diagramData={diagramData} diagramStations={diagramStations}
        onMapReady={onMapReady} onPreparedMapReady={onPreparedMapReady} props={props} />
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
