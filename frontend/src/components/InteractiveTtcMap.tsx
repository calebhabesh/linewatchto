"use client";
/* The TTC subway map: the System Map engine with TTC's definition. */
import { memo, type ComponentProps } from "react";
import { SystemMap } from "./system-map/SystemMap";
import { TTC_SYSTEM_MAP } from "./system-map/ttc-system-map";

export { preloadTtcMapMarkup } from "../app/map-preload";

type TtcMapProps = Omit<ComponentProps<typeof SystemMap>, "map">;

export const InteractiveTtcMap = memo(function InteractiveTtcMap(props: TtcMapProps) {
  return <SystemMap map={TTC_SYSTEM_MAP} {...props} />;
});
