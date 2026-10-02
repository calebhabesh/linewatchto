import type { Map as MapLibreMap } from "maplibre-gl";
import type { MapFadeController } from "../app/map-surface-transition.ts";

const NETWORK_OPACITY = "linewatch-network-opacity";
type PaintProperty = Parameters<MapLibreMap["setPaintProperty"]>[1];
type PaintValue = Parameters<MapLibreMap["setPaintProperty"]>[2];

/** Preserve filter/selection opacity while applying one shared renderer fade. */
export function setTransitPaintProperty(map: MapLibreMap, layer: string, property: PaintProperty, value: PaintValue) {
  const alreadyWrapped = Array.isArray(value) && value[0] === "*"
    && Array.isArray(value[1]) && value[1][0] === "coalesce"
    && Array.isArray(value[1][1]) && value[1][1][1] === NETWORK_OPACITY;
  map.setPaintProperty(layer, property, property.endsWith("-opacity") && !alreadyWrapped
    ? ["*", ["coalesce", ["global-state", NETWORK_OPACITY], 1], value ?? 1] as PaintValue
    : value);
}

export function installTransitOpacity(map: MapLibreMap) {
  for (const layer of map.getStyle?.()?.layers ?? []) {
    if (!layer.id.startsWith("transit-")) continue;
    const properties = layer.type === "line" ? ["line-opacity"]
      : layer.type === "circle" ? ["circle-opacity", "circle-stroke-opacity"]
      : layer.type === "symbol" ? [
        ...(layer.layout?.["icon-image"] ? ["icon-opacity"] : []),
        ...(layer.layout?.["text-field"] ? ["text-opacity"] : []),
      ] : [];
    for (const property of properties) {
      setTransitPaintProperty(map, layer.id, property as PaintProperty, map.getPaintProperty(layer.id, property as PaintProperty) ?? 1);
    }
  }
}

export function createGeographicMapFade(map: MapLibreMap): MapFadeController {
  let opacity = 1;
  const setOpacity = (value: number) => {
    opacity = value;
    if (map.getStyle()) map.setGlobalStateProperty(NETWORK_OPACITY, value);
  };
  return {
    reset: () => setOpacity(1),
    fade: (target, duration, signal) => new Promise<void>((resolve, reject) => {
      let frame: number | null = null;
      const cleanup = () => {
        if (frame !== null) cancelAnimationFrame(frame);
        signal.removeEventListener("abort", abort);
      };
      const abort = () => { cleanup(); reject(signal.reason); };
      if (signal.aborted) { abort(); return; }
      if (duration === 0) { setOpacity(target); resolve(); return; }
      signal.addEventListener("abort", abort, { once: true });
      const from = opacity;
      const started = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - (1 - progress) ** 2;
        setOpacity(from + (target - from) * eased);
        if (progress === 1) { cleanup(); resolve(); }
        else frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }),
  };
}
