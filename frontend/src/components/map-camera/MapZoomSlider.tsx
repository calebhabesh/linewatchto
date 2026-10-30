"use client";
import { PAN_ZOOM_MAX_RELATIVE_SCALE, PAN_ZOOM_MIN_RELATIVE_SCALE } from "../../hooks/panZoomMath";
import { useCommittedCamera, type MapCameraStore } from "./camera-store";

/** The map toolbar's zoom slider. It alone re-renders on each camera commit. */
export function MapZoomSlider({
  cameraStore,
  fitScale,
  onZoomToScale,
}: {
  cameraStore: MapCameraStore;
  fitScale: number;
  onZoomToScale: (relativeScale: number) => void;
}) {
  const camera = useCommittedCamera(cameraStore);
  const relativeScale = (camera?.scale ?? fitScale) / (fitScale || 1);
  return (
    <div className="map-control-slider flex items-center justify-center mx-0.5 sm:mx-1">
      <input
        type="range"
        min={PAN_ZOOM_MIN_RELATIVE_SCALE}
        max={PAN_ZOOM_MAX_RELATIVE_SCALE}
        step="0.05"
        value={relativeScale}
        onChange={(e) => onZoomToScale(parseFloat(e.target.value))}
        className="w-16 md:w-20 accent-slate-900 dark:accent-white hover:accent-blue-600 dark:hover:accent-blue-400 cursor-pointer h-1.5 rounded-lg appearance-none bg-slate-900/20 dark:bg-white/30 transition-all outline-none"
        title="Zoom level"
        aria-label="Zoom level slider"
      />
    </div>
  );
}
