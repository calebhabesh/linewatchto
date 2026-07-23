import type { ComponentProps } from "react";
import type { NetworkId } from "../app/regional-data";
import { InteractiveRegionalMap } from "./InteractiveRegionalMap";
import { InteractiveTtcMap } from "./InteractiveTtcMap";

type TtcMapProps = ComponentProps<typeof InteractiveTtcMap>;

export function NetworkMap({ network, ...props }: TtcMapProps & { network: NetworkId }) {
  return (
    <div key={network} className="network-map-wrapper w-full h-full relative overflow-hidden animate-map-center-fade">
      {network === "regional" ? (
        <InteractiveRegionalMap
          selection={props.selection}
          onSelectImpact={props.onSelectImpact}
          selectedStationId={props.selectedStationId}
          onSelectStationId={props.onSelectStationId}
          reducedMotion={props.reducedMotion}
          recenterSignal={props.recenterSignal}
        />
      ) : (
        <InteractiveTtcMap {...props} />
      )}
    </div>
  );
}
