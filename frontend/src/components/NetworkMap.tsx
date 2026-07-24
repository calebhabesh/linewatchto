import type { ComponentProps } from "react";
import type { NetworkId } from "../app/regional-data";
import { InteractiveRegionalMap } from "./InteractiveRegionalMap";
import { InteractiveTtcMap } from "./InteractiveTtcMap";
import { NetworkMapLegend, type NetworkMapLegendProps } from "./NetworkMapLegends";

type TtcMapProps = ComponentProps<typeof InteractiveTtcMap>;
type NetworkMapProps = TtcMapProps & {
  network: NetworkId;
  ttcClosingSoon: boolean;
  onInitialMapReady: () => void;
  legendProps: Omit<NetworkMapLegendProps, "mode" | "closingSoon">;
};

export function NetworkMap({
  network,
  ttcClosingSoon,
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
          recenterSignal={props.recenterSignal}
          isDark={props.isDark}
          animateInitialEntrance={props.animateInitialEntrance}
          desktopMenuPinned={props.desktopMenuPinned}
          preserveCameraOnSelectionClear={props.preserveCameraOnSelectionClear}
          onReady={onInitialMapReady}
        />
      ) : (
        <InteractiveTtcMap
          {...props}
          onReady={onInitialMapReady}
        />
      )}
      <NetworkMapLegend
        mode={network}
        closingSoon={regionalSelected ? false : ttcClosingSoon}
        {...legendProps}
      />
    </>
  );
}
