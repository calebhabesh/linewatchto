/** Screen-space alert chooser placement for the MapLibre geographic map. */
import type { MapOverlapChooserLayout } from "./MapOverlapChooser";
import { chooserWidthCandidates } from "./map-chooser-layout.ts";

export type GeographicChooserKeepout = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type GeographicOverlapChooserLayout = {
  chooserSize: { width: number; height: number };
  layout: MapOverlapChooserLayout;
  viewportSize: { width: number; height: number };
};

export const GEOGRAPHIC_CHOOSER_KEEPOUT_GAP = 8;
const GEOGRAPHIC_CHOOSER_MIN_HEIGHT = 142;
const ANCHOR_CLEARANCE = 30;

function clampOffset(value: number, length: number, viewportLength: number, margin: number) {
  return Math.min(Math.max(margin, viewportLength - margin - length), Math.max(margin, value));
}

function overlapArea(
  left: number,
  top: number,
  width: number,
  height: number,
  box: GeographicChooserKeepout,
) {
  const x = Math.min(left + width, box.right) - Math.max(left, box.left);
  const y = Math.min(top + height, box.bottom) - Math.max(top, box.top);
  return x > 0 && y > 0 ? x * y : 0;
}

function candidateOffsets(
  anchor: { x: number; y: number },
  size: { width: number; height: number },
  viewportSize: { width: number; height: number },
  blocked: GeographicChooserKeepout[],
  margin: number,
) {
  const gap = GEOGRAPHIC_CHOOSER_KEEPOUT_GAP;
  const xs = [
    margin,
    anchor.x - size.width / 2,
    anchor.x + ANCHOR_CLEARANCE + gap,
    anchor.x - ANCHOR_CLEARANCE - gap - size.width,
    viewportSize.width - margin - size.width,
    ...blocked.flatMap((box) => [box.right + gap, box.left - gap - size.width]),
  ].map((left) => clampOffset(left, size.width, viewportSize.width, margin));
  const ys = [
    anchor.y - size.height / 2,
    anchor.y - gap - size.height,
    anchor.y + gap,
    viewportSize.height - margin - size.height,
    margin,
    ...blocked.flatMap((box) => [box.bottom + gap, box.top - gap - size.height]),
  ].map((top) => clampOffset(top, size.height, viewportSize.height, margin));
  const seen = new Set<string>();
  return xs.flatMap((left) => ys.map((top) => ({ left, top }))).filter(({ left, top }) => {
    const key = `${Math.round(left * 2)}:${Math.round(top * 2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Place the chooser near its alert while treating visible app controls as hard
 * keep-outs. Like the authored system maps, compact viewports narrow the
 * chooser before shortening it, so it can fit between the side control columns.
 */
export function chooseGeographicChooserLayout({
  anchor,
  viewportSize,
  requestedSize,
  keepouts,
  margin = 12,
}: {
  anchor: { x: number; y: number };
  viewportSize: { width: number; height: number };
  requestedSize: { width: number; height: number };
  keepouts: GeographicChooserKeepout[];
  margin?: number;
}): GeographicOverlapChooserLayout {
  const anchorBox = {
    left: anchor.x - ANCHOR_CLEARANCE,
    top: anchor.y - ANCHOR_CLEARANCE,
    right: anchor.x + ANCHOR_CLEARANCE,
    bottom: anchor.y + ANCHOR_CLEARANCE,
  };
  const blocked = [...keepouts, anchorBox];
  const widths = chooserWidthCandidates(requestedSize.width, viewportSize.width);
  const heights: number[] = [];
  for (let height = requestedSize.height; height > GEOGRAPHIC_CHOOSER_MIN_HEIGHT; height -= 4) heights.push(height);
  heights.push(Math.min(requestedSize.height, GEOGRAPHIC_CHOOSER_MIN_HEIGHT));

  const result = (width: number, height: number, left: number, top: number): GeographicOverlapChooserLayout => ({
    chooserSize: { width, height },
    layout: { left, top, anchorOffsetX: anchor.x - left, anchorOffsetY: anchor.y - top },
    viewportSize,
  });

  for (const height of heights) {
    for (const width of widths) {
      const size = { width, height };
      const candidates = candidateOffsets(anchor, size, viewportSize, blocked, margin);
      const nearest = (protectedBoxes: GeographicChooserKeepout[]) => candidates
        .filter(({ left, top }) => protectedBoxes.every((box) => overlapArea(left, top, width, height, box) === 0))
        .reduce<{ left: number; top: number; score: number } | null>((best, candidate) => {
          const score = Math.hypot(candidate.left + width / 2 - anchor.x, candidate.top + height / 2 - anchor.y);
          return !best || score < best.score ? { ...candidate, score } : best;
        }, null);
      // Prefer leaving the tapped badge visible, but never trade a UI control for it.
      const best = nearest(blocked) ?? nearest(keepouts);
      if (best) return result(width, height, best.left, best.top);
    }
  }

  // Nothing fits cleanly: use the smallest chooser where it covers the least UI.
  const width = widths[widths.length - 1];
  const height = Math.min(heights[heights.length - 1], Math.max(80, viewportSize.height - margin * 2));
  const fallback = candidateOffsets(anchor, { width, height }, viewportSize, blocked, margin)
    .map((candidate) => ({
      ...candidate,
      covered: keepouts.reduce((sum, box) => sum + overlapArea(candidate.left, candidate.top, width, height, box), 0),
      distance: Math.hypot(candidate.left + width / 2 - anchor.x, candidate.top + height / 2 - anchor.y),
    }))
    .sort((a, b) => a.covered - b.covered || a.distance - b.distance)[0];
  return result(width, height, fallback.left, fallback.top);
}
