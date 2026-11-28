export const DESKTOP_RAIL_WIDTH = 80;
export const DESKTOP_MAP_MIN_WIDTH = 480;
export const DESKTOP_OVERLAY_MIN_MAP_EXPOSED = 160;
export const DESKTOP_SIDEBAR_TARGET_WIDTH = 560;
export const DESKTOP_SIDEBAR_DEFAULT_WIDTH = DESKTOP_SIDEBAR_TARGET_WIDTH;
export const DESKTOP_SIDEBAR_MIN_WIDTH = 320;

/**
 * Concrete dock layout threshold for available window width W:
 * rail (80px) + sidebar target (560px) + minimum map width (480px) = 1120px
 */
export const DESKTOP_DOCK_BUDGET =
  DESKTOP_RAIL_WIDTH + DESKTOP_SIDEBAR_TARGET_WIDTH + DESKTOP_MAP_MIN_WIDTH;

/** Compact overview/settings pages need less space than searchable collections. */
export function desktopSidebarWidthForView(activeView: string, selectedStationId?: string | null): number {
  if (selectedStationId) return DESKTOP_SIDEBAR_TARGET_WIDTH;
  switch (activeView) {
    case "status":
    case "map":
      return 420;
    case "more":
      return 380;
    default:
      return DESKTOP_SIDEBAR_TARGET_WIDTH;
  }
}

export type DesktopLayoutMode = "docked" | "overlay" | "mobile";

export type DesktopLayoutMetrics = {
  mode: DesktopLayoutMode;
  sidebarWidth: number;
  minMapWidth: number;
  dockBudget: number;
  railWidth: number;
};

/**
 * Computes responsive layout using the destination width (420px Status, 380px menu, 560px detailed):
 * 1. Mobile or width < 768px: mode = "mobile", sidebarWidth = 0.
 * 2. Dock when rail + destination width + 480px of map fit.
 * 3. Otherwise cap the destination width to leave >= 160px of exposed map.
 */
export function computeDesktopLayoutMetrics({
  windowWidth,
  isMobile,
  activeView,
  selectedStationId,
}: {
  windowWidth: number;
  isMobile: boolean;
  activeView?: string;
  selectedStationId?: string | null;
}): DesktopLayoutMetrics {
  const targetWidth = activeView === undefined
    ? DESKTOP_SIDEBAR_TARGET_WIDTH
    : desktopSidebarWidthForView(activeView, selectedStationId);
  const dockBudget = DESKTOP_RAIL_WIDTH + targetWidth + DESKTOP_MAP_MIN_WIDTH;

  if (isMobile || windowWidth < 768) {
    return {
      mode: "mobile",
      sidebarWidth: 0,
      minMapWidth: 0,
      dockBudget,
      railWidth: 0,
    };
  }

  if (windowWidth >= dockBudget) {
    // Docked mode: sidebar width follows the destination; map receives remaining layout width
    return {
      mode: "docked",
      sidebarWidth: targetWidth,
      minMapWidth: DESKTOP_MAP_MIN_WIDTH,
      dockBudget,
      railWidth: DESKTOP_RAIL_WIDTH,
    };
  }

  // Overlay mode: overlay beside the rail, leaving at least 160px of map exposed
  const maxOverlayWidth = Math.max(0, windowWidth - DESKTOP_RAIL_WIDTH - DESKTOP_OVERLAY_MIN_MAP_EXPOSED);
  const sidebarWidth = Math.min(targetWidth, maxOverlayWidth);

  return {
    mode: "overlay",
    sidebarWidth,
    minMapWidth: DESKTOP_MAP_MIN_WIDTH,
    dockBudget,
    railWidth: DESKTOP_RAIL_WIDTH,
  };
}

/**
 * Reads the left occlusion inside the map viewport caused by the open desktop sidebar.
 * The sidebar overlays the map viewport, which keeps a stable size; collapsed mode has no inset.
 */
export function readDesktopOverlayInsets(viewport: HTMLElement | null): { left: number } {
  if (!viewport || typeof window === "undefined" || window.innerWidth < 768) {
    return { left: 0 };
  }

  const shell = viewport.closest<HTMLElement>(".linewatch-shell");
  if (!shell) return { left: 0 };

  const overlayPanel = shell.querySelector<HTMLElement>(
    ".desktop-sidebar-container:not(.desktop-sidebar-container--collapsed)",
  );
  if (!overlayPanel || overlayPanel.getAttribute("aria-hidden") === "true") {
    return { left: 0 };
  }

  const viewportRect = viewport.getBoundingClientRect();
  const rect = overlayPanel.getBoundingClientRect();
  if (rect.width > 0 && rect.right > viewportRect.left) {
    return { left: Math.max(0, Math.round(rect.right - viewportRect.left)) };
  }

  return { left: 0 };
}

/**
 * Reads the combined left occlusion caused by the desktop sidebar or floating panels, constrained to leave at least a minimum visible map width.
 */
export function readDesktopLeftOcclusion(
  viewport: HTMLElement | null,
  focusPadding = 24,
): number {
  if (!viewport || typeof window === "undefined" || window.innerWidth < 768) {
    return 0;
  }

  const viewportRect = viewport.getBoundingClientRect();
  if (viewportRect.width <= 0) return 0;

  const desktopOverlay = readDesktopOverlayInsets(viewport);
  const shell = viewport.closest<HTMLElement>(".linewatch-shell");
  const overlayRightEdges = [
    desktopOverlay.left > 0 ? viewportRect.left + desktopOverlay.left : null,
    shell?.querySelector<HTMLElement>(".floating-panel-shell"),
  ].flatMap((element) => {
    if (typeof element === "number") return [element];
    if (!element || element.getAttribute("aria-hidden") === "true") return [];
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? [rect.right] : [];
  });

  if (overlayRightEdges.length === 0) return 0;

  const overlayRight = Math.max(...overlayRightEdges);
  const minimumVisibleWidth = Math.min(320, viewportRect.width * 0.4);
  return Math.min(
    Math.max(overlayRight - viewportRect.left + focusPadding, 0),
    Math.max(viewportRect.width - minimumVisibleWidth, 0),
  );
}

function visibleRect(element: Element | null | undefined): DOMRect | null {
  if (!element || element.getAttribute("aria-hidden") === "true") return null;
  if (window.getComputedStyle(element).display === "none") return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

/**
 * Where an open sidebar's right edge comes to rest (viewport x), or null when it is closed. The
 * sidebar opens, closes and changes width with 160ms transitions (max-width, width, transform), so
 * its drawn box is mid-animation; the toolbar is placed once against where the sidebar lands
 * instead of chasing its edge frame by frame.
 */
export function restingSidebarRight(sidebar: HTMLElement | null | undefined): number | null {
  if (!sidebar || sidebar.classList.contains("desktop-sidebar-container--collapsed")) return null;
  if (sidebar.getAttribute("aria-hidden") === "true") return null;
  const style = window.getComputedStyle(sidebar);
  if (style.display === "none") return null;
  const rect = sidebar.getBoundingClientRect();
  const slide = style.transform !== "none" && typeof DOMMatrixReadOnly === "function"
    ? new DOMMatrixReadOnly(style.transform).m41
    : 0;
  const width = Number.parseFloat(sidebar.style.getPropertyValue("--desktop-sidebar-width"));
  return rect.left - slide + (Number.isFinite(width) && width > 0 ? width : rect.width);
}

/** The sidebar's open, close and resize curve; the toolbar moves on it. */
const DESKTOP_RAIL_GLIDE: KeyframeAnimationOptions = {
  duration: 160,
  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
};

export type DesktopControlRailPlacement = { left: number; top: number };

/**
 * Places the desktop map toolbar, in its container's coordinates. Beside an open sidebar it sits
 * midway between the sidebar and the right-hand buttons, so the gaps either side match at every
 * window size; centering it over the whole map instead left it 60px nearer the sidebar, pinned
 * against it on laptop-sized windows. With the sidebar collapsed nothing is on its left, so it is
 * centered over the whole map and moves only to clear the right-hand buttons. When the gap is too
 * narrow (tiled and half-screen windows) it tucks under the right-hand buttons on a second row,
 * right edges aligned, so the two stack as one group in the corner; centered under the map they
 * sat on a diagonal. It never moves left past the sidebar's edge.
 */
export function placeDesktopControlRail({
  containerWidth,
  workspaceLeft,
  railWidth,
  rightControls,
  margin = 16,
  top = 20,
}: {
  containerWidth: number;
  workspaceLeft: number;
  railWidth: number;
  rightControls: { left: number; right?: number; bottom: number } | null;
  margin?: number;
  top?: number;
}): DesktopControlRailPlacement {
  const rightEdge = rightControls?.left ?? containerWidth;
  const lowestLeft = workspaceLeft > 0 ? workspaceLeft + margin : margin;
  const highestLeft = rightEdge - margin - railWidth;
  if (highestLeft >= lowestLeft) {
    const preferred = workspaceLeft > 0
      ? (workspaceLeft + rightEdge - railWidth) / 2
      : (containerWidth - railWidth) / 2;
    return { left: Math.round(Math.min(Math.max(preferred, lowestLeft), highestLeft)), top };
  }

  const rowRight = rightControls?.right ?? containerWidth - margin;
  return {
    left: Math.round(Math.max(lowestLeft, rowRight - railWidth)),
    top: Math.round((rightControls?.bottom ?? top) + 12),
  };
}

/** Whether a placed toolbar ends inside its container's right margin. */
export function desktopControlRailFits({
  containerWidth,
  left,
  railWidth,
  margin = 16,
}: {
  containerWidth: number;
  left: number;
  railWidth: number;
  margin?: number;
}): boolean {
  return left + railWidth <= containerWidth - margin + 1;
}

/** Keeps a map's desktop toolbar placed by `placeDesktopControlRail` as the layout changes. */
/** The placement pass of every observed control rail, so a panel about to unfold can settle the layout first. */
const activeRailPlacements = new Set<() => void>();

/**
 * Runs every control rail's placement now (not on the next frame). The
 * right-hand Train Markers panel calls it before measuring its open width:
 * whether the buttons beside it drop their captions depends on the panel
 * itself, so a width measured first would unfold too wide and then snap.
 */
export function settleDesktopControlRails(): void {
  for (const place of activeRailPlacements) place();
}

let railRegistrationWaiters: Array<() => void> = [];
let lastRailRegisteredAt = -Infinity;

/**
 * Resolves when the next control rail starts being placed (a map view's
 * toolbar mounting), or after `timeoutMs`. The Train Markers panel waits for
 * it when it returns with the System Map, whose toolbar decides whether the
 * buttons beside the panel drop their captions.
 */
export function nextDesktopControlRail(timeoutMs = 700): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // A toolbar that mounted in the same update (just before this was asked) counts.
  if (performance.now() - lastRailRegisteredAt < 100) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      railRegistrationWaiters = railRegistrationWaiters.filter((waiter) => waiter !== done);
      resolve();
    };
    railRegistrationWaiters.push(done);
    window.setTimeout(done, timeoutMs);
  });
}

export function observeDesktopControlRail(rail: HTMLElement | null): () => void {
  if (!rail || typeof window === "undefined") return () => {};
  const container = rail.offsetParent instanceof HTMLElement ? rail.offsetParent : rail.parentElement;
  if (!container) return () => {};
  const shell = rail.closest<HTMLElement>(".linewatch-shell");
  // The map workspace learns the toolbar's centre, so the preview chip lines up under it.
  const workspace = rail.closest<HTMLElement>(".desktop-map-workspace");
  let frame: number | null = null;
  // The last placement written, the container width it was made for, and the move in flight.
  let placed: DesktopControlRailPlacement | null = null;
  let placedForWidth = 0;
  let glide: Animation | null = null;
  const stopGlide = () => {
    glide?.cancel();
    glide = null;
  };

  const place = () => {
    frame = null;
    if (window.innerWidth < 768) {
      for (const name of ["--desktop-rail-left", "--desktop-rail-top", "--desktop-rail-translate"]) {
        rail.style.removeProperty(name);
      }
      delete rail.dataset.compact;
      delete rail.dataset.hideNetwork;
      stopGlide();
      placed = null;
      const cluster = shell?.querySelector<HTMLElement>(".map-utility-cluster");
      if (cluster) delete cluster.dataset.compact;
      workspace?.style.removeProperty("--desktop-rail-center");
      return;
    }
    // Where the toolbar is drawn now, part-way through a move or not.
    const drawnLeft = rail.getBoundingClientRect().left;
    const containerRect = container.getBoundingClientRect();
    const sidebarRight = restingSidebarRight(shell?.querySelector<HTMLElement>(".desktop-sidebar-container"));
    const clusterElement = shell?.querySelector<HTMLElement>(".map-utility-cluster") ?? null;
    const workspaceLeft = sidebarRight === null ? 0 : Math.max(0, sidebarRight - containerRect.left);
    const placeWith = (railWidth: number) => {
      const cluster = visibleRect(clusterElement);
      return placeDesktopControlRail({
        containerWidth: containerRect.width,
        workspaceLeft,
        railWidth,
        rightControls: cluster
          ? {
            left: cluster.left - containerRect.left,
            right: cluster.right - containerRect.left,
            bottom: cluster.bottom - containerRect.top,
          }
          : null,
      });
    };
    const setCompact = (element: HTMLElement | null, compact: boolean) => {
      if (!element || (element.dataset.compact === "true") === compact) return;
      if (compact) element.dataset.compact = "true";
      else delete element.dataset.compact;
    };

    // Keep the toolbar on the top row by dropping, in order, its zoom slider and captions,
    // then the right-hand buttons' captions; only then move it to a second row. Each pass
    // starts from the full layout, so the result settles on the same state every time.
    // While a right-hand panel folds or unfolds (useCollapseWidth), the buttons keep
    // their captions state: the width it animates to was measured in that state.
    const clusterHeld = Boolean(clusterElement?.querySelector('[data-collapsing="true"]'));
    if (!clusterHeld) setCompact(clusterElement, false);
    setCompact(rail, false);
    delete rail.dataset.hideNetwork;
    let placement = placeWith(rail.offsetWidth);
    if (placement.top !== 20) {
      setCompact(rail, true);
      placement = placeWith(rail.offsetWidth);
    }
    if (placement.top !== 20 && !clusterHeld) {
      setCompact(clusterElement, true);
      placement = placeWith(rail.offsetWidth);
    }
    // Beside a floating sidebar on a narrow window even the second row can be
    // too short. The sidebar has its own network switch, so drop the toolbar's.
    if (sidebarRight !== null && !desktopControlRailFits({
      containerWidth: containerRect.width, left: placement.left, railWidth: rail.offsetWidth,
    })) {
      rail.dataset.hideNetwork = "true";
      placement = placeWith(rail.offsetWidth);
    }
    rail.style.setProperty("--desktop-rail-left", `${placement.left}px`);
    rail.style.setProperty("--desktop-rail-top", `${placement.top}px`);
    rail.style.setProperty("--desktop-rail-translate", "0 0");
    if (workspace) {
      const center = containerRect.left + placement.left + rail.offsetWidth / 2 - workspace.getBoundingClientRect().left;
      workspace.style.setProperty("--desktop-rail-center", `${Math.round(center)}px`);
    }
    // A new place glides there from where the toolbar is drawn, with a transform animation the
    // compositor runs, so a busy main thread (the sidebar rendering) can't drop its frames. It
    // starts once per change: an unchanged placement leaves a move in flight alone. The first
    // placement, a window resize, a change of row, the right-hand buttons folding or unfolding
    // (followed frame by frame) and reduced motion all land at once.
    const previous = placed;
    const resized = containerRect.width !== placedForWidth;
    placed = placement;
    placedForWidth = containerRect.width;
    if (!previous || (previous.left === placement.left && previous.top === placement.top)) return;
    stopGlide();
    const reducedMotion = shell?.classList.contains("motion-paused")
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (resized || clusterHeld || reducedMotion || previous.top !== placement.top) return;
    const offset = drawnLeft - rail.getBoundingClientRect().left;
    if (Math.abs(offset) < 0.5) return;
    glide = rail.animate(
      [{ transform: `translateX(${offset}px)` }, { transform: "translateX(0)" }],
      DESKTOP_RAIL_GLIDE,
    );
  };
  const schedule = () => {
    if (frame === null) frame = window.requestAnimationFrame(place);
  };

  place();
  activeRailPlacements.add(place);
  lastRailRegisteredAt = performance.now();
  const waiters = railRegistrationWaiters;
  railRegistrationWaiters = [];
  waiters.forEach((resolve) => resolve());
  const resizeObserver = new ResizeObserver(schedule);
  const classObserver = new MutationObserver(schedule);
  resizeObserver.observe(container);
  resizeObserver.observe(rail);
  for (const selector of [".desktop-sidebar-container", ".map-utility-cluster"]) {
    const element = shell?.querySelector<HTMLElement>(selector);
    if (!element) continue;
    resizeObserver.observe(element);
    classObserver.observe(element, { attributes: true, attributeFilter: ["class", "aria-hidden", "style"] });
  }
  window.addEventListener("resize", schedule);
  return () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    stopGlide();
    activeRailPlacements.delete(place);
    resizeObserver.disconnect();
    classObserver.disconnect();
    window.removeEventListener("resize", schedule);
    workspace?.style.removeProperty("--desktop-rail-center");
  };
}

export type DesktopMapInsets = {
  top: number;
  bottom: number;
};

/**
 * Measures the top and bottom insets inside the desktop map workspace
 * caused by the top map control rail and bottom status chips / legend.
 */
export function measureDesktopMapInsets(
  container: HTMLElement | null,
  rail?: HTMLElement | null,
): DesktopMapInsets {
  if (!container || typeof window === "undefined" || window.innerWidth < 768) {
    return { top: 0, bottom: 0 };
  }

  const containerRect = container.getClientRects().length > 0
    ? container.getBoundingClientRect()
    : container.closest<HTMLElement>(".network-map-transition-surface")?.getBoundingClientRect() ?? { width: 0, height: 0, top: 0, bottom: 0 };

  if (containerRect.width <= 0 || containerRect.height <= 0) {
    return { top: 0, bottom: 0 };
  }

  const shell = container.closest<HTMLElement>(".linewatch-shell");
  const effectiveRail = rail ?? shell?.querySelector<HTMLElement>(".desktop-map-control-rail") ?? null;
  let top = 0;
  if (effectiveRail && window.getComputedStyle(effectiveRail).display !== "none") {
    const railRect = effectiveRail.getBoundingClientRect();
    if (railRect.width > 0 && railRect.height > 0) {
      // The TTC Map View's layer switches hang under the toolbar as its second deck.
      const deck = effectiveRail.querySelector<HTMLElement>(".map-view-layers-row")?.getBoundingClientRect();
      const railBottom = deck && deck.height > 0 ? Math.max(railRect.bottom, deck.bottom) : railRect.bottom;
      top = Math.min(containerRect.height, Math.max(0, Math.round(railBottom - containerRect.top)));
    }
  }

  const legend = shell?.querySelector<HTMLElement>(".desktop-map-legend")
    ?? (typeof document !== "undefined" ? document.querySelector<HTMLElement>(".desktop-map-legend") : null);

  let bottom = 0;
  if (legend && window.getComputedStyle(legend).display !== "none") {
    const legendRect = legend.getBoundingClientRect();
    if (legendRect.width > 0 && legendRect.height > 0) {
      bottom = Math.max(bottom, Math.round(containerRect.bottom - legendRect.top));
    }
  }

  bottom = Math.min(Math.max(0, containerRect.height - top), Math.max(0, bottom));

  return { top, bottom };
}

export type DesktopRailDestination =
  | "status"
  | "alerts"
  | "delays"
  | "reduced-speed-zones"
  | "closures"
  | "trip-changes"
  | "accessibility-outages"
  | "surface-notices"
  | "announcements"
  | "stations"
  | "commutes"
  | "alert-history"
  | "more"
  | "source-status"
  | "analytics"
  | "feedback";

export function desktopRailDestinationForView(view: string): DesktopRailDestination {
  switch (view) {
    case "status":
      return "status";
    case "alerts":
      return "alerts";
    case "delays":
      return "delays";
    case "reduced-speed-zones":
      return "reduced-speed-zones";
    case "closures":
      return "closures";
    case "trip-changes":
      return "trip-changes";
    case "accessibility-outages":
      return "accessibility-outages";
    case "surface-notices":
      return "surface-notices";
    case "announcements":
      return "announcements";
    case "line-impacts":
      return "status";
    case "my-stations":
    case "saved":
      return "stations";
    case "commutes":
      return "commutes";
    case "alert-history":
      return "alert-history";
    case "source-status":
      return "source-status";
    case "analytics":
      return "analytics";
    case "feedback":
      return "feedback";
    case "more":
    case "notifications":
    case "privacy-acknowledgements":
    case "release-notes":
      return "more";
    case "search":
    default:
      return "status";
  }
}
