import type { ComponentProps } from "react";
import type { NetworkId } from "../app/regional-data";
import { InteractiveRegionalMap } from "./InteractiveRegionalMap";
import { InteractiveTtcMap } from "./InteractiveTtcMap";

type TtcMapProps = ComponentProps<typeof InteractiveTtcMap>;

export function NetworkMap({ network, ...props }: TtcMapProps & { network: NetworkId }) {
  if (network === "regional") {
    return (
      <InteractiveRegionalMap
        selection={props.selection}
        onSelectImpact={props.onSelectImpact}
        selectedStationId={props.selectedStationId}
        onSelectStationId={props.onSelectStationId}
        recenterSignal={props.recenterSignal}
      />
    );
  }
  return <InteractiveTtcMap {...props} />;
}
