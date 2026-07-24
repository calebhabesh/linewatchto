import type { ComponentProps } from "react";
import { DataProvider, type DashboardData } from "../app/DataContext";
import type { NetworkId } from "../app/regional-data";
import { InteractiveRegionalMap } from "./InteractiveRegionalMap";
import { InteractiveTtcMap } from "./InteractiveTtcMap";

type TtcMapProps = ComponentProps<typeof InteractiveTtcMap>;
type NetworkMapProps = TtcMapProps & {
  network: NetworkId;
  ttcData: DashboardData;
  regionalData: DashboardData;
};

export function NetworkMap({ network, ttcData, regionalData, ...props }: NetworkMapProps) {
  const regionalSelected = network === "regional";

  return (
    <div
      className="network-map-wrapper w-full h-full relative overflow-hidden"
      data-camera-direction={regionalSelected ? "right" : "left"}
    >
      <div
        className={`network-map-carousel-track ${
          regionalSelected ? "network-map-carousel-track--regional" : ""
        } ${props.reducedMotion ? "network-map-carousel-track--reduced-motion" : ""}`}
      >
        <div className="network-map-slide" aria-hidden={regionalSelected} inert={regionalSelected}>
          <DataProvider data={ttcData}>
            <InteractiveTtcMap {...props} />
          </DataProvider>
        </div>
        <div className="network-map-slide" aria-hidden={!regionalSelected} inert={!regionalSelected}>
          <DataProvider data={regionalData}>
            <InteractiveRegionalMap
              selection={props.selection}
              onSelectImpact={props.onSelectImpact}
              selectedStationId={props.selectedStationId}
              onSelectStationId={props.onSelectStationId}
              reducedMotion={props.reducedMotion}
              recenterSignal={props.recenterSignal}
              isDark={props.isDark}
            />
          </DataProvider>
        </div>
      </div>
    </div>
  );
}
