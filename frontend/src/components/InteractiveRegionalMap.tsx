"use client";
/* The GO/UP map: the System Map engine with GO/UP's definition (loaded on demand). */
import { memo, type ComponentProps } from "react";
import { SystemMap } from "./system-map/SystemMap";
import { REGIONAL_SYSTEM_MAP } from "./system-map/regional-system-map";

export { preloadRegionalMapMarkup } from "../app/regional-map-asset";

type RegionalMapProps = Omit<ComponentProps<typeof SystemMap>, "map">;

export const InteractiveRegionalMap = memo(function InteractiveRegionalMap(props: RegionalMapProps) {
  return <SystemMap map={REGIONAL_SYSTEM_MAP} {...props} />;
});
