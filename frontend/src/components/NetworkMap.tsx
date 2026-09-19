import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import type { NetworkId } from "../app/regional-data";
import { InteractiveTtcMap } from "./InteractiveTtcMap";
import { NetworkMapLegend, type NetworkMapLegendProps } from "./NetworkMapLegends";

const InteractiveRegionalMap = dynamic(
  () => import("./InteractiveRegionalMap").then((mod) => mod.InteractiveRegionalMap),
  { ssr: false },
);

const GeographicNetworkMap = dynamic(
  () => import("./GeographicNetworkMap").then((mod) => mod.GeographicNetworkMap),
  { ssr: false },
);

type TtcMapProps = ComponentProps<typeof InteractiveTtcMap>;
type NetworkMapProps = TtcMapProps & {
  network: NetworkId;
  mobileAnnouncementVisible: boolean;
  onMapReady?: () => void;
  legendProps: Omit<NetworkMapLegendProps, "mode" | "closingSoon">;
  selectionAttentionGeneration?: number;
};

export function NetworkMap({
  network,
  mobileAnnouncementVisible,
  onMapReady,
  legendProps,
  ...props
}: NetworkMapProps) {
  const regionalSelected = network === "regional";
  const isMapActive = props.isMapActive ?? (props.mapChromeVisible);
  const isGeographic = props.mapView === "geographic";

  if (isGeographic) {
    return (
      <>
        <GeographicNetworkMap
          network={network}
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
    <>
      {regionalSelected ? (
        <InteractiveRegionalMap
          isMapActive={isMapActive}
          selection={props.selection}
          onSelectImpact={props.onSelectImpact}
          selectedStationId={props.selectedStationId}
          onSelectStationId={props.onSelectStationId}
          reducedMotion={props.reducedMotion}
          mobilePerformanceMode={props.mobilePerformanceMode}
          layoutResetSignal={props.layoutResetSignal}
          recenterSignal={props.recenterSignal}
          zoomInSignal={props.zoomInSignal}
          zoomOutSignal={props.zoomOutSignal}
          isDark={props.isDark}
          highContrast={props.highContrast}
          animateInitialEntrance={props.animateInitialEntrance}
          deferInitialEntrance={props.deferInitialEntrance}
          desktopMenuPinned={props.desktopMenuPinned}
          mapChromeVisible={props.mapChromeVisible}
          preserveCameraOnSelectionClear={props.preserveCameraOnSelectionClear}
          viewportOrientation={props.viewportOrientation}
          onReady={onMapReady}
          estimatedTrainsEnabled={props.estimatedTrainsEnabled}
          estimatedTrainMarkers={props.estimatedTrainMarkers}
          commutePathPreview={props.commutePathPreview}
          onClearCommutePathPreview={props.onClearCommutePathPreview}
          onNetworkChange={props.onNetworkChange}
          mapView={props.mapView}
          onMapViewChange={props.onMapViewChange}
        />
      ) : (
        <InteractiveTtcMap
          {...props}
          isMapActive={isMapActive}
          onReady={onMapReady}
        />
      )}
      <NetworkMapLegend
        mode={network}
        closingSoon={mobileAnnouncementVisible}
        {...legendProps}
      />
    </>
  );
}
