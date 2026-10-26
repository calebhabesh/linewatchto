export const MAP_CHOOSER_KEEPOUT_SELECTOR = [
  ".desktop-sidebar-container:not(.desktop-sidebar-container--collapsed)",
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

// Map content that changes on every camera frame and never holds a keep-out.
// Checking these on each mutation or transition event is pure per-frame cost
// while a map moves with the chooser open.
const MAP_CHOOSER_KEEPOUT_IGNORED_SUBTREES = [
  ".ttc-map-stage",
  ".regional-map-stage",
  ".maplibregl-canvas-container",
  ".overlap-chooser-portal",
].join(",");

// Camera state flags; no keep-out changes size or visibility with them.
const MAP_CAMERA_FLAG_ATTRIBUTES = new Set([
  "data-map-gesture-active",
  "data-map-zoom-active",
  "data-map-camera-moving",
  "data-map-pointer-dragging",
  "data-regional-map-camera-moving",
]);

function nodeContainsMapChooserKeepout(node: Node | EventTarget | null): boolean {
  if (!(node instanceof Element)) return false;
  if (typeof SVGElement !== "undefined" && node instanceof SVGElement) return false;
  if (node.closest(MAP_CHOOSER_KEEPOUT_IGNORED_SUBTREES)) return false;
  return node.matches(MAP_CHOOSER_KEEPOUT_SELECTOR)
    || Boolean(node.querySelector(MAP_CHOOSER_KEEPOUT_SELECTOR));
}

export function mutationChangesMapChooserKeepouts(records: MutationRecord[]): boolean {
  return records.some((record) =>
    (
      record.type === "attributes"
      && !MAP_CAMERA_FLAG_ATTRIBUTES.has(record.attributeName ?? "")
      && nodeContainsMapChooserKeepout(record.target)
    )
    || [...record.addedNodes, ...record.removedNodes].some(nodeContainsMapChooserKeepout)
  );
}

/**
 * A transition or animation can move a keep-out only when it runs on the
 * keep-out itself or on an element containing one. Size changes inside a
 * keep-out reach the resize observer instead.
 */
export function motionEventMovesMapChooserKeepouts(event: Event): boolean {
  return nodeContainsMapChooserKeepout(event.target);
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
  let active = false;

  const chooserIsOpen = () => Boolean(document.querySelector("[data-overlap-chooser]"));

  const scheduleChange = () => {
    if (!active) return;
    if (animationFrame !== null) return;
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = null;
      if (!active) return;
      scan();
      onChange();
    });
  };
  const resizeObserver = new ResizeObserver(scheduleChange);
  const scheduleMotionChange = (event: Event) => {
    if (active && motionEventMovesMapChooserKeepouts(event)) scheduleChange();
  };
  // Scrolling inside a panel or the chooser list leaves every keep-out where
  // it is; only a scroll of the page or of a keep-out's container moves them.
  const scheduleScrollChange = (event: Event) => {
    if (!active) return;
    if (event.target === document || motionEventMovesMapChooserKeepouts(event)) scheduleChange();
  };
  const scan = () => {
    if (!active) return;
    visibleMapChooserKeepouts().forEach((element) => {
      if (observedKeepouts.has(element)) return;
      observedKeepouts.add(element);
      resizeObserver.observe(element);
    });
  };
  // The chooser itself is the only consumer of these measurements. Start a
  // scan when it mounts, then keep its placement current while it is open.
  const attributeObserver = new MutationObserver((records) => {
    if (mutationChangesMapChooserKeepouts(records)) scheduleChange();
  });
  const syncChooser = () => {
    const next = chooserIsOpen();
    if (active === next) return;
    active = next;
    if (active) {
      attributeObserver.observe(document.body, { attributes: true, subtree: true });
      scheduleChange();
    } else {
      attributeObserver.disconnect();
      resizeObserver.disconnect();
      observedKeepouts.clear();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };
  const mutationObserver = new MutationObserver((records) => {
    const chooserChanged = records.some((record) =>
      [...record.addedNodes, ...record.removedNodes].some((node) =>
        node instanceof Element && (node.matches("[data-overlap-chooser]") || node.querySelector("[data-overlap-chooser]")),
      ),
    );
    if (chooserChanged) syncChooser();
    if (active && mutationChangesMapChooserKeepouts(records)) scheduleChange();
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  syncChooser();
  window.addEventListener("resize", scheduleChange);
  window.addEventListener("scroll", scheduleScrollChange, true);
  document.addEventListener("transitionrun", scheduleMotionChange, true);
  document.addEventListener("transitionend", scheduleMotionChange, true);
  document.addEventListener("animationstart", scheduleMotionChange, true);
  document.addEventListener("animationend", scheduleMotionChange, true);
  window.visualViewport?.addEventListener("resize", scheduleChange);
  window.visualViewport?.addEventListener("scroll", scheduleChange);

  return () => {
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    mutationObserver.disconnect();
    attributeObserver.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener("resize", scheduleChange);
    window.removeEventListener("scroll", scheduleScrollChange, true);
    document.removeEventListener("transitionrun", scheduleMotionChange, true);
    document.removeEventListener("transitionend", scheduleMotionChange, true);
    document.removeEventListener("animationstart", scheduleMotionChange, true);
    document.removeEventListener("animationend", scheduleMotionChange, true);
    window.visualViewport?.removeEventListener("resize", scheduleChange);
    window.visualViewport?.removeEventListener("scroll", scheduleChange);
  };
}
