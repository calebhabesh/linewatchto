import { useCallback, useEffect, useRef } from "react";
import { readMapViewport, saveMapViewport } from "../app/map-viewport-preference";
import type { MapCameraStore } from "../components/map-camera/camera-store";

export function useMapViewportPersistence(network: string | undefined, cameraStore: MapCameraStore, fit: number,
  size: () => { width: number; height: number }, canSave: () => boolean) {
  const latest = useRef({ fit, size, canSave });
  useEffect(() => { latest.current = { fit, size, canSave }; });
  const save = useCallback(() => {
    const state = latest.current;
    if (!network) return;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (!mobile || !state.canSave()) return;
    try { saveMapViewport(window.localStorage, network, cameraStore.get(), state.size(), state.fit); } catch { /* Optional preference. */ }
  }, [cameraStore, network]);
  // Saves 180 ms after each camera commit, without rendering.
  useEffect(() => {
    let timer: number | null = null;
    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(save, 180);
    };
    schedule();
    const unsubscribe = cameraStore.subscribe(schedule);
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [cameraStore, fit, save]);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { save(); window.removeEventListener("pagehide", save); document.removeEventListener("visibilitychange", onVisibility); };
  }, [save]);
  return useCallback((nextFit: number) => {
    if (!network) return null;
    if (!window.matchMedia("(max-width: 767px)").matches) return null;
    try { return readMapViewport(window.localStorage, network, latest.current.size(), nextFit); } catch { return null; }
  }, [network]);
}
