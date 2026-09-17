export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const DESKTOP_SIDEBAR_COLLAPSED_KEY = "linewatch-desktop-sidebar-collapsed";

/**
 * Desktop sidebar opens expanded on every fresh page load.
 * Returns false (expanded) regardless of legacy storage.
 */
export function readDesktopSidebarCollapsed(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    // Clean up obsolete durable collapse key if present.
    if (storage.getItem(DESKTOP_SIDEBAR_COLLAPSED_KEY) !== null) {
      storage.removeItem(DESKTOP_SIDEBAR_COLLAPSED_KEY);
    }
  } catch {
    /* Optional cleanup. */
  }
  return false;
}

/**
 * Desktop sidebar collapse state is session-only; durable persistence is retired.
 */
export function saveDesktopSidebarCollapsed(
  _storage: StorageLike | null,
  _collapsed: boolean,
): void {
  void _storage;
  void _collapsed;
  // Session-only; do not persist durable collapse state.
}

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
    case "more":
    case "menu":
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
 * Computes responsive layout using the destination width (380px compact, 560px detailed):
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
 * Reads any left occlusion inside the map viewport caused by an overlaying desktop sidebar.
 * In docked mode or collapsed mode, returns { left: 0 } to prevent double-insets.
 */
export function readDesktopOverlayInsets(viewport: HTMLElement | null): { left: number } {
  if (!viewport || typeof window === "undefined" || window.innerWidth < 768) {
    return { left: 0 };
  }

  const shell = viewport.closest<HTMLElement>(".linewatch-shell");
  if (!shell) return { left: 0 };

  const overlayPanel = shell.querySelector<HTMLElement>(
    ".desktop-sidebar-container--overlay:not(.desktop-sidebar-container--collapsed)",
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
  | "analytics";

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
    case "more":
    case "menu":
    case "notifications":
    case "feedback":
    case "privacy-acknowledgements":
    case "release-notes":
      return "more";
    case "search":
    default:
      return "status";
  }
}
