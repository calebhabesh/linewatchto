"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { NetworkId } from "../app/dashboard-contract";
import type { MapLayerSwitchHandlers, MapLayerSwitchState } from "../app/map-layer-switches";
import { MapLayerSwitchList } from "./MapLayerSwitchList";
import { MobileSheetDragHandle } from "./MobileSheetDragHandle";

const CLOSE_MS = 200;
/** A drag down past this distance, or a flick faster than this, closes the sheet. */
const DISMISS_DISTANCE_PX = 64;
const DISMISS_SPEED_PX_PER_MS = 0.5;

const FOCUSABLE = "button:not(:disabled), input:not(:disabled)";

const stopReactBubble = (event: { stopPropagation: () => void }) => event.stopPropagation();

/**
 * The phone's Map View layer switches (plan 15, L2). Sized to its rows, not the
 * station sheet's 50% floor and saved height, so the map stays in view while
 * switches apply live. Mounted only while open, in the shell so it sits above
 * the bottom nav and any stop sheet and picks up the shell's theme classes.
 */
export function MapLayersSheet({ network, state, handlers, reducedMotion, onClose }: {
  network: NetworkId;
  state: MapLayerSwitchState;
  handlers: MapLayerSwitchHandlers;
  reducedMotion: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; startTime: number } | null>(null);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, CLOSE_MS);
  }, [onClose, reducedMotion]);

  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // Phone or browser Back: the shell keeps the view and the entry this sheet added is spent.
    window.addEventListener("popstate", requestClose);
    return () => window.removeEventListener("popstate", requestClose);
  }, [requestClose]);

  useEffect(() => {
    // On the document, so Escape and the focus loop still work if the focused switch becomes disabled.
    const handleKeyDown = (event: KeyboardEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      const leaving = event.shiftKey
        ? active === first || active === sheet || !sheet.contains(active)
        : active === last || !sheet.contains(active);
      if (leaving) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [requestClose]);

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || closingRef.current || (event.target as Element).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startTime: performance.now() };
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !sheetRef.current) return;
    sheetRef.current.style.transform = `translate3d(0, ${Math.max(0, event.clientY - drag.startY)}px, 0)`;
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const distance = event.clientY - drag.startY;
    const speed = distance / Math.max(1, performance.now() - drag.startTime);
    const sheet = sheetRef.current;
    if (sheet) {
      // Back to the stylesheet: it animates to rest, or on to closed below.
      sheet.style.transition = "";
      sheet.style.transform = "";
    }
    if (event.type === "pointerup" && (distance > DISMISS_DISTANCE_PX || (distance > 8 && speed > DISMISS_SPEED_PX_PER_MS))) {
      requestClose();
    }
  };

  const dragProps = {
    onPointerDown: handleDragStart,
    onPointerMove: handleDragMove,
    onPointerUp: handleDragEnd,
    onPointerCancel: handleDragEnd,
  };

  // React events follow the component tree, so keep these from reaching the map's ancestors.
  return createPortal(
    <div
      className="map-layers-sheet-root"
      data-closing={closing ? "true" : undefined}
      onClick={stopReactBubble}
      onPointerDown={stopReactBubble}
      onKeyDown={stopReactBubble}
    >
      <div className="map-layers-sheet-scrim" data-map-layers-sheet-scrim onClick={requestClose} aria-hidden="true" />
      <section
        ref={sheetRef}
        className="map-layers-sheet"
        data-map-layers-sheet
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <MobileSheetDragHandle dragHandleProps={dragProps} />
        <header className="map-layers-sheet-header" {...dragProps}>
          <h2 id={titleId} className="map-layers-sheet-title">Map Layers</h2>
          <button type="button" className="map-layers-sheet-close" onClick={requestClose} aria-label="Close map layers">
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="map-layers-sheet-scroll">
          <MapLayerSwitchList network={network} layout="sheet" state={state} handlers={handlers} />
        </div>
      </section>
    </div>,
    document.querySelector(".linewatch-shell") ?? document.body,
  );
}
