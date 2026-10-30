import { useCallback, useSyncExternalStore } from "react";
import type { PanZoomTransform } from "../../hooks/panZoomMath.ts";

/**
 * The committed camera of a System Map, outside React state: a commit
 * re-renders only the parts that read it (the zoom slider, an open alert
 * chooser), not the whole map component (docs/refactor-plan/09, phase 1c).
 */
export type MapCameraStore = {
  get: () => PanZoomTransform;
  set: (camera: PanZoomTransform) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createMapCameraStore(initial: PanZoomTransform): MapCameraStore {
  let camera = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => camera,
    set: (next) => {
      if (next.x === camera.x && next.y === camera.y && next.scale === camera.scale) return;
      camera = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const ignore = () => () => {};
const none = () => null;

/** The committed camera, re-rendering on each commit while `enabled`; null otherwise. */
export function useCommittedCamera(store: MapCameraStore, enabled = true): PanZoomTransform | null {
  const subscribe = useCallback(
    (listener: () => void) => (enabled ? store.subscribe(listener) : ignore()),
    [enabled, store],
  );
  return useSyncExternalStore(
    subscribe,
    enabled ? store.get : none,
    enabled ? store.get : none,
  );
}
