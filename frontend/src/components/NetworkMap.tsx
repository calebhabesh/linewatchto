import { useEffect, useState, type ComponentProps } from "react";
import type { NetworkId } from "../app/regional-data";
import { InteractiveRegionalMap } from "./InteractiveRegionalMap";
import { InteractiveTtcMap } from "./InteractiveTtcMap";

type TtcMapProps = ComponentProps<typeof InteractiveTtcMap>;

export function NetworkMap({ network, ...props }: TtcMapProps & { network: NetworkId }) {
  const isRegional = network === "regional";
  const [prevNetwork, setPrevNetwork] = useState(network);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [ttcEntranceSignal, setTtcEntranceSignal] = useState(0);

  if (network !== prevNetwork) {
    setPrevNetwork(network);
    setIsTransitioning(true);
    if (network === "ttc") {
      setTtcEntranceSignal((signal) => signal + 1);
    }
  }

  useEffect(() => {
    if (isTransitioning) {
      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 520);
      return () => clearTimeout(timer);
    }
  }, [isTransitioning, network]);

  const shouldRenderRegional = isRegional || isTransitioning;

  return (
    <div className="network-map-wrapper w-full h-full relative overflow-hidden">
      <div
        className={`network-map-carousel-track w-full h-full flex ${
          props.reducedMotion ? "transition-none" : "transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
        } ${isRegional ? "translate-x-[-100%]" : "translate-x-0"}`}
      >
        <div
          className={`network-map-slide w-full h-full flex-shrink-0 relative ${isRegional ? "pointer-events-none" : ""}`}
          aria-hidden={isRegional}
        >
          <InteractiveTtcMap {...props} entranceSignal={ttcEntranceSignal} />
        </div>
        {shouldRenderRegional && (
          <div
            className={`network-map-slide w-full h-full flex-shrink-0 relative ${!isRegional ? "pointer-events-none" : ""}`}
            aria-hidden={!isRegional}
          >
            <InteractiveRegionalMap
              selection={props.selection}
              onSelectImpact={props.onSelectImpact}
              selectedStationId={props.selectedStationId}
              onSelectStationId={props.onSelectStationId}
              reducedMotion={props.reducedMotion}
              recenterSignal={props.recenterSignal}
              isDark={props.isDark}
            />
          </div>
        )}
      </div>
    </div>
  );
}
