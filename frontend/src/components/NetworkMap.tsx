import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import { DataProvider, type DashboardData } from "../app/DataContext";
import type { MapFadeController } from "../app/map-surface-transition";
import { loadGeographicCatalog } from "../app/geographic-catalog-loader";
import { preloadTtcMapMarkup } from "../app/map-preload";
import { preloadRegionalMapMarkup } from "../app/regional-map-asset";
import { preloadRasterMapSource, rasterMapSource, type RasterMapTheme, type RasterMapDensity } from "./RasterMapPlane";
import dynamic from "next/dynamic";
import type { NetworkId } from "../app/regional-data";
import { InteractiveTtcMap } from "./InteractiveTtcMap";
import { NetworkMapLegend, type NetworkMapLegendProps } from "./NetworkMapLegends";
import { SharedMapControlRailProvider } from "./SharedMapControlRail";

const EMPTY_MARKERS: NonNullable<ComponentProps<typeof InteractiveTtcMap>["estimatedTrainMarkers"]> = [];

const loadRegionalMap = () => import("./InteractiveRegionalMap");
const loadGeographicMap = () => import("./GeographicNetworkMap");

const InteractiveRegionalMap = dynamic(
  () => loadRegionalMap().then((mod) => mod.InteractiveRegionalMap),
  { ssr: false },
);

const GeographicNetworkMap = dynamic(
  () => loadGeographicMap().then((mod) => mod.GeographicNetworkMap),
  { ssr: false },
);

export async function prepareNetworkMap(network: NetworkId, view: "diagram" | "geographic", theme: RasterMapTheme, density: RasterMapDensity) {
  if (view === "geographic") {
    await Promise.all([loadGeographicMap(), loadGeographicCatalog(network)]);
    return;
  }
  const planes = network === "ttc"
    ? ["background", "foreground", "labels", "badges"] as const
    : ["background", "foreground", "labels"] as const;
  await Promise.all([
    network === "regional" ? loadRegionalMap() : Promise.resolve(),
    network === "regional" ? preloadRegionalMapMarkup() : preloadTtcMapMarkup("/assets/linewatch/ttc-subway-map-custom.svg"),
    ...planes.map(plane => preloadRasterMapSource(rasterMapSource(network, plane, theme, density))),
  ]);
}

type TtcMapProps = ComponentProps<typeof InteractiveTtcMap>;
type NetworkMapProps = TtcMapProps & {
  network: NetworkId;
  mobileAnnouncementVisible: boolean;
  onMapReady?: () => void;
  legendProps: Omit<NetworkMapLegendProps, "mode" | "closingSoon">;
  selectionAttentionGeneration?: number;
  preparingNetwork?: NetworkId | null;
  diagramData: Record<NetworkId, DashboardData>;
  diagramStations: Record<NetworkId, TtcMapProps["stations"]>;
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
  ...props
}: NetworkMapProps) {
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
          onSelectImpact={props.onSelectImpact}
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
  diagramStations: Record<NetworkId, TtcMapProps["stations"]>;
  onMapReady?: () => void;
  onPreparedMapReady?: () => void;
  props: TtcMapProps;
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
  const selectImpact = useCallback<TtcMapProps["onSelectImpact"]>(selection => callbacks.current.onSelectImpact(selection), []);
  const selectStation = useCallback<TtcMapProps["onSelectStationId"]>(station => callbacks.current.onSelectStationId(station), []);
  const changeNetwork = useCallback((next: NetworkId) => callbacks.current.onNetworkChange?.(next), []);
  const changeView = useCallback<NonNullable<TtcMapProps["onMapViewChange"]>>(view => callbacks.current.onMapViewChange?.(view), []);
  const toggleTheme = useCallback(() => callbacks.current.onToggleTheme(), []);
  const clearCommute = useCallback(() => callbacks.current.onClearCommutePathPreview?.(), []);
  const ttcReady = useCallback(() => setReadyNetworks(current => current.ttc ? current : { ...current, ttc: true }), []);
  const regionalReady = useCallback(() => setReadyNetworks(current => current.regional ? current : { ...current, regional: true }), []);
  const isMapActive = props.isMapActive ?? props.mapChromeVisible;
  useEffect(() => {
    if (readyNetworks[network]) onMapReady?.();
    if (preparingNetwork && readyNetworks[preparingNetwork]) onPreparedMapReady?.();
  }, [readyNetworks, network, preparingNetwork, onMapReady, onPreparedMapReady]);
  const renderDiagram = (diagramNetwork: NetworkId, ready: (() => void) | undefined, preparing: boolean) =>
    diagramNetwork === "regional" ? (
        <InteractiveRegionalMap
          isMapActive={!preparing && isMapActive}
          selection={preparing ? null : props.selection}
          onSelectImpact={selectImpact}
          selectedStationId={preparing ? null : props.selectedStationId}
          onSelectStationId={selectStation}
          reducedMotion={props.reducedMotion}
          mobilePerformanceMode={props.mobilePerformanceMode}
          layoutResetSignal={props.layoutResetSignal}
          recenterSignal={props.recenterSignal}
          zoomInSignal={props.zoomInSignal}
          zoomOutSignal={props.zoomOutSignal}
          isDark={props.isDark}
          highContrast={props.highContrast}
          animateInitialEntrance={props.animateInitialEntrance}
          deferInitialEntrance={preparing ? false : props.deferInitialEntrance}
          desktopMenuPinned={props.desktopMenuPinned}
          mapChromeVisible={props.mapChromeVisible}
          preserveCameraOnSelectionClear={props.preserveCameraOnSelectionClear}
          viewportOrientation={props.viewportOrientation}
          onReady={ready}
          estimatedTrainsEnabled={props.estimatedTrainsEnabled}
          estimatedTrainMarkers={props.estimatedTrainsEnabled ? props.estimatedTrainMarkers : EMPTY_MARKERS}
          commutePathPreview={preparing ? null : props.commutePathPreview}
          onClearCommutePathPreview={clearCommute}
          onNetworkChange={props.onNetworkChange ? changeNetwork : undefined}
          mapView={props.mapView}
          onMapViewChange={props.onMapViewChange ? changeView : undefined}
          selectionAttentionGeneration={props.selectionAttentionGeneration}
        />
      ) : (
        <InteractiveTtcMap
          {...props}
          stations={diagramStations.ttc}
          onSelectImpact={selectImpact}
          onSelectStationId={selectStation}
          onToggleTheme={toggleTheme}
          onClearCommutePathPreview={clearCommute}
          onNetworkChange={props.onNetworkChange ? changeNetwork : undefined}
          onMapViewChange={props.onMapViewChange ? changeView : undefined}
          estimatedTrainMarkers={props.estimatedTrainsEnabled ? props.estimatedTrainMarkers : EMPTY_MARKERS}
          reducedMotion={props.reducedMotion}
          selection={preparing ? null : props.selection}
          selectedStationId={preparing ? null : props.selectedStationId}
          commutePathPreview={preparing ? null : props.commutePathPreview}
          deferInitialEntrance={preparing ? false : props.deferInitialEntrance}
          isMapActive={!preparing && isMapActive}
          onReady={ready}
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
          {renderDiagram(diagramNetwork, diagramNetwork === "ttc" ? ttcReady : regionalReady, preparing)}
        </DataProvider>
      </div>
    );
  });
}
