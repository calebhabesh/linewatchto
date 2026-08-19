"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const MOBILE_STATION_SHEET_STORAGE_KEY = "linewatch-mobile-station-sheet-height-v1";
export const MOBILE_SHEET_FLOOR_RATIO = 0.50;
export const MOBILE_SHEET_DEFAULT_RATIO = 0.50;
export const MOBILE_SHEET_EXPANDED_RATIO = 0.90;
export const MOBILE_SHEET_CEILING_RATIO = 0.92;
export const MOBILE_SHEET_SNAP_THRESHOLD = 0.68;

export function clampSheetRatio(ratio: number): number {
  if (Number.isNaN(ratio) || !Number.isFinite(ratio)) {
    return MOBILE_SHEET_DEFAULT_RATIO;
  }
  return Math.min(MOBILE_SHEET_CEILING_RATIO, Math.max(MOBILE_SHEET_FLOOR_RATIO, Number(ratio.toFixed(3))));
}

export function readStoredSheetHeightRatio(storage?: Pick<Storage, "getItem"> | null): number {
  if (!storage) return MOBILE_SHEET_DEFAULT_RATIO;
  try {
    const raw = storage.getItem(MOBILE_STATION_SHEET_STORAGE_KEY);
    if (!raw) return MOBILE_SHEET_DEFAULT_RATIO;
    const parsed = parseFloat(raw);
    return clampSheetRatio(parsed);
  } catch {
    return MOBILE_SHEET_DEFAULT_RATIO;
  }
}

export function writeStoredSheetHeightRatio(
  storage: Pick<Storage, "setItem"> | null | undefined,
  ratio: number,
): void {
  if (!storage) return;
  try {
    const clamped = clampSheetRatio(ratio);
    storage.setItem(MOBILE_STATION_SHEET_STORAGE_KEY, clamped.toString());
  } catch {
    // Ignore private browsing or quota errors
  }
}

type DragHistoryPoint = {
  y: number;
  time: number;
};

export function useMobileDraggableSheet() {
  const sheetRef = useRef<HTMLElement | null>(null);
  const [heightRatio, setHeightRatio] = useState<number>(() => {
    if (typeof window === "undefined") return MOBILE_SHEET_DEFAULT_RATIO;
    return readStoredSheetHeightRatio(window.localStorage);
  });
  const [isDragging, setIsDragging] = useState(false);

  const currentRatioRef = useRef(heightRatio);
  const rafIdRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const dragSessionRef = useRef<{
    startY: number;
    startRatio: number;
    startHeightPx: number;
    viewportHeight: number;
    pointerId: number;
    startTime: number;
    history: DragHistoryPoint[];
    target: HTMLElement;
  } | null>(null);

  useEffect(() => {
    currentRatioRef.current = heightRatio;
  }, [heightRatio]);

  const snapToRatio = useCallback((nextRatio: number) => {
    const clamped = clampSheetRatio(nextRatio);
    currentRatioRef.current = clamped;
    setHeightRatio(clamped);
    const el = sheetRef.current;
    if (el) {
      el.style.transition = "";
      el.classList.remove("station-detail-sheet-dragging");
      el.style.setProperty("--mobile-station-sheet-height", `${Math.round(clamped * 100)}dvh`);
      el.style.height = "";
      el.style.maxHeight = "";
    }
    if (typeof window !== "undefined") {
      writeStoredSheetHeightRatio(window.localStorage, clamped);
    }
  }, []);

  const handleToggleExpand = useCallback(() => {
    const current = currentRatioRef.current;
    const next = current <= MOBILE_SHEET_SNAP_THRESHOLD ? MOBILE_SHEET_EXPANDED_RATIO : MOBILE_SHEET_FLOOR_RATIO;
    snapToRatio(next);
  }, [snapToRatio]);

  const moveListenerRef = useRef<((e: PointerEvent) => void) | null>(null);
  const endListenerRef = useRef<((e: PointerEvent) => void) | null>(null);

  const cleanupListeners = useCallback(() => {
    if (moveListenerRef.current) {
      window.removeEventListener("pointermove", moveListenerRef.current);
      moveListenerRef.current = null;
    }
    if (endListenerRef.current) {
      window.removeEventListener("pointerup", endListenerRef.current);
      window.removeEventListener("pointercancel", endListenerRef.current);
      endListenerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;

    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Fallback
    }

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? 800;
    const startRatio = currentRatioRef.current;
    const now = performance.now();

    dragSessionRef.current = {
      startY: e.clientY,
      startRatio,
      startHeightPx: startRatio * viewportHeight,
      viewportHeight,
      pointerId: e.pointerId,
      startTime: now,
      history: [{ y: e.clientY, time: now }],
      target,
    };

    isDraggingRef.current = true;
    setIsDragging(true);

    const sheetEl = sheetRef.current;
    if (sheetEl) {
      sheetEl.style.transition = "none";
      sheetEl.classList.add("station-detail-sheet-dragging");
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== moveEvent.pointerId) return;

      const currentTime = performance.now();
      session.history.push({ y: moveEvent.clientY, time: currentTime });
      if (session.history.length > 6) {
        session.history.shift();
      }

      const deltaY = session.startY - moveEvent.clientY;
      const currentHeightPx = session.startHeightPx + deltaY;
      const nextRatio = clampSheetRatio(currentHeightPx / session.viewportHeight);
      currentRatioRef.current = nextRatio;

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          const el = sheetRef.current;
          if (el && isDraggingRef.current) {
            const pxValue = `${Math.round(currentRatioRef.current * session.viewportHeight)}px`;
            el.style.setProperty("--mobile-station-sheet-height", pxValue);
            el.style.height = pxValue;
            el.style.maxHeight = pxValue;
          }
        });
      }
    };

    const onPointerEnd = (endEvent: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== endEvent.pointerId) return;

      cleanupListeners();

      try {
        session.target.releasePointerCapture(session.pointerId);
      } catch {
        // Ignore
      }

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      isDraggingRef.current = false;
      setIsDragging(false);

      const endTime = performance.now();
      const duration = endTime - session.startTime;
      const totalDisplacement = session.startY - endEvent.clientY;
      const isTap = Math.abs(totalDisplacement) < 5 && duration < 350;

      dragSessionRef.current = null;

      if (isTap) {
        handleToggleExpand();
        return;
      }

      // Compute release velocity (px per ms, positive means moving upward)
      let velocity = 0;
      if (session.history.length >= 2) {
        const first = session.history[0];
        const last = session.history[session.history.length - 1];
        const dt = last.time - first.time;
        if (dt > 10) {
          velocity = (first.y - last.y) / dt;
        }
      }

      let targetRatio: number;
      if (velocity > 0.35) {
        targetRatio = MOBILE_SHEET_EXPANDED_RATIO;
      } else if (velocity < -0.35) {
        targetRatio = MOBILE_SHEET_FLOOR_RATIO;
      } else {
        targetRatio = currentRatioRef.current >= MOBILE_SHEET_SNAP_THRESHOLD
          ? MOBILE_SHEET_EXPANDED_RATIO
          : MOBILE_SHEET_FLOOR_RATIO;
      }

      snapToRatio(targetRatio);
    };

    cleanupListeners();
    moveListenerRef.current = onPointerMove;
    endListenerRef.current = onPointerEnd;

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  }, [cleanupListeners, handleToggleExpand, snapToRatio]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      snapToRatio(currentRatioRef.current + 0.10);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      snapToRatio(currentRatioRef.current - 0.10);
    } else if (e.key === "Home") {
      e.preventDefault();
      snapToRatio(MOBILE_SHEET_FLOOR_RATIO);
    } else if (e.key === "End") {
      e.preventDefault();
      snapToRatio(MOBILE_SHEET_CEILING_RATIO);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggleExpand();
    }
  }, [handleToggleExpand, snapToRatio]);

  // Clean up window listeners on unmount
  useEffect(() => {
    return () => {
      cleanupListeners();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [cleanupListeners]);

  return {
    sheetRef,
    heightRatio,
    isDragging,
    isExpanded: heightRatio > MOBILE_SHEET_SNAP_THRESHOLD,
    handleToggleExpand,
    dragHandleProps: {
      onPointerDown: handlePointerDown,
      onKeyDown: handleKeyDown,
      role: "slider" as const,
      tabIndex: 0,
      "aria-label": "Adjust station panel height",
      "aria-valuemin": Math.round(MOBILE_SHEET_FLOOR_RATIO * 100),
      "aria-valuemax": Math.round(MOBILE_SHEET_CEILING_RATIO * 100),
      "aria-valuenow": Math.round(heightRatio * 100),
      "aria-valuetext": `${Math.round(heightRatio * 100)}% screen height`,
    },
    sheetStyle: {
      "--mobile-station-sheet-height": `${Math.round(heightRatio * 100)}dvh`,
    } as React.CSSProperties,
  };
}
