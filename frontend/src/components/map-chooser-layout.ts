/** Screen-space sizing and candidate geometry shared by authored map alert pickers. */
export const OVERLAP_CHOOSER_WIDTH = 420;
export const OVERLAP_CHOOSER_MOBILE_BREAKPOINT = 640;
export const OVERLAP_CHOOSER_MOBILE_WIDTH = 320;

export function overlapChooserSize(impactCount: number, viewportWidth = OVERLAP_CHOOSER_WIDTH + 32) {
  const isMobile = viewportWidth <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT;
  const maximumWidth = isMobile ? OVERLAP_CHOOSER_MOBILE_WIDTH : OVERLAP_CHOOSER_WIDTH;
  // Leave breathing room around phone controls, even before collision placement.
  const availableWidth = Math.max(0, viewportWidth - 32);
  return {
    width: Math.min(availableWidth, Math.max(240, Math.min(maximumWidth, viewportWidth - (isMobile ? 64 : 32)))),
    height: isMobile ? Math.min(380, 56 + impactCount * 64) : Math.min(440, 68 + impactCount * 88),
  };
}

const STREETCAR_CARD_WIDTH = 300;

/**
 * The Map View streetcar card's size (GeographicStreetcarCard): padding and header, each route row (taller with its
 * replacement-bus note, which wraps on phones), the nearest-stop button when there is one, and the schedule note.
 */
export function streetcarCardSize(
  rows: readonly { replacementBuses: boolean }[],
  viewportWidth: number,
  withStop = false,
) {
  const width = Math.max(220, Math.min(STREETCAR_CARD_WIDTH, viewportWidth - 32));
  const compact = viewportWidth <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT;
  const rowHeights = rows.reduce((sum, row) => sum + (row.replacementBuses ? (compact ? 76 : 62) : 44) + 4, 0);
  const stopHeight = withStop ? 56 : 0;
  return { width, height: Math.min(420, 24 + 46 + rowHeights + stopHeight + (compact ? 54 : 46)) };
}

export function chooserWidthCandidates(requestedWidth: number, viewportWidth: number): number[] {
  const width = Math.min(requestedWidth, Math.max(0, viewportWidth - 32));
  const minimumWidth = Math.min(width, 240);
  const widths = [width];
  if (viewportWidth <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT) {
    for (let candidate = width - 8; candidate > minimumWidth; candidate -= 8) widths.push(candidate);
    widths.push(minimumWidth);
  }
  return [...new Set(widths)];
}

/**
 * The live streetcar card's size (GeographicStreetcarVehicleCard): padding and header, the route row, the
 * status and vehicle lines, the off-route note, the next-stop button when there is one, and the source note.
 */
export function streetcarVehicleCardSize(
  viewportWidth: number,
  options: { offRoute: boolean; withStop: boolean; replacement?: boolean },
) {
  const width = Math.max(220, Math.min(STREETCAR_CARD_WIDTH, viewportWidth - 32));
  const compact = viewportWidth <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT;
  const note = compact ? 40 : 22;
  const height = 24 + 46 + 50 + 44 + (options.offRoute ? note : 0) + (options.replacement ? note : 0)
    + (options.withStop ? 60 : 0)
    + (compact ? 40 : 34);
  return { width, height: Math.min(420, height) };
}
