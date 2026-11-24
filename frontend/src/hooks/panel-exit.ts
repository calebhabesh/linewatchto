/** The phone rules in station-detail.css and motion.css apply up to this width. */
export const PHONE_PANEL_MAX_WIDTH = 767;

/** station-detail-exit-mobile and mobile-sheet-slide-down-exit. */
export const PHONE_PANEL_EXIT_MS = 240;

/** station-detail-exit-desktop: a panel outside the sidebar on a wide screen (a phone on its side). */
export const WIDE_PANEL_EXIT_MS = 180;

/** How long a closing panel's exit animation lasts; 0 where none plays. */
export function panelExitMs({ reducedMotion, inDesktopSidebar, phoneWidth }: {
  reducedMotion: boolean;
  inDesktopSidebar: boolean;
  phoneWidth: boolean;
}): number {
  if (reducedMotion || inDesktopSidebar) return 0;
  return phoneWidth ? PHONE_PANEL_EXIT_MS : WIDE_PANEL_EXIT_MS;
}
