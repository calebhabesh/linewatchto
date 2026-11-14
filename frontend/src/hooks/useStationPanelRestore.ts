import { useLayoutEffect, type RefObject } from "react";
import { applyStationPanelPosition, type StationPanelPosition } from "../app/station-panel-position";

/**
 * Puts a station panel back where the rider left it for one of its impacts
 * (station-panel-position.ts): before paint once its content is in, and once
 * more on the next frame for rows that settle late, then reports it applied.
 */
export function useStationPanelRestore(
  scrollRef: RefObject<HTMLElement | null>,
  position: StationPanelPosition | null | undefined,
  ready: boolean,
  onApplied: (() => void) | undefined,
) {
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!position || !ready || !scroller) return;
    applyStationPanelPosition(position, scroller);
    const frame = window.requestAnimationFrame(() => {
      applyStationPanelPosition(position, scroller);
      onApplied?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onApplied, position, ready, scrollRef]);
}
