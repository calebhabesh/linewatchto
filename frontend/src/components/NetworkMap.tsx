import type { ComponentProps } from "react";
import { DataProvider, type DashboardData } from "../app/DataContext";
import type { NetworkId } from "../app/regional-data";
import { InteractiveRegionalMap } from "./InteractiveRegionalMap";
import { InteractiveTtcMap } from "./InteractiveTtcMap";
import { NetworkMapLegend, type NetworkMapLegendProps } from "./NetworkMapLegends";

type TtcMapProps = ComponentProps<typeof InteractiveTtcMap>;
type NetworkMapProps = TtcMapProps & {
  network: NetworkId;
  ttcData: DashboardData;
  regionalData: DashboardData;
  ttcClosingSoon: boolean;
  legendProps: Omit<NetworkMapLegendProps, "mode" | "closingSoon">;
};

export function NetworkMap({
  network,
  ttcData,
  regionalData,
  ttcClosingSoon,
  legendProps,
  ...props
}: NetworkMapProps) {
  const regionalSelected = network === "regional";

  return (
    <div className="network-map-wrapper w-full h-full relative overflow-hidden">
      <div
        className={`network-map-carousel-track ${
          regionalSelected ? "network-map-carousel-track--regional" : ""
        } ${props.reducedMotion ? "network-map-carousel-track--reduced-motion" : ""}`}
      >
        <section
          className={`network-map-slide ${regionalSelected ? "" : "network-map-active"}`}
          aria-hidden={regionalSelected}
          inert={regionalSelected}
        >
          <DataProvider data={ttcData}>
            <InteractiveTtcMap {...props} />
            <NetworkMapLegend
              mode="ttc"
              closingSoon={ttcClosingSoon}
              {...legendProps}
            />
          </DataProvider>
        </section>
        <section
          className={`network-map-slide ${regionalSelected ? "network-map-active" : ""}`}
          aria-hidden={!regionalSelected}
          inert={!regionalSelected}
        >
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
            <NetworkMapLegend
              mode="regional"
              closingSoon={false}
              {...legendProps}
            />
          </DataProvider>
        </section>
      </div>
    </div>
  );
}
