import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { panelExitMs, PHONE_PANEL_MAX_WIDTH } from "./panel-exit";

/**
 * Closes a station-style panel once its exit animation has played. Where no
 * exit plays (the desktop sidebar, Reduce Animations) it closes at once.
 */
export function usePanelClose(
  panelRef: RefObject<HTMLElement | null>,
  { reducedMotion, onClose }: { reducedMotion: boolean; onClose: () => void },
) {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const requestClose = useCallback(() => {
    if (timerRef.current !== null) return;
    const exitMs = panelExitMs({
      reducedMotion,
      inDesktopSidebar: Boolean(panelRef.current?.closest(".desktop-sidebar-container")),
      phoneWidth: window.innerWidth <= PHONE_PANEL_MAX_WIDTH,
    });
    if (exitMs === 0) {
      onClose();
      return;
    }
    setIsClosing(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onClose();
      setIsClosing(false);
    }, exitMs);
  }, [onClose, panelRef, reducedMotion]);

  return { isClosing, requestClose };
}
