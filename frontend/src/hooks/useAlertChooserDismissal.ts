"use client";

import { useEffect, useRef } from "react";

/** Dismiss for a new map focus, while allowing panning and ordinary menu navigation. */
export function useAlertChooserDismissal(
  selectionKey: string | null | undefined,
  onClose: (restoreFocus: boolean) => void,
) {
  const previousSelectionKey = useRef(selectionKey);
  useEffect(() => {
    const changed = selectionKey !== previousSelectionKey.current;
    previousSelectionKey.current = selectionKey;
    if (selectionKey && changed) onClose(false);
  }, [onClose, selectionKey]);
}
