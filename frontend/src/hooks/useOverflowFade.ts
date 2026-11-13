"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Marks an element data-overflowing="true" while its content is wider than its
 * box, so CSS can fade the clipped end instead of cutting a word mid-letter
 * (filter triggers: "All Servi…"). A fade on every label would also dim the end of
 * labels that fit, so it is applied only while the text overflows.
 */
export function useOverflowFade<T extends HTMLElement>(deps: readonly unknown[] = []) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const overflowing = element.scrollWidth > element.clientWidth + 1;
      if ((element.dataset.overflowing === "true") !== overflowing) {
        element.dataset.overflowing = overflowing ? "true" : "false";
      }
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
