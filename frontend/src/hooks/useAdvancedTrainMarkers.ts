"use client";

import { useEffect, useMemo, useState } from "react";
import {
  advanceEstimatedTrainMarkers,
  ESTIMATED_TRAIN_ADVANCE_MS,
  type EstimatedTrainMarker,
} from "../app/train-markers";

/**
 * Advances timed train markers by the clock between snapshots, once a
 * second while the page is visible, so each marker keeps closing on its
 * next station as its arrival tile counts down. Untimed markers and the
 * array itself keep their identity when nothing moves.
 */
export function useAdvancedTrainMarkers(markers: EstimatedTrainMarker[], enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  const advancing = enabled && markers.some((marker) => marker.timed === true && marker.moving !== false);

  useEffect(() => {
    if (!advancing || typeof document === "undefined") return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(Date.now());
    const start = () => {
      if (timer !== undefined || document.visibilityState !== "visible") return;
      tick();
      timer = setInterval(tick, ESTIMATED_TRAIN_ADVANCE_MS);
    };
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [advancing]);

  return useMemo(
    () => (advancing ? advanceEstimatedTrainMarkers(markers, now) : markers),
    [advancing, markers, now],
  );
}
