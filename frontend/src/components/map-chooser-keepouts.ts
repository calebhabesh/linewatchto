export const MAP_CHOOSER_KEEPOUT_SELECTOR = [
  ".desktop-status-capsule-anchor",
  ".desktop-map-control-rail",
  ".desktop-map-legend",
  ".desktop-status-chip-row-container",
  ".mobile-bottom-nav",
  ".mobile-status-peek",
  ".mobile-legend-pill",
  ".mobile-train-toggle",
  ".mobile-train-left-cluster",
  ".mobile-alert-history-shortcut",
  ".mobile-my-stations-shortcut",
  ".map-utility-cluster",
  ".map-control-rail",
  ".mobile-map-controls",
  ".rotated-map-hud",
  ".rotated-map-selection-hud",
  ".subway-closing-soon-chip",
  ".subway-closed-peek-chip",
  ".release-notes-notice",
  ".saved-station-global-notice",
  "header button",
  "header a",
  "[data-map-chooser-keepout]",
].join(",");

export function isVisibleMapChooserKeepout(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (typeof element.checkVisibility === "function" && !element.checkVisibility({
    checkOpacity: true,
    checkVisibilityCSS: true,
  })) return false;

  // Some browsers expose layout rectangles for descendants of a faded or
  // collapsed panel. Walk the composed ancestor chain as a fallback so those
  // off-screen controls do not consume every valid chooser position.
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (
      style.display === "none"
      || style.visibility === "hidden"
      || style.visibility === "collapse"
      || Number(style.opacity) <= 0
    ) return false;
  }
  return true;
}

export function visibleMapChooserKeepouts(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(MAP_CHOOSER_KEEPOUT_SELECTOR))
    .filter(isVisibleMapChooserKeepout);
}

function nodeContainsMapChooserKeepout(node: Node): boolean {
  return node instanceof Element && (
    node.matches(MAP_CHOOSER_KEEPOUT_SELECTOR)
    || Boolean(node.querySelector(MAP_CHOOSER_KEEPOUT_SELECTOR))
  );
}

export function mutationChangesMapChooserKeepouts(records: MutationRecord[]): boolean {
  return records.some((record) =>
    (record.type === "attributes" && nodeContainsMapChooserKeepout(record.target))
    || [...record.addedNodes, ...record.removedNodes].some(nodeContainsMapChooserKeepout)
  );
}

/**
 * Keep chooser collision measurements current as shell-owned controls mount,
 * resize, animate, or move with the visual viewport. The maps own different
 * coordinate systems, so this helper deliberately reports invalidation rather
 * than returning rectangles.
 */
export function observeMapChooserKeepouts(onChange: () => void): () => void {
  const observedKeepouts = new Set<HTMLElement>();
  let animationFrame: number | null = null;

  const scheduleChange = () => {
    if (animationFrame !== null) return;
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = null;
      scan();
      onChange();
    });
  };
  const resizeObserver = new ResizeObserver(scheduleChange);
  const scan = () => {
    visibleMapChooserKeepouts().forEach((element) => {
      if (observedKeepouts.has(element)) return;
      observedKeepouts.add(element);
      resizeObserver.observe(element);
    });
  };
  const mutationObserver = new MutationObserver((records) => {
    if (mutationChangesMapChooserKeepouts(records)) scheduleChange();
  });

  scan();
  mutationObserver.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
  });
  window.addEventListener("resize", scheduleChange);
  window.addEventListener("scroll", scheduleChange, true);
  document.addEventListener("transitionrun", scheduleChange, true);
  document.addEventListener("transitionend", scheduleChange, true);
  document.addEventListener("animationstart", scheduleChange, true);
  document.addEventListener("animationend", scheduleChange, true);
  window.visualViewport?.addEventListener("resize", scheduleChange);
  window.visualViewport?.addEventListener("scroll", scheduleChange);

  return () => {
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    mutationObserver.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener("resize", scheduleChange);
    window.removeEventListener("scroll", scheduleChange, true);
    document.removeEventListener("transitionrun", scheduleChange, true);
    document.removeEventListener("transitionend", scheduleChange, true);
    document.removeEventListener("animationstart", scheduleChange, true);
    document.removeEventListener("animationend", scheduleChange, true);
    window.visualViewport?.removeEventListener("resize", scheduleChange);
    window.visualViewport?.removeEventListener("scroll", scheduleChange);
  };
}
