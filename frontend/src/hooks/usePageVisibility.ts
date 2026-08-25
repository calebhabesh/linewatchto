"use client";

import { useEffect, useState } from "react";

export type PageLifecycleSignal = "synchronize" | "background" | "foreground";

export function pageVisibleAfterLifecycleSignal(
  signal: PageLifecycleSignal,
  visibilityState: DocumentVisibilityState,
): boolean {
  if (signal === "background") return false;
  if (signal === "foreground") return true;
  return visibilityState === "visible";
}

export function usePageVisibility() {
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    let lifecycleForeground = document.visibilityState !== "hidden";
    let foregroundRestartTimer: number | null = null;

    const cancelForegroundRestart = () => {
      if (foregroundRestartTimer === null) return;
      window.clearTimeout(foregroundRestartTimer);
      foregroundRestartTimer = null;
    };
    const synchronizeVisibility = () => {
      const nextVisible = pageVisibleAfterLifecycleSignal("synchronize", document.visibilityState);
      lifecycleForeground = nextVisible;
      if (!nextVisible) cancelForegroundRestart();
      setPageVisible(nextVisible);
    };
    const handlePageHide = () => {
      lifecycleForeground = false;
      cancelForegroundRestart();
      setPageVisible(pageVisibleAfterLifecycleSignal("background", document.visibilityState));
    };
    // iOS can dispatch pageshow/focus before visibilityState changes back from
    // "hidden" in a restored standalone PWA. These are authoritative foreground
    // signals, so do not immediately re-read the temporarily stale property.
    const handleForeground = () => {
      lifecycleForeground = true;
      cancelForegroundRestart();
      // Cycle through the paused state in a separate task. Besides correcting a
      // stale hidden flag, this restarts map requestAnimationFrame effects if
      // WebKit discarded their queued callback while suspending the process.
      setPageVisible(false);
      foregroundRestartTimer = window.setTimeout(() => {
        foregroundRestartTimer = null;
        if (!lifecycleForeground) return;
        setPageVisible(pageVisibleAfterLifecycleSignal("foreground", document.visibilityState));
      }, 0);
    };
    const handlePointerDown = () => {
      if (!lifecycleForeground) handleForeground();
    };

    synchronizeVisibility();
    document.addEventListener("visibilitychange", synchronizeVisibility);
    document.addEventListener("resume", handleForeground);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handleForeground);
    window.addEventListener("focus", handleForeground);
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });

    return () => {
      cancelForegroundRestart();
      document.removeEventListener("visibilitychange", synchronizeVisibility);
      document.removeEventListener("resume", handleForeground);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handleForeground);
      window.removeEventListener("focus", handleForeground);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  return pageVisible;
}
