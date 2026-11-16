"use client";

import { useLayoutEffect, type RefObject } from "react";

/** The advisory headings a line's elbow may end on ("Upcoming", "Other Advisories"). */
export const TRUNK_END_ATTRIBUTE = "data-trunk-end";

/**
 * Ends each line's elbow (its `::before`) on its last advisory heading: sets
 * `--trunk-end` on every `groupSelector` match under the container to the
 * distance from the line's bottom to the middle of that heading's text. Cards
 * above the heading vary in height, so a fixed CSS offset cannot find it.
 */
export function useAdvisoryTrunkEnds(containerRef: RefObject<HTMLElement | null>, groupSelector: string) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      container.querySelectorAll<HTMLElement>(groupSelector).forEach((group) => {
        const ends = group.querySelectorAll<HTMLElement>(`[${TRUNK_END_ATTRIBUTE}]`);
        const last = ends[ends.length - 1];
        if (!last) {
          group.style.removeProperty("--trunk-end");
          return;
        }
        const groupBox = group.getBoundingClientRect();
        const endBox = last.getBoundingClientRect();
        group.style.setProperty("--trunk-end", `${Math.round((groupBox.bottom - (endBox.top + endBox.height / 2)) * 2) / 2}px`);
      });
    };
    const resize = new ResizeObserver(update);
    const observe = () => {
      resize.disconnect();
      resize.observe(container);
      container.querySelectorAll<HTMLElement>(groupSelector).forEach((group) => resize.observe(group));
      update();
    };
    const mutations = new MutationObserver(observe);
    mutations.observe(container, { childList: true, subtree: true });
    observe();
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [containerRef, groupSelector]);
}
