/** Screen-space sizing and candidate geometry shared by authored map alert pickers. */
import type { MapBounds, MapPoint } from "../app/map-geometry.ts";
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

export function chooserKeepoutGridCandidates(
  proposed: MapPoint,
  chooserSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  keepoutBoxes: MapBounds[],
  margin: number,
): MapPoint[] {
  const minimumX = margin + chooserSize.width / 2;
  const maximumX = viewportSize.width - margin - chooserSize.width / 2;
  const minimumY = margin + chooserSize.height / 2;
  const maximumY = viewportSize.height - margin - chooserSize.height / 2;
  if (maximumX < minimumX || maximumY < minimumY) return [];

  const xCoordinates = new Set([minimumX, maximumX, Math.min(maximumX, Math.max(minimumX, proposed.x))]);
  const yCoordinates = new Set([minimumY, maximumY, Math.min(maximumY, Math.max(minimumY, proposed.y))]);
  keepoutBoxes.forEach((box) => {
    xCoordinates.add(box.x - chooserSize.width / 2);
    xCoordinates.add(box.x + box.width + chooserSize.width / 2);
    yCoordinates.add(box.y - chooserSize.height / 2);
    yCoordinates.add(box.y + box.height + chooserSize.height / 2);
  });

  return [...xCoordinates]
    .filter((x) => x >= minimumX && x <= maximumX)
    .flatMap((x) => [...yCoordinates]
      .filter((y) => y >= minimumY && y <= maximumY)
      .map((y) => ({ x, y })));
}

