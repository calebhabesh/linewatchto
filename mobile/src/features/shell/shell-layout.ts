/**
 * Layout constants for the LineWatchTO persistent operations shell
 * and floating sheets family.
 */
export const SHELL_LAYOUT = {
  /** Outer screen inset for floating operations sheets (8dp) */
  sheetHorizontalInset: 8,
  /** Outer screen horizontal inset for floating navigation pill (16dp) */
  navBarHorizontalInset: 16,
  /** Corner radius for operations sheets (8dp) */
  sheetCornerRadius: 8,
  /** Perimeter border width for operations sheets (1dp) */
  sheetBorderWidth: 1,
  /** Maximum usable height percentage for primary sheets (~78%) */
  primarySheetMaxHeightPercent: 0.78,
  /** Initial height percentage for station/impact detail sheets (~64%) */
  detailSheetInitialHeightPercent: 0.64,
  /** Maximum height percentage for near-tall tool sheets (~88%) */
  toolSheetMaxHeightPercent: 0.88,
  /** Bottom navigation clearance in points */
  bottomNavClearance: 84,
  /** Visual height of the floating navigation pill (72dp) */
  navBarHeight: 72,
} as const;

/**
 * Strict z-index hierarchy across the persistent shell layers.
 * Contract: map → map overlays → chrome → status/selection peek → sheets → bottomNav → modal → system UI
 */
export const SHELL_Z_INDEX = {
  /** Layer 0: Underlying Schematic Map Canvas */
  map: 0,
  /** Layer 1: Schematic SVG Overlays (impact lines, rings, train markers) */
  mapOverlays: 10,
  /** Layer 2: Top Chrome (network switcher, theme, reload, train toggle) & Line Rail */
  chrome: 20,
  /** Layer 3: Map Status Peek & Selected Impact Peek (visible on Map tab) */
  statusPeek: 30,
  /** Layer 4: Primary & Tool Floating Operations Sheets (PWA .floating-panel-shell z-index: 44) */
  sheets: 40,
  /** Layer 5: Floating Bottom Navigation Capsule (PWA .mobile-bottom-nav z-index: 45) */
  bottomNav: 45,
  /** Layer 6: Modals (Auth, Commute Edit/Create, Destructive Confirmations) */
  modal: 60,
  /** Layer 7: System UI / Top-level Toasts / Safe Area */
  systemUi: 70,
} as const;

/**
 * Android elevation contract aligning with SHELL_Z_INDEX.
 */
export const SHELL_ELEVATION = {
  map: 0,
  mapOverlays: 2,
  chrome: 6,
  statusPeek: 12,
  sheets: 18,
  bottomNav: 20,
  modal: 24,
  systemUi: 30,
} as const;
