"use client";

import { useCallback, useRef, useState } from "react";

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
  const [heightRatio, setHeightRatio] = useState<number>(() => {
    if (typeof window === "undefined") return MOBILE_SHEET_DEFAULT_RATIO;
    return readStoredSheetHeightRatio(window.localStorage);
  });
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{
    startY: number;
    startRatio: number;
    viewportHeight: number;
    pointerId: number;
    hasMoved: boolean;
  } | null>(null);

  const updateAndPersistRatio = useCallback((nextRatio: number) => {
    const clamped = clampSheetRatio(nextRatio);
    setHeightRatio(clamped);
    if (typeof window !== "undefined") {
      writeStoredSheetHeightRatio(window.localStorage, clamped);
    }
  }, []);

  const handleToggleExpand = useCallback(() => {
    setHeightRatio((current) => {
      const next = current <= 0.65 ? MOBILE_SHEET_EXPANDED_RATIO : MOBILE_SHEET_FLOOR_RATIO;
      if (typeof window !== "undefined") {
        writeStoredSheetHeightRatio(window.localStorage, next);
      }
      return next;
    });
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
    dragStartRef.current = {
      startY: e.clientY,
      startRatio: heightRatio,
      viewportHeight,
      pointerId: e.pointerId,
      hasMoved: false,
    };
    setIsDragging(true);
  }, [heightRatio]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== e.pointerId) return;

    const { startY, startRatio, viewportHeight } = dragStartRef.current;
    const deltaY = startY - e.clientY; // upward drag increases sheet height

    if (Math.abs(deltaY) > 3) {
      dragStartRef.current.hasMoved = true;
    }

    const deltaRatio = deltaY / viewportHeight;
    const newRatio = clampSheetRatio(startRatio + deltaRatio);
    setHeightRatio(newRatio);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== e.pointerId) return;

    const target = e.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const hadMoved = dragStartRef.current.hasMoved;
    dragStartRef.current = null;
    setIsDragging(false);

    if (!hadMoved) {
      handleToggleExpand();
    } else {
      if (typeof window !== "undefined") {
        writeStoredSheetHeightRatio(window.localStorage, heightRatio);
      }
    }
  }, [handleToggleExpand, heightRatio]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== e.pointerId) return;

    const target = e.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    dragStartRef.current = null;
    setIsDragging(false);

    if (typeof window !== "undefined") {
      writeStoredSheetHeightRatio(window.localStorage, heightRatio);
    }
  }, [heightRatio]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      updateAndPersistRatio(heightRatio + 0.10);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      updateAndPersistRatio(heightRatio - 0.10);
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
  }, [handleToggleExpand, heightRatio, updateAndPersistRatio]);

  return {
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
