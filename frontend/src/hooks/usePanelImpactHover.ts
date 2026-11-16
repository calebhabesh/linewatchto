"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  endPanelImpactHover,
  setPanelImpactHover,
  type PanelImpactHover,
} from "../components/map-overlays/panel-impact-hover";

/**
 * Hover props for side panel rows that raise their alert on the map, as hovering
 * it there would: mouse hover and keyboard focus only (a touch press must not
 * leave the map raised). Pass the same `{ kind, id }` the row selects with. A row
 * that unmounts while hovered (data refresh, network switch) ends its hover.
 */
export function usePanelImpactHover() {
  const hoveredRef = useRef<PanelImpactHover | null>(null);
  useEffect(() => () => {
    if (hoveredRef.current) endPanelImpactHover(hoveredRef.current);
  }, []);

  const hover = useCallback((impact: PanelImpactHover | null) => {
    if (impact) {
      hoveredRef.current = impact;
      setPanelImpactHover(impact);
    } else if (hoveredRef.current) {
      endPanelImpactHover(hoveredRef.current);
      hoveredRef.current = null;
    }
  }, []);

  return useCallback((impact: PanelImpactHover) => ({
    onPointerEnter: (event: { pointerType: string }) => { if (event.pointerType === "mouse") hover(impact); },
    onPointerLeave: (event: { pointerType: string }) => { if (event.pointerType === "mouse") hover(null); },
    onFocus: (event: { currentTarget: Element }) => { if (event.currentTarget.matches(":focus-visible")) hover(impact); },
    onBlur: () => hover(null),
  }), [hover]);
}
