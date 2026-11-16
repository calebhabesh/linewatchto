import type { MouseEvent } from "react";

/** Matches the collapse transition in saved-commutes.css (.saved-commute-impact-content-wrapper). */
const COLLAPSE_MS = 220;

/**
 * Summary clicks for the animated disruption lists (My Commutes, My Stations):
 * `<details>` with a `.saved-commute-impact-content-wrapper` around its body.
 *
 * Opening starts from the closed rows for one frame (`opening`), so the very
 * first open animates too: a closed `<details>` never lays out its body, which
 * otherwise appears already open. Closing holds the body open behind
 * `collapsing` while it animates shut. The element's `toggle` event still
 * reports each change.
 */
export function handleAnimatedDisclosureClick(event: MouseEvent<HTMLDetailsElement>) {
  const target = event.target as HTMLElement;
  const summary = target.closest("summary");
  if (!summary || summary.parentElement !== event.currentTarget) return;
  const details = event.currentTarget;
  if (details.classList.contains("collapsing")) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  if (details.open) {
    details.classList.add("collapsing");
    window.setTimeout(() => {
      details.open = false;
      details.classList.remove("collapsing");
    }, COLLAPSE_MS);
    return;
  }
  details.classList.add("opening");
  details.open = true;
  // Lay out the closed state before letting it transition open.
  const wrapper = details.querySelector<HTMLElement>(".saved-commute-impact-content-wrapper");
  if (wrapper) void getComputedStyle(wrapper).gridTemplateRows;
  void details.offsetHeight;
  details.classList.remove("opening");
}
