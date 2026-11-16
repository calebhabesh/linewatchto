"use client";

import { useLayoutEffect, type RefObject } from "react";

/** The advisory headings a line's spine branches to ("Upcoming", "Other Advisories"). */
export const TRUNK_END_ATTRIBUTE = "data-trunk-end";
/** The line badge a spine starts under. */
export const SPINE_START_ATTRIBUTE = "data-spine-start";
/** The `<svg>` (with one `<path>`) a group's spine is drawn into; see AdvisorySpine. */
export const SPINE_ATTRIBUTE = "data-advisory-spine";

const SPINE_BADGE_GAP = 5;
const SPINE_HEADING_GAP = 5;
const SPINE_RADIUS = 6;

const round = (value: number) => Math.round(value * 2) / 2;

/**
 * The spine as one path, so its translucent stroke never double-paints where
 * pieces meet: a trunk from under the badge that curves into the last heading,
 * and a curved branch into each heading above it. Coordinates are relative to
 * the group.
 */
export function advisorySpinePath(start: { x: number; y: number }, headings: { y: number; x: number }[]): string {
  if (!headings.length) return "";
  const { x, y } = start;
  const segment = (heading: { x: number; y: number }, from: number) => {
    const radius = Math.max(0, Math.min(SPINE_RADIUS, heading.y - from, heading.x - x));
    return `M ${x} ${from} V ${heading.y - radius} A ${radius} ${radius} 0 0 0 ${x + radius} ${heading.y} H ${heading.x}`;
  };
  const last = headings[headings.length - 1];
  return [
    segment(last, y),
    ...headings.slice(0, -1).map((heading) => segment(heading, Math.max(y, heading.y - SPINE_RADIUS))),
  ].join(" ");
}

/**
 * Draws each line's spine: for every `groupSelector` match under the container,
 * measures its badge and advisory headings and writes the path into the group's
 * AdvisorySpine. Cards between headings vary in height and the copy column's
 * offset changes with breakpoints, so the spine is measured, not set in CSS.
 */
export function useAdvisoryTrunkEnds(containerRef: RefObject<HTMLElement | null>, groupSelector: string) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      container.querySelectorAll<HTMLElement>(groupSelector).forEach((group) => {
        const path = group.querySelector<SVGPathElement>(`:scope > svg[${SPINE_ATTRIBUTE}] > path`);
        if (!path) return;
        const badge = group.querySelector<HTMLElement>(`[${SPINE_START_ATTRIBUTE}]`);
        const ends = Array.from(group.querySelectorAll<HTMLElement>(`[${TRUNK_END_ATTRIBUTE}]`));
        if (!badge || !ends.length) {
          path.removeAttribute("d");
          return;
        }
        const groupBox = group.getBoundingClientRect();
        const badgeBox = badge.getBoundingClientRect();
        const start = {
          x: round(badgeBox.left + badgeBox.width / 2 - groupBox.left),
          y: round(badgeBox.bottom - groupBox.top + SPINE_BADGE_GAP),
        };
        const headings = ends.map((end) => {
          const box = end.getBoundingClientRect();
          return { x: round(box.left - groupBox.left - SPINE_HEADING_GAP), y: round(box.top + box.height / 2 - groupBox.top) };
        });
        path.setAttribute("d", advisorySpinePath(start, headings));
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
