"use client";

import { reserveSheetMotionBudget } from "../components/sheet-motion-budget.ts";
import { useCallback, useEffect, useRef, useState } from "react";

export const MOBILE_STATION_SHEET_STORAGE_KEY = "linewatch-mobile-station-sheet-height-v1";
export const MOBILE_STATION_SHEET_RESIZE_EVENT = "linewatch:station-sheet-resize";
export const MOBILE_SHEET_FLOOR_RATIO = 0.50;
export const MOBILE_SHEET_DEFAULT_RATIO = 0.50;
export const MOBILE_SHEET_EXPANDED_RATIO = 1;
export const MOBILE_SHEET_CEILING_RATIO = 1;
export const MOBILE_SHEET_SNAP_THRESHOLD = 0.68;

export function clampSheetRatio(ratio: number): number {
  if (Number.isNaN(ratio) || !Number.isFinite(ratio)) {
    return MOBILE_SHEET_DEFAULT_RATIO;
  }
  return Math.min(MOBILE_SHEET_CEILING_RATIO, Math.max(MOBILE_SHEET_FLOOR_RATIO, Number(ratio.toFixed(3))));
}

export function computeDampedRatio(rawRatio: number): number {
  if (Number.isNaN(rawRatio) || !Number.isFinite(rawRatio)) {
    return MOBILE_SHEET_DEFAULT_RATIO;
  }
  return clampSheetRatio(rawRatio);
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

export function useMobileDraggableSheet() {
  const releaseMotion = useRef<ReturnType<typeof reserveSheetMotionBudget> | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const [heightRatio, setHeightRatio] = useState<number>(() => {
    if (typeof window === "undefined") return MOBILE_SHEET_DEFAULT_RATIO;
    return readStoredSheetHeightRatio(window.localStorage);
  });
  const [isDragging, setIsDragging] = useState(false);

  const currentRatioRef = useRef(heightRatio);
  const rafIdRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const latestTranslateYRef = useRef(0);

  const dragSessionRef = useRef<{
    startY: number;
    startHeightPx: number;
    viewportHeight: number;
    pointerId: number;
    startTime: number;
    target: HTMLElement;
  } | null>(null);

  useEffect(() => {
    currentRatioRef.current = heightRatio;
  }, [heightRatio]);

  const snapToRatio = useCallback((nextRatio: number, animate = true) => {
    const clamped = clampSheetRatio(nextRatio);
    currentRatioRef.current = clamped;
    setHeightRatio(clamped);
    const el = sheetRef.current;
    if (el) {
      if (!animate) {
        el.style.transition = "none";
      } else {
        el.style.transition = "";
      }
      el.style.transform = "";
      el.style.willChange = "";
      el.style.height = "";
      el.style.maxHeight = "";
      el.classList.remove("station-detail-sheet-dragging");
      const translateYPercent = ((MOBILE_SHEET_CEILING_RATIO - clamped) * 100).toFixed(2);
      el.style.setProperty("--mobile-station-sheet-translate-y", `${translateYPercent}dvh`);
      el.style.setProperty("--mobile-station-sheet-height", `${Math.round(clamped * 100)}dvh`);
      if (!animate) {
        requestAnimationFrame(() => {
          if (el) el.style.transition = "";
        });
      }
    }
    if (typeof window !== "undefined") {
      writeStoredSheetHeightRatio(window.localStorage, clamped);
      window.dispatchEvent(new CustomEvent(MOBILE_STATION_SHEET_RESIZE_EVENT, { detail: { ratio: clamped } }));
    }
  }, []);

  const handleToggleExpand = useCallback(() => {
    const current = currentRatioRef.current;
    const next = current <= MOBILE_SHEET_SNAP_THRESHOLD ? MOBILE_SHEET_EXPANDED_RATIO : MOBILE_SHEET_FLOOR_RATIO;
    snapToRatio(next, true);
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
    if (window.innerWidth >= 768 || (e.target as Element).closest("button, a, input, select, textarea")) return;
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;

    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Fallback
    }

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? 800;
    const startRatio = currentRatioRef.current;
    const startTranslateYPx = Math.max(
      0,
      (MOBILE_SHEET_CEILING_RATIO - startRatio) * viewportHeight,
    );
    const now = performance.now();

    dragSessionRef.current = {
      startY: e.clientY,
      startHeightPx: startRatio * viewportHeight,
      viewportHeight,
      pointerId: e.pointerId,
      startTime: now,
      target,
    };

    isDraggingRef.current = true;
    setIsDragging(true);

    const sheetEl = sheetRef.current;
    if (sheetEl) {
      releaseMotion.current?.();
      releaseMotion.current = reserveSheetMotionBudget(sheetEl);
      sheetEl.style.transition = "none";
      sheetEl.style.willChange = "transform";
      sheetEl.classList.add("station-detail-sheet-dragging");
      sheetEl.style.transform = `translate3d(0, ${startTranslateYPx.toFixed(1)}px, 0)`;
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== moveEvent.pointerId) return;

      const deltaY = moveEvent.clientY - session.startY; // positive = dragging DOWN
      const rawTranslateY = (MOBILE_SHEET_CEILING_RATIO - (session.startHeightPx / session.viewportHeight)) * session.viewportHeight + deltaY;
      const minTranslateY = 0;
      const maxTranslateY = (MOBILE_SHEET_CEILING_RATIO - MOBILE_SHEET_FLOOR_RATIO) * session.viewportHeight;
      const clampedTranslateY = Math.max(minTranslateY, Math.min(maxTranslateY, rawTranslateY));
      const calculatedRatio = MOBILE_SHEET_CEILING_RATIO - (clampedTranslateY / session.viewportHeight);
      const currentRatio = clampSheetRatio(calculatedRatio);
      currentRatioRef.current = currentRatio;
      latestTranslateYRef.current = clampedTranslateY;

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          const el = sheetRef.current;
          if (el && isDraggingRef.current) {
            el.style.transform = `translate3d(0, ${latestTranslateYRef.current.toFixed(1)}px, 0)`;
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
      releaseMotion.current?.(isTap ? 240 : 0);

      if (isTap) {
        const el = sheetRef.current;
        if (el) {
          el.style.transform = "";
          el.style.willChange = "";
          el.style.height = "";
          el.style.maxHeight = "";
          el.classList.remove("station-detail-sheet-dragging");
        }
        handleToggleExpand();
        return;
      }

      // Settle firmly at the exact ratio where the user let go (firmly clamped, no rebound, no jump)
      snapToRatio(currentRatioRef.current, false);
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
      snapToRatio(currentRatioRef.current + 0.05);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      snapToRatio(currentRatioRef.current - 0.05);
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
      releaseMotion.current?.();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [cleanupListeners]);

  const translateYPercent = ((MOBILE_SHEET_CEILING_RATIO - heightRatio) * 100).toFixed(2);

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
      "--mobile-station-sheet-translate-y": `${translateYPercent}dvh`,
    } as React.CSSProperties,
  };
}
