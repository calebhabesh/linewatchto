import { useLayoutEffect, type RefObject } from "react";

/**
 * Pulse keyframes alternate over 1.2 seconds, so their complete visual cycle
 * is 2.4 seconds. Layers mounted by separate dashboard snapshots lock to it.
 */
export const MAP_PULSE_CYCLE_MS = 2400;

/**
 * Alert overlays never animate (map-renderer-parity.md). The pulses that
 * remain, a commute preview and a selected station, share one clock.
 */
export const SYNCHRONIZED_OVERLAY_PULSE_NAMES = new Set([
  "aura-pulse",
  "map-overlay-rail-pulse",
  "station-selected-pulse",
]);

/**
 * Puts every remaining pulse under `root` on one document-timeline origin.
 * This is stronger than assigning the same currentTime one by one, because
 * the animations can start on different rendering frames.
 */
export function synchronizeMapPulses(root: Element & ElementCSSInlineStyle) {
  const pulseClockMs = Number(document.timeline?.currentTime ?? performance.now());
  const pulsePhaseMs = pulseClockMs % MAP_PULSE_CYCLE_MS;
  const pulseCycleStartMs = pulseClockMs - pulsePhaseMs;
  root.style.setProperty("--map-pulse-offset", "0ms");
  for (const animation of root.getAnimations({ subtree: true })) {
    const animationName = "animationName" in animation
      ? String(animation.animationName)
      : "";
    if (SYNCHRONIZED_OVERLAY_PULSE_NAMES.has(animationName)) {
      animation.currentTime = pulsePhaseMs;
      animation.startTime = pulseCycleStartMs;
    }
  }
}

/**
 * Both maps' pulse clock: resynchronizes after the drawn overlays change
 * (`signature`) or motion resumes, then again over the next two frames for
 * animations that start late. Never on gestures.
 */
export function useMapPulseSync(
  rootRef: RefObject<(Element & ElementCSSInlineStyle) | null>,
  { paused, signature }: { paused: boolean; signature: string },
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (paused) {
      root.style.setProperty("--map-pulse-offset", "0ms");
      return;
    }
    synchronizeMapPulses(root);
    let settledPulseFrame: number | null = null;
    const pulseFrame = window.requestAnimationFrame(() => {
      synchronizeMapPulses(root);
      settledPulseFrame = window.requestAnimationFrame(() => synchronizeMapPulses(root));
    });
    return () => {
      window.cancelAnimationFrame(pulseFrame);
      if (settledPulseFrame !== null) window.cancelAnimationFrame(settledPulseFrame);
    };
  }, [paused, rootRef, signature]);
}
