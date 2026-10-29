/**
 * Where the app update banner sits on phones: just above the pull-up service
 * sheet, following it. When there is no room above the sheet (expanded, or a
 * short screen), it covers the top of the sheet instead, from the alert-type
 * grid down, never over the search bar and shortcuts.
 */
type UpdateBannerPlacement = { top: number; placement: "above-sheet" | "over-sheet" };

export const UPDATE_BANNER_SHEET_GAP = 10;

export function placeUpdateBanner({ sheetTop, gridTop, minTop, bannerHeight }: {
  /** The sheet's visible top edge (or a notice drawn above it), in viewport px. */
  sheetTop: number;
  /** The top of the sheet's alert-type grid, or null when it is not shown. */
  gridTop: number | null;
  /** The lowest edge of the top controls the banner must not cover. */
  minTop: number;
  bannerHeight: number;
}): UpdateBannerPlacement {
  const above = sheetTop - UPDATE_BANNER_SHEET_GAP - bannerHeight;
  if (above >= minTop) return { top: Math.round(above), placement: "above-sheet" };
  return { top: Math.round(Math.max(minTop, gridTop ?? sheetTop)), placement: "over-sheet" };
}
