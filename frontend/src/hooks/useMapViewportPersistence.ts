import { useCallback, useEffect, useRef } from "react";
import { readMapViewport, saveMapViewport } from "../app/map-viewport-preference";

type Camera = { x: number; y: number; scale: number };
export function useMapViewportPersistence(network: string | undefined, camera: Camera, fit: number,
  size: () => { width: number; height: number }, canSave: () => boolean) {
  const latest = useRef({ camera, fit, size, canSave });
  useEffect(() => { latest.current = { camera, fit, size, canSave }; });
  const save = useCallback(() => {
    const state = latest.current;
    if (!network) return;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (!mobile || !state.canSave()) return;
    try { saveMapViewport(window.localStorage, network, state.camera, state.size(), state.fit); } catch { /* Optional preference. */ }
  }, [network]);
  useEffect(() => {
    const timer = window.setTimeout(save, 180);
    return () => window.clearTimeout(timer);
  }, [camera, fit, save]);
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
