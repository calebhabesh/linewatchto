import type { ComponentProps } from "react";
import type { NetworkId } from "../app/regional-data";
import { InteractiveRegionalMap } from "./InteractiveRegionalMap";
import { InteractiveTtcMap } from "./InteractiveTtcMap";
import { NetworkMapLegend, type NetworkMapLegendProps } from "./NetworkMapLegends";

type TtcMapProps = ComponentProps<typeof InteractiveTtcMap>;
type NetworkMapProps = TtcMapProps & {
  network: NetworkId;
  mobileAnnouncementVisible: boolean;
  onInitialMapReady: () => void;
  legendProps: Omit<NetworkMapLegendProps, "mode" | "closingSoon">;
};

export function NetworkMap({
  network,
  mobileAnnouncementVisible,
  onInitialMapReady,
  legendProps,
  ...props
}: NetworkMapProps) {
  const regionalSelected = network === "regional";

  return (
    <>
      {regionalSelected ? (
        <InteractiveRegionalMap
          selection={props.selection}
          onSelectImpact={props.onSelectImpact}
          selectedStationId={props.selectedStationId}
          onSelectStationId={props.onSelectStationId}
          reducedMotion={props.reducedMotion}
          mobilePerformanceMode={props.mobilePerformanceMode}
          layoutResetSignal={props.layoutResetSignal}
          recenterSignal={props.recenterSignal}
          isDark={props.isDark}
          highContrast={props.highContrast}
          animateInitialEntrance={props.animateInitialEntrance}
          deferInitialEntrance={props.deferInitialEntrance}
          desktopMenuPinned={props.desktopMenuPinned}
          preserveCameraOnSelectionClear={props.preserveCameraOnSelectionClear}
          viewportOrientation={props.viewportOrientation}
          onReady={onInitialMapReady}
          estimatedTrainsEnabled={props.estimatedTrainsEnabled}
          estimatedTrainMarkers={props.estimatedTrainMarkers}
          commutePathPreview={props.commutePathPreview}
          onClearCommutePathPreview={props.onClearCommutePathPreview}
        />
      ) : (
        <InteractiveTtcMap
          {...props}
          onReady={onInitialMapReady}
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
