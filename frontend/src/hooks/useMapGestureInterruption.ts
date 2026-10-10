"use client";

import { useEffect } from "react";

/** A pointer released outside the page may never deliver pointerup here. */
export function useMapGestureInterruption(onInterrupt: () => void) {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") onInterrupt();
    };
    window.addEventListener("blur", onInterrupt);
    window.addEventListener("pagehide", onInterrupt);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", onInterrupt);
      window.removeEventListener("pagehide", onInterrupt);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onInterrupt]);
}
