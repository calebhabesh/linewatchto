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

export type DesktopControlRailPlacement = { left: number; top: number };

/**
 * Places the desktop map toolbar, in its container's coordinates. It stays centered over the
 * whole map, as designed, and moves only to stay clear of an open sidebar on its left and the
 * right-hand buttons; when the gap between them is too narrow it sits on a second row.
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
  rightControls: { left: number; bottom: number } | null;
  margin?: number;
  top?: number;
}): DesktopControlRailPlacement {
  const centered = (containerWidth - railWidth) / 2;
  const lowestLeft = workspaceLeft > 0 ? workspaceLeft + margin : margin;
  const highestLeft = (rightControls?.left ?? containerWidth) - margin - railWidth;
  if (highestLeft >= lowestLeft) {
    return { left: Math.round(Math.min(Math.max(centered, lowestLeft), highestLeft)), top };
  }

  const rowCenter = workspaceLeft + (containerWidth - workspaceLeft - railWidth) / 2;
  const rowHighest = Math.max(lowestLeft, containerWidth - margin - railWidth);
  return {
    left: Math.round(Math.min(Math.max(rowCenter, lowestLeft), rowHighest)),
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
export function observeDesktopControlRail(rail: HTMLElement | null): () => void {
  if (!rail || typeof window === "undefined") return () => {};
  const container = rail.offsetParent instanceof HTMLElement ? rail.offsetParent : rail.parentElement;
  if (!container) return () => {};
  const shell = rail.closest<HTMLElement>(".linewatch-shell");
  let frame: number | null = null;

  const place = () => {
    frame = null;
    if (window.innerWidth < 768) {
      for (const name of ["--desktop-rail-left", "--desktop-rail-top", "--desktop-rail-translate"]) {
        rail.style.removeProperty(name);
      }
      delete rail.dataset.compact;
      delete rail.dataset.hideNetwork;
      const cluster = shell?.querySelector<HTMLElement>(".map-utility-cluster");
      if (cluster) delete cluster.dataset.compact;
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const sidebar = visibleRect(shell?.querySelector(
      ".desktop-sidebar-container:not(.desktop-sidebar-container--collapsed)",
    ));
    const clusterElement = shell?.querySelector<HTMLElement>(".map-utility-cluster") ?? null;
    const workspaceLeft = sidebar ? Math.max(0, sidebar.right - containerRect.left) : 0;
    const placeWith = (railWidth: number) => {
      const cluster = visibleRect(clusterElement);
      return placeDesktopControlRail({
        containerWidth: containerRect.width,
        workspaceLeft,
        railWidth,
        rightControls: cluster
          ? { left: cluster.left - containerRect.left, bottom: cluster.bottom - containerRect.top }
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
    setCompact(clusterElement, false);
    setCompact(rail, false);
    delete rail.dataset.hideNetwork;
    let placement = placeWith(rail.offsetWidth);
    if (placement.top !== 20) {
      setCompact(rail, true);
      placement = placeWith(rail.offsetWidth);
    }
    if (placement.top !== 20) {
      setCompact(clusterElement, true);
      placement = placeWith(rail.offsetWidth);
    }
    // Beside a floating sidebar on a narrow window even the second row can be
    // too short. The sidebar has its own network switch, so drop the toolbar's.
    if (sidebar && !desktopControlRailFits({
      containerWidth: containerRect.width, left: placement.left, railWidth: rail.offsetWidth,
    })) {
      rail.dataset.hideNetwork = "true";
      placement = placeWith(rail.offsetWidth);
    }
    rail.style.setProperty("--desktop-rail-left", `${placement.left}px`);
    rail.style.setProperty("--desktop-rail-top", `${placement.top}px`);
    rail.style.setProperty("--desktop-rail-translate", "0 0");
  };
  const schedule = () => {
    if (frame === null) frame = window.requestAnimationFrame(place);
  };

  place();
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
    resizeObserver.disconnect();
    classObserver.disconnect();
    window.removeEventListener("resize", schedule);
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
      top = Math.min(containerRect.height, Math.max(0, Math.round(railRect.bottom - containerRect.top)));
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
