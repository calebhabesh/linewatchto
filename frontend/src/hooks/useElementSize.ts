"use client";

import { useCallback, useState } from "react";

/** The element's content box, so a chart can draw at the size it is given. Zero until measured. */
export function useElementSize(): [(node: HTMLElement | null) => (() => void) | undefined, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}
