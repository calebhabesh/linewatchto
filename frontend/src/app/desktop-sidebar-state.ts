export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const DESKTOP_SIDEBAR_COLLAPSED_KEY = "linewatch-desktop-sidebar-collapsed";

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

export const DESKTOP_RAIL_WIDTH = 80;
export const DESKTOP_MAP_MIN_WIDTH = 480;
export const DESKTOP_OVERLAY_MIN_MAP_EXPOSED = 160;

export type DesktopSidebarProfile = "compact" | "medium" | "wide";

export const DESKTOP_PROFILE_WIDTHS: Record<DesktopSidebarProfile, number> = {
  compact: 380,
  medium: 560,
  wide: 680,
};

/**
 * Concrete dock layout thresholds for available window width W:
 * rail (80px) + profile target (P) + minimum map width (480px)
 * - Compact: 80 + 380 + 480 = 940px
 * - Medium:  80 + 560 + 480 = 1120px
 * - Wide:    80 + 680 + 480 = 1240px
 */
export const DESKTOP_PROFILE_DOCK_BUDGETS: Record<DesktopSidebarProfile, number> = {
  compact: DESKTOP_RAIL_WIDTH + DESKTOP_PROFILE_WIDTHS.compact + DESKTOP_MAP_MIN_WIDTH, // 940
  medium: DESKTOP_RAIL_WIDTH + DESKTOP_PROFILE_WIDTHS.medium + DESKTOP_MAP_MIN_WIDTH,   // 1120
  wide: DESKTOP_RAIL_WIDTH + DESKTOP_PROFILE_WIDTHS.wide + DESKTOP_MAP_MIN_WIDTH,       // 1240
};

export const DESKTOP_SIDEBAR_DEFAULT_WIDTH = DESKTOP_PROFILE_WIDTHS.compact;
export const DESKTOP_SIDEBAR_MIN_WIDTH = 320;

/** Backwards-compatibility alias for compact dock budget */
export const DESKTOP_DOCK_BUDGET = DESKTOP_PROFILE_DOCK_BUDGETS.compact;

export type DesktopLayoutMode = "docked" | "overlay" | "mobile";

export type DesktopLayoutMetrics = {
  mode: DesktopLayoutMode;
  sidebarWidth: number;
  minMapWidth: number;
  dockBudget: number;
  railWidth: number;
  profile: DesktopSidebarProfile;
};

export type DesktopDestinationContext = {
  activeView: string;
  selectedStationId?: string | null;
  commutesTab?: "saved" | "create" | null;
};

/**
 * Explicitly resolves the target profile for any reachable desktop destination.
 * Sizing is governed by named content profiles, never by counts or polling data:
 * - Compact (380px): Status, More
 * - Medium (560px): Search, Station detail, substantive forms
 * - Wide (680px): Stations collection, My Commutes (collection and editor), rich impact collections, Alert History
 */
export function resolveDesktopDestinationProfile(
  context: DesktopDestinationContext | string,
): DesktopSidebarProfile {
  const activeView = typeof context === "string" ? context : context.activeView;
  const selectedStationId = typeof context === "string" ? null : context.selectedStationId;

  // Station detail takes precedence -> Medium (560px)
  if (selectedStationId) {
    return "medium";
  }

  // Both collection and create/edit flow for My Commutes -> Wide (680px)
  if (activeView === "commutes") {
    return "wide";
  }

  switch (activeView) {
    // Rich impact collections/details, line impacts, reliability/analytics, Stations collection -> Wide (680px)
    case "alerts":
    case "delays":
    case "reduced-speed-zones":
    case "closures":
    case "line-impacts":
    case "accessibility-outages":
    case "surface-notices":
    case "announcements":
    case "analytics":
    case "alert-history":
    case "my-stations":
      return "wide";

    // Search and substantive forms & documents -> Medium (560px)
    case "search":
    case "notifications":
    case "feedback":
    case "privacy-acknowledgements":
    case "release-notes":
      return "medium";

    // Status, More, Saved root alias -> Compact (380px)
    case "status":
    case "more":
    case "menu":
    case "saved":
    case "map":
    default:
      return "compact";
  }
}

/**
 * Computes responsive desktop layout metrics for a given window width, mobile flag, and profile:
 * 1. Mobile or width < 768px: mode = "mobile", sidebarWidth = 0.
 * 2. Docked when W >= R (72px) + P + 480px: sidebarWidth = P; map receives remaining layout width.
 * 3. Overlay otherwise beside rail: sidebarWidth = min(P, W - R - 160px), leaving >= 160px exposed map.
 */
export function computeDesktopLayoutMetrics({
  windowWidth,
  isMobile,
  profile = "compact",
}: {
  windowWidth: number;
  isMobile: boolean;
  profile?: DesktopSidebarProfile;
}): DesktopLayoutMetrics {
  const dockBudget = DESKTOP_PROFILE_DOCK_BUDGETS[profile];
  const targetWidth = DESKTOP_PROFILE_WIDTHS[profile];

  if (isMobile || windowWidth < 768) {
    return {
      mode: "mobile",
      sidebarWidth: 0,
      minMapWidth: 0,
      dockBudget,
      railWidth: 0,
      profile,
    };
  }

  if (windowWidth >= dockBudget) {
    // Docked mode: sidebar width is fixed P; map receives remaining layout width
    return {
      mode: "docked",
      sidebarWidth: targetWidth,
      minMapWidth: DESKTOP_MAP_MIN_WIDTH,
      dockBudget,
      railWidth: DESKTOP_RAIL_WIDTH,
      profile,
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
    profile,
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

export type DesktopRailDestination = "status" | "search" | "stations" | "commutes" | "alert-history" | "more";

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
    case "my-stations":
    case "saved":
      return "stations";
    case "commutes":
      return "commutes";
    case "alert-history":
      return "alert-history";
    case "more":
    case "menu":
    case "notifications":
    case "analytics":
    case "feedback":
    case "privacy-acknowledgements":
    case "release-notes":
      return "more";
    default:
      return "status";
  }
}
