export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const DESKTOP_SIDEBAR_COLLAPSED_KEY = "linewatch-desktop-sidebar-collapsed";

export const DESKTOP_RAIL_WIDTH = 72;
export const DESKTOP_SIDEBAR_DEFAULT_WIDTH = 380;
export const DESKTOP_SIDEBAR_MIN_WIDTH = 320;
export const DESKTOP_MAP_MIN_WIDTH = 480;

/**
 * The layout budget required to dock the sidebar beside the map:
 * rail (72px) + minimum readable content (320px) + minimum usable map (480px) = 872px.
 */
export const DESKTOP_DOCK_BUDGET =
  DESKTOP_RAIL_WIDTH + DESKTOP_SIDEBAR_MIN_WIDTH + DESKTOP_MAP_MIN_WIDTH;

export type DesktopLayoutMode = "docked" | "overlay" | "mobile";

export type DesktopLayoutMetrics = {
  mode: DesktopLayoutMode;
  sidebarWidth: number;
  minMapWidth: number;
  dockBudget: number;
  railWidth: number;
};

/**
 * Reads the durable desktop sidebar collapse preference.
 * Defaults to false (expanded) on first visit or if storage is unavailable.
 */
export function readDesktopSidebarCollapsed(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(DESKTOP_SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Saves an explicit desktop sidebar collapse preference.
 */
export function saveDesktopSidebarCollapsed(
  storage: StorageLike | null,
  collapsed: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(DESKTOP_SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    /* Optional preference. */
  }
}

/**
 * Computes the responsive desktop layout metrics given window width and mobile status.
 */
export function computeDesktopLayoutMetrics({
  windowWidth,
  isMobile,
}: {
  windowWidth: number;
  isMobile: boolean;
}): DesktopLayoutMetrics {
  if (isMobile || windowWidth < 768) {
    return {
      mode: "mobile",
      sidebarWidth: 0,
      minMapWidth: 0,
      dockBudget: DESKTOP_DOCK_BUDGET,
      railWidth: 0,
    };
  }

  if (windowWidth >= DESKTOP_DOCK_BUDGET) {
    // Docked mode: scale content width between min (320) and default (380)
    // based on remaining space after reserving rail and min map width.
    const availableForSidebar = windowWidth - DESKTOP_RAIL_WIDTH - DESKTOP_MAP_MIN_WIDTH;
    const sidebarWidth = Math.min(
      DESKTOP_SIDEBAR_DEFAULT_WIDTH,
      Math.max(DESKTOP_SIDEBAR_MIN_WIDTH, Math.round(availableForSidebar)),
    );

    return {
      mode: "docked",
      sidebarWidth,
      minMapWidth: DESKTOP_MAP_MIN_WIDTH,
      dockBudget: DESKTOP_DOCK_BUDGET,
      railWidth: DESKTOP_RAIL_WIDTH,
    };
  }

  // Narrow desktop: overlay mode with minimum content width
  return {
    mode: "overlay",
    sidebarWidth: DESKTOP_SIDEBAR_MIN_WIDTH,
    minMapWidth: DESKTOP_MAP_MIN_WIDTH,
    dockBudget: DESKTOP_DOCK_BUDGET,
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

export type DesktopRailDestination = "status" | "search" | "saved" | "more";

export function desktopRailDestinationForView(view: string): DesktopRailDestination {
  switch (view) {
    case "status":
    case "alerts":
    case "delays":
    case "reduced-speed-zones":
    case "closures":
    case "line-impacts":
    case "accessibility-outages":
    case "surface-notices":
    case "announcements":
      return "status";
    case "search":
      return "search";
    case "saved":
    case "commutes":
    case "my-stations":
      return "saved";
    case "more":
    case "menu":
    case "notifications":
    case "analytics":
    case "alert-history":
    case "feedback":
    case "privacy-acknowledgements":
    case "release-notes":
      return "more";
    default:
      return "status";
  }
}
