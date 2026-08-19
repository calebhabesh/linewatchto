"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const MOBILE_STATION_SHEET_STORAGE_KEY = "linewatch-mobile-station-sheet-height-v1";
export const MOBILE_SHEET_FLOOR_RATIO = 0.50;
export const MOBILE_SHEET_DEFAULT_RATIO = 0.50;
export const MOBILE_SHEET_EXPANDED_RATIO = 0.90;
export const MOBILE_SHEET_CEILING_RATIO = 0.92;

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

  const dragStartRef = useRef<{
    startY: number;
    startRatio: number;
    viewportHeight: number;
    pointerId: number;
    hasMoved: boolean;
    target: HTMLElement;
  } | null>(null);

  useEffect(() => {
    currentRatioRef.current = heightRatio;
  }, [heightRatio]);

  const updateAndPersistRatio = useCallback((nextRatio: number) => {
    const clamped = clampSheetRatio(nextRatio);
    currentRatioRef.current = clamped;
    setHeightRatio(clamped);
    const el = sheetRef.current;
    if (el) {
      el.style.transition = "";
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
    const next = current <= 0.65 ? MOBILE_SHEET_EXPANDED_RATIO : MOBILE_SHEET_FLOOR_RATIO;
    updateAndPersistRatio(next);
  }, [updateAndPersistRatio]);

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
    dragStartRef.current = {
      startY: e.clientY,
      startRatio,
      viewportHeight,
      pointerId: e.pointerId,
      hasMoved: false,
      target,
    };
    isDraggingRef.current = true;
    setIsDragging(true);

    const sheetEl = sheetRef.current;
    if (sheetEl) {
      sheetEl.style.transition = "none";
      sheetEl.classList.add("station-detail-sheet-dragging");
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== e.pointerId) return;

    const { startY, startRatio, viewportHeight } = dragStartRef.current;
    const deltaY = startY - e.clientY;

    if (Math.abs(deltaY) > 3) {
      dragStartRef.current.hasMoved = true;
    }

    const deltaRatio = deltaY / viewportHeight;
    const newRatio = clampSheetRatio(startRatio + deltaRatio);
    currentRatioRef.current = newRatio;

    // Direct DOM mutation in RAF (zero React re-renders while moving finger)
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const el = sheetRef.current;
        if (el && isDraggingRef.current) {
          const pxValue = `${Math.round(currentRatioRef.current * viewportHeight)}px`;
          el.style.setProperty("--mobile-station-sheet-height", pxValue);
          el.style.height = pxValue;
          el.style.maxHeight = pxValue;
        }
      });
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== e.pointerId) return;

    const { hasMoved, target, pointerId } = dragStartRef.current;
    dragStartRef.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);

    try {
      target.releasePointerCapture(pointerId);
    } catch {
      // Ignore
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const sheetEl = sheetRef.current;
    if (sheetEl) {
      sheetEl.style.transition = "";
      sheetEl.classList.remove("station-detail-sheet-dragging");
      sheetEl.style.height = "";
      sheetEl.style.maxHeight = "";
    }

    if (!hasMoved) {
      handleToggleExpand();
    } else {
      const finalRatio = currentRatioRef.current;
      setHeightRatio(finalRatio);
      if (sheetEl) {
        sheetEl.style.setProperty("--mobile-station-sheet-height", `${Math.round(finalRatio * 100)}dvh`);
      }
      if (typeof window !== "undefined") {
        writeStoredSheetHeightRatio(window.localStorage, finalRatio);
      }
    }
  }, [handleToggleExpand]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== e.pointerId) return;

    const { target, pointerId } = dragStartRef.current;
    dragStartRef.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);

    try {
      target.releasePointerCapture(pointerId);
    } catch {
      // Ignore
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const sheetEl = sheetRef.current;
    if (sheetEl) {
      sheetEl.style.transition = "";
      sheetEl.classList.remove("station-detail-sheet-dragging");
      sheetEl.style.height = "";
      sheetEl.style.maxHeight = "";
    }

    const finalRatio = currentRatioRef.current;
    setHeightRatio(finalRatio);
    if (sheetEl) {
      sheetEl.style.setProperty("--mobile-station-sheet-height", `${Math.round(finalRatio * 100)}dvh`);
    }
    if (typeof window !== "undefined") {
      writeStoredSheetHeightRatio(window.localStorage, finalRatio);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      updateAndPersistRatio(currentRatioRef.current + 0.10);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      updateAndPersistRatio(currentRatioRef.current - 0.10);
    } else if (e.key === "Home") {
      e.preventDefault();
      updateAndPersistRatio(MOBILE_SHEET_FLOOR_RATIO);
    } else if (e.key === "End") {
      e.preventDefault();
      updateAndPersistRatio(MOBILE_SHEET_CEILING_RATIO);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggleExpand();
    }
  }, [handleToggleExpand, updateAndPersistRatio]);


  return {
    sheetRef,
    heightRatio,
    isDragging,
    isExpanded: heightRatio > 0.65,
    handleToggleExpand,
    dragHandleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
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
