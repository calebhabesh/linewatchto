import { useEffect, useState, type RefObject } from "react";
import { MapCameraMotion, type MapCameraMotionHost } from "./camera-motion.ts";

/**
 * One `MapCameraMotion` per map. The host ref holds the map's latest camera
 * callbacks; assign it in a layout effect so gestures always see current
 * props. Call this before any effect whose cleanup touches the camera, so the
 * motion is disposed first on unmount.
 */
export function useMapCameraMotion(hostRef: RefObject<MapCameraMotionHost | null>): MapCameraMotion {
  const [motion] = useState(() => new MapCameraMotion(forwardingHost(hostRef)));
  useEffect(() => () => motion.dispose(), [motion]);
  return motion;
}

function forwardingHost(hostRef: RefObject<MapCameraMotionHost | null>): MapCameraMotionHost {
  const host = () => {
    if (!hostRef.current) throw new Error("Map camera motion used before its host was set");
    return hostRef.current;
  };
  return {
    readCamera: () => host().readCamera(),
    writeCamera: (camera) => host().writeCamera(camera),
    setCameraEase: (ms) => host().setCameraEase(ms),
    clampScale: (scale) => host().clampScale(scale),
    easeWheelZoom: () => host().easeWheelZoom(),
    momentum: () => host().momentum(),
    onZoomStart: () => host().onZoomStart(),
    onZoomEnd: () => host().onZoomEnd(),
    onGlideEnd: () => host().onGlideEnd(),
  };
}
